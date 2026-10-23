/**
 * Server-authoritative Deepcore simulation.
 *
 * Everything a player can change passes through here: block edits, builds,
 * machine processing, research, reactor control and hazard exposure. The client
 * only renders snapshots and predicts its own walk.
 */
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockChanges, events, machines, players, worlds } from "@/db/schema";
import {
  BLOCKS,
  ITEM_BY_ID,
  MACHINE_BY_ID,
  RECIPES,
  RECIPE_BY_ID,
  TECH,
  TECH_BY_ID,
  buildableMachines,
  type Recipe,
  type ToolSpec,
} from "./content";
import {
  addItem,
  consumeAll,
  countItem,
  inventoryEverHad,
  moveStack,
  normalize,
  removeItem,
  startingInventory,
} from "./inventory";
import { areaOffsets, blockKey, depthOf, getWorldGen, inBounds, layerOfY, makeLookup, spawnPosition } from "./world";
import type {
  ActionResult,
  Action,
  ChangeView,
  GridState,
  MachineView,
  PlayerView,
  SelfState,
  Slot,
  WorldState,
} from "./types";

type WorldRow = typeof worlds.$inferSelect;
type PlayerRow = typeof players.$inferSelect;
type MachineRow = typeof machines.$inferSelect;

const TICK_MS = 1000 / 30;
const ONLINE_MS = 75_000;
const MAX_MINE_REACH = 6.4;
const BUILD_REACH = 9;

type Cache = { gen: ReturnType<typeof getWorldGen>; changes: Map<number, number> };
const cacheByWorld = new Map<number, Cache>();
const miningSessions = new Map<number, { key: number; startedAt: number }>();
let queue: Promise<unknown> = Promise.resolve();

const serialize = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

const tools = new Map<string, ToolSpec>();
for (const [id, item] of ITEM_BY_ID) if (item.tool) tools.set(id, item.tool);

const safeName = (name: unknown): string => {
  const raw = typeof name === "string" ? name.trim() : "";
  return raw.replace(/[^\w \-.]/g, "").slice(0, 18) || "Prospector";
};

const colorFor = (id: number): string => ["#f59e0b", "#38bdf8", "#a3e635", "#f472b6", "#c084fc", "#fb7185"][id % 6];

export async function ensureWorld(): Promise<WorldRow> {
  const existing = await db.select().from(worlds).limit(1);
  if (existing.length > 0) return existing[0];
  const seed = 20260214;
  try {
    const created = await db
      .insert(worlds)
      .values({
        name: "Deepcore · Shaft 01",
        seed,
        tech: ["hand_tools"],
        reactor: { temperature: 22, rods: 0, on: false, scrammed: false, meltdownAt: null, radiationUntil: null },
        flags: { everHad: [], maxDepth: 0 },
      })
      .returning();
    await db.insert(events).values({
      worldId: created[0].id,
      kind: "system",
      message: "Shaft 01 is open. Steel pickaxe issued. Cut timber, build a Workbench, go down.",
    });
    return created[0];
  } catch {
    const again = await db.select().from(worlds).limit(1);
    if (again.length === 0) throw new Error("Unable to create world");
    return again[0];
  }
}

async function ensureCache(world: WorldRow): Promise<Cache> {
  const cached = cacheByWorld.get(world.id);
  if (cached) return cached;
  const rows = await db.select().from(blockChanges).where(eq(blockChanges.worldId, world.id));
  const changes = new Map<number, number>();
  for (const row of rows) changes.set(blockKey(row.x, row.y, row.z), row.block);
  const cache: Cache = { gen: getWorldGen(world.seed), changes };
  cacheByWorld.set(world.id, cache);
  return cache;
}

export async function getPlayer(world: WorldRow, token: string, name?: unknown): Promise<PlayerRow> {
  const existing = await db.select().from(players).where(eq(players.token, token)).limit(1);
  if (existing.length > 0) return existing[0];
  const gen = getWorldGen(world.seed);
  const [x, y, z] = spawnPosition(gen);
  const inserted = await db
    .insert(players)
    .values({
      worldId: world.id,
      token,
      name: safeName(name),
      color: colorFor(Math.floor(Math.random() * 6)),
      x,
      y,
      z,
      inventory: startingInventory(),
    })
    .returning();
  await db.insert(events).values({
    worldId: world.id,
    kind: "join",
    author: inserted[0].name,
    message: `${inserted[0].name} reached the camp with a steel pickaxe.`,
  });
  return inserted[0];
}

const toolFor = (player: PlayerRow): { item: string; spec: ToolSpec } | null => {
  const inv = normalize(player.inventory);
  let best: { item: string; spec: ToolSpec } | null = null;
  for (let slot = 0; slot < inv.length; slot++) {
    const entry = inv[slot];
    if (!entry) continue;
    const spec = tools.get(entry.item);
    if (!spec) continue;
    if (!best || spec.tier > best.spec.tier) best = { item: entry.item, spec };
  }
  return best;
};

const toolSlotFor = (player: PlayerRow): number => {
  const inv = normalize(player.inventory);
  let best = 0;
  let tier = -1;
  for (let slot = 0; slot < inv.length; slot++) {
    const spec = inv[slot] ? tools.get(inv[slot]!.item) : undefined;
    if (spec && spec.tier > tier) {
      tier = spec.tier;
      best = slot;
    }
  }
  return best;
};

const hasItem = (player: PlayerRow, item: string): boolean => countItem(normalize(player.inventory), item) > 0;

const markEverHad = (world: WorldRow, inv: Slot[]): Promise<unknown> => {
  const ever = new Set(world.flags.everHad);
  let changed = false;
  for (const id of inventoryEverHad(inv)) {
    if (!ever.has(id)) {
      ever.add(id);
      changed = true;
    }
  }
  if (!changed) return Promise.resolve();
  return db.update(worlds).set({ flags: { ...world.flags, everHad: [...ever] } }).where(eq(worlds.id, world.id));
};

const pushEvent = (world: WorldRow, kind: string, message: string, author?: string) =>
  db.insert(events).values({ worldId: world.id, kind, message: message.slice(0, 240), author: author ?? null });

function gridOf(rows: MachineRow[]): GridState {
  const water = rows.some((m) => m.type === "hand_pump");
  const batteries = rows.filter((m) => m.type === "battery_bank" && m.enabled).length;
  let supply = 0;
  let demand = 0;
  for (const row of rows) {
    if (!row.enabled) continue;
    const def = MACHINE_BY_ID.get(row.type);
    if (!def) continue;
    if (def.producerKw) {
      if (def.fuel && row.fuel <= 0) continue;
      if (def.requiresWater && !water) continue;
      supply += def.producerKw;
    }
    if (def.kw) demand += def.kw;
  }
  let factor = demand === 0 ? 1 : Math.min(1, supply / demand);
  if (batteries > 0 && factor < 1) factor = Math.min(1, factor + 0.3 * Math.min(batteries, 2));
  return { supply, demand, factor: Number(factor.toFixed(3)), batteries, water };
}

type TickResult = {
  reasons: Map<number, string>;
  machines: MachineRow[];
  grid: GridState;
  reactor: WorldRow["reactor"];
  flags: WorldRow["flags"];
};

function recipeFor(row: MachineRow): Recipe | null {
  if (!row.recipeId) return null;
  return RECIPE_BY_ID.get(row.recipeId) ?? null;
}

function canFit(outputs: Slot[], outputsSpec: [string, number][], slots: number): boolean {
  const copy = outputs.map((s) => (s ? { ...s } : null));
  for (const [item, count] of outputsSpec) {
    let left = count;
    for (let i = 0; i < slots && left > 0; i++) {
      const slot = copy[i];
      if (slot && slot.item === item) {
        const room = (ITEM_BY_ID.get(item)?.stack ?? 64) - slot.count;
        const put = Math.min(room, left);
        slot.count += put;
        left -= put;
      } else if (!slot) {
        const put = Math.min(ITEM_BY_ID.get(item)?.stack ?? 64, left);
        copy[i] = { item, count: put };
        left -= put;
      }
    }
    if (left > 0) return false;
  }
  return true;
}

async function runTick(world: WorldRow): Promise<TickResult> {
  const now = Date.now();
  const elapsedMs = Math.min(30_000, Math.max(0, now - world.lastTickAt.getTime()));
  const dt = elapsedMs / 1000;
  const rows = await db.select().from(machines).where(eq(machines.worldId, world.id));
  const gridBase = gridOf(rows);
  const reasons = new Map<number, string>();
  const water = gridBase.water;
  // The scram interlock needs coolant; a dry reactor can melt down.
  const ownsScram = water && rows.some((m) => m.type === "reactor");

  // Reactor first: it changes the grid supply for this tick.
  const reactorRow = rows.find((m) => m.type === "reactor");
  const reactor = { ...world.reactor };
  let reactorKw = 0;
  if (reactorRow && dt > 0) {
    const rodsLoaded = reactorRow.inputs.reduce((n, s) => n + (s?.item === "fuel_rod" ? s.count : 0), 0);
    if (reactor.on && !reactor.scrammed && rodsLoaded > 0) {
      const target = 26 + reactor.rods * 9;
      reactor.temperature += (target - reactor.temperature) * 0.05 * dt;
      reactorKw = Math.round(2400 * (0.3 + 0.7 * (reactor.rods / 100)));
      const burn = reactorRow.burn + dt;
      if (burn >= 180) {
        reactorRow.burn = burn - 180;
        const idx = reactorRow.inputs.findIndex((s) => s?.item === "fuel_rod");
        if (idx >= 0) {
          const slot = reactorRow.inputs[idx];
          if (!slot) {
            /* slot removed between checks; ignore */
          } else if (slot.count <= 1) reactorRow.inputs[idx] = null;
          else slot.count -= 1;
        }
      } else reactorRow.burn = burn;
    } else {
      reactor.temperature += (22 - reactor.temperature) * 0.02 * dt;
      reactorKw = 0;
    }
    if (reactor.temperature > 780 && reactor.rods > 0) {
      if (ownsScram) {
        reactor.on = false;
        reactor.scrammed = true;
        reactor.rods = 0;
        reactor.temperature = Math.min(reactor.temperature, 320);
        await pushEvent(world, "alarm", "REACTOR SCRAM: core temperature exceeded 780 °C. Rods inserted automatically.");
      } else {
        reactor.meltdownAt = now;
        reactor.radiationUntil = now + 20 * 60_000;
        reactor.on = false;
        reactor.temperature = 1200;
        await pushEvent(world, "alarm", "MELTDOWN. Reactor destroyed. Shaft 01 is irradiated for 20 minutes.");
        await db.delete(machines).where(eq(machines.id, reactorRow.id));
      }
    }
    if (reactor.temperature > 640 && reactor.temperature <= 780) {
      reasons.set(reactorRow.id, "Core overheating");
    }
  }

  const supply = gridBase.supply + reactorKw;
  const demand = gridBase.demand;
  let factor = demand === 0 ? 1 : Math.min(1, supply / demand);
  if (gridBase.batteries > 0 && factor < 1) factor = Math.min(1, factor + 0.3 * Math.min(gridBase.batteries, 2));

  const updates: Promise<unknown>[] = [];
  const reactors = new Set<number>(reactorRow ? [reactorRow.id] : []);

  for (const row of rows) {
    const def = MACHINE_BY_ID.get(row.type);
    if (!def) continue;

    if (def.producerKw && !reactors.has(row.id)) {
      if (!row.enabled) reasons.set(row.id, "Switched off");
      else if (def.requiresWater && !water) reasons.set(row.id, "No water — build a Hand Pump");
      else if (def.fuel && row.fuel <= 0) reasons.set(row.id, "Out of coal");
    }

    if (def.kw && !row.enabled) reasons.set(row.id, "Switched off");

    const recipe = recipeFor(row);
    const hasRecipes = RECIPES.some((r) => r.machine === row.type);
    if (hasRecipes && !recipe) {
      reasons.set(row.id, DEFERRED_REASON[row.type] ?? "No recipe selected");
      continue;
    }

    let produced = false;

    if (def.fuel) {
      if (row.fuel <= 0) {
        if (!def.producerKw) reasons.set(row.id, "Out of coal");
        continue;
      }
      row.burn += dt;
      if (row.burn >= 80) {
        row.burn = Math.max(0, row.burn - 80);
        row.fuel = Math.max(0, row.fuel - 1);
      }
    }

    if (def.kw && row.enabled) {
      if (supply <= 0) {
        reasons.set(row.id, "No power");
        continue;
      }
      if (factor < 0.999) reasons.set(row.id, `Brownout ${Math.round(factor * 100)}%`);
    }

    if (row.enabled && recipe && canFit(row.outputs, recipe.outputs, def.outputSlots ?? 3)) {
      let speed = factor;
      if (row.type === "centrifuge") {
        const cascade = rows.filter((m) => m.type === "centrifuge").length;
        speed *= 1 + 0.3 * Math.max(0, cascade - 1);
      }
      if (def.requiresWater && !water) speed = 0;
      if (speed > 0) {
        let missing: string | null = null;
        for (const [item, count] of recipe.inputs) {
          if (countItem(row.inputs, item) < count) {
            missing = ITEM_BY_ID.get(item)?.name ?? item;
            break;
          }
        }
        if (missing) reasons.set(row.id, `Missing ${missing}`);
        else {
          row.progress += dt * speed;
          produced = true;
          if (row.progress >= recipe.time) {
            row.progress = 0;
            for (const [item, count] of recipe.inputs) removeItem(row.inputs, item, count);
            for (const [item, count] of recipe.outputs) addItem(row.outputs, item, count);
            if (recipe.outputs.some(([o]) => o === "enriched_canister")) {
              await pushEvent(world, "machine", "Centrifuge cascade produced an enriched canister.");
            }
          }
        }
      }
    } else if (row.enabled && recipe && !canFit(row.outputs, recipe.outputs, def.outputSlots ?? 3)) {
      reasons.set(row.id, "Output full");
    }

    if (produced || def.fuel || reactors.has(row.id)) {
      updates.push(
        db
          .update(machines)
          .set({
            progress: row.progress,
            fuel: row.fuel,
            burn: row.burn,
            inputs: row.inputs,
            outputs: row.outputs,
          })
          .where(eq(machines.id, row.id)),
      );
    }
  }

  // Vitals: heat, radiation, regen and radiation-zone exposure.
  const cache = await ensureCache(world);
  const online = await db.select().from(players).where(eq(players.worldId, world.id));
  const sp = spawnPosition(cache.gen);
  const ventNear = (x: number, z: number) =>
    rows.some((m) => m.type === "vent_fan" && m.enabled && Math.hypot(m.x - x, m.z - z) < 10);
  const flags = { ...world.flags };

  for (const player of online) {
    if (now - player.lastSeenAt.getTime() > ONLINE_MS || dt <= 0) continue;
    const inv = normalize(player.inventory);
    const suit = inv.some((s) => s?.item === "cooling_suit");
    const hazmat = inv.some((s) => s?.item === "hazmat_suit");
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);
    const pz = Math.floor(player.z);
    const layer = layerOfY(py);
    const vent = ventNear(player.x, player.z);

    let heatGain = Math.max(0, layer.ambient - 30) / 90;
    if (suit) heatGain *= 0.3;
    if (vent) heatGain *= 0.7;
    let heat = player.heat + heatGain * dt - (heatGain === 0 ? 1.2 * dt : 0);
    heat = Math.max(0, Math.min(200, heat));

    let doseRate = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const b = cache.changes.get(blockKey(px + dx, py + dy, pz + dz)) ?? cache.gen.baseBlock(px + dx, py + dy, pz + dz);
          const rad = BLOCKS[b]?.radiation;
          if (rad) doseRate += rad * (1 - Math.hypot(dx, dy, dz) / 4.2);
        }
      }
    }
    if (reactor.radiationUntil && reactor.radiationUntil > now) {
      const dist = Math.hypot(player.x - sp[0], player.z - sp[2]);
      if (dist < 40) doseRate += 1.2 * (1 - dist / 40);
    }
    if (hazmat) doseRate *= 0.2;
    let radiation = Math.max(0, player.radiation + (doseRate > 0 ? doseRate * dt * 2.2 : -0.6 * dt));
    radiation = Math.min(1000, radiation);

    let health = player.health;
    if (radiation > 600) health -= ((radiation - 600) / 100) * dt;
    if (heat > 100) health -= ((heat - 100) / 40) * dt;
    if (radiation < 300 && heat < 80 && health < 100) health = Math.min(100, health + 0.5 * dt);
    let { x, y, z } = player;
    let dead = health <= 0;
    if (dead) {
      health = 100;
      radiation = 0;
      heat = 0;
      x = sp[0];
      y = sp[1];
      z = sp[2];
      await pushEvent(world, "death", `${player.name} was recovered by the camp medic. Gear preserved.`, player.name);
    }

    updates.push(
      db
        .update(players)
        .set({ heat, radiation, health, x, y, z })
        .where(eq(players.id, player.id)),
    );
  }

  updates.push(
    db
      .update(worlds)
      .set({ reactor, lastTickAt: new Date(now), flags })
      .where(eq(worlds.id, world.id)),
  );

  await Promise.all(updates);

  const fresh = rows.map((row) => ({ ...row }));
  if (reactorRow) {
    const stored = fresh.find((r) => r.id === reactorRow.id);
    if (stored) Object.assign(stored, reactorRow);
  }
  return {
    reasons,
    machines: fresh,
    grid: { ...gridBase, supply, demand, factor: Number(factor.toFixed(3)) },
    reactor,
    flags,
  };
}

const DEFERRED_REASON: Record<string, string> = {};

async function snapshot(
  world: WorldRow,
  playerId: number,
  since: number | null,
  tick: TickResult,
  extraChanges: ChangeView[] = [],
): Promise<WorldState> {
  const rows = await db.select().from(players).where(eq(players.worldId, world.id));
  const me = rows.find((p) => p.id === playerId);
  if (!me) throw new Error("Player missing");
  const now = Date.now();
  const machineViews: MachineView[] = tick.machines.map((row) => {
    return {
      id: row.id,
      type: row.type,
      x: row.x,
      y: row.y,
      z: row.z,
      enabled: row.enabled,
      recipeId: row.recipeId,
      progress: row.progress,
      fuel: row.fuel,
      inputs: row.inputs,
      outputs: row.outputs,
      idle: tick.reasons.get(row.id) ?? null,
    };
  });

  const online = rows
    .filter((p) => now - p.lastSeenAt.getTime() < ONLINE_MS)
    .map<PlayerView>((p) => {
      const tool = toolFor(p);
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        health: p.health,
        depth: depthOf(Math.floor(p.y)),
        layer: layerOfY(Math.floor(p.y)).name,
        tool: tool?.item ?? null,
        online: true,
      };
    });

  const changeRows =
    since === null
      ? []
      : await db
          .select()
          .from(blockChanges)
          .where(since > 0 ? and(eq(blockChanges.worldId, world.id), gt(blockChanges.id, since)) : eq(blockChanges.worldId, world.id))
          .orderBy(blockChanges.id)
          .limit(6000);

  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.worldId, world.id))
    .orderBy(desc(events.id))
    .limit(40);

  const inv = normalize(me.inventory);
  const tool = toolFor(me);
  const self: SelfState = {
    id: me.id,
    name: me.name,
    color: me.color,
    inventory: inv,
    vitals: {
      health: me.health,
      stamina: me.stamina,
      oxygen: me.oxygen,
      heat: me.heat,
      radiation: me.radiation,
    },
    maxDepth: world.flags.maxDepth,
    tool: tool?.item ?? null,
    toolSlot: toolSlotFor(me),
    x: me.x,
    y: me.y,
    z: me.z,
  };

  return {
    ok: true,
    worldId: world.id,
    seed: world.seed,
    serverTime: now,
    cursor: changeRows.length ? changeRows[changeRows.length - 1].id : since && since > 0 ? since : 0,
    tech: world.tech,
    self,
    players: online,
    machines: machineViews,
    changes: [
      ...changeRows.map((r) => ({ id: r.id, x: r.x, y: r.y, z: r.z, block: r.block })),
      ...extraChanges,
    ],
    events: eventRows.map((e) => ({
      id: e.id,
      kind: e.kind,
      author: e.author,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
    })),
    reactor: tick.reactor ?? world.reactor,
    grid: tick.grid,
    flags: tick.flags ?? world.flags,
  };
}

export async function getState(token: string, since: number, name?: string): Promise<WorldState> {
  return serialize(async () => {
    const world = await ensureWorld();
    const player = await getPlayer(world, token, name);
    const tick = await runTick(world);
    await db.update(players).set({ lastSeenAt: new Date() }).where(eq(players.id, player.id));
    return snapshot(world, player.id, since, tick);
  });
}

export async function dispatch(token: string, name: unknown, action: Action): Promise<ActionResult> {
  return serialize(async () => {
    const world = await ensureWorld();
    const player = await getPlayer(world, token, name);
    const cache = await ensureCache(world);
    const tick = await runTick(world);
    const now = Date.now();
    const inv = normalize(player.inventory);
    const lookup = makeLookup(cache.gen, cache.changes);
    const eye: [number, number, number] = [player.x, player.y + 1.5, player.z];
    const newChanges: ChangeView[] = [];
    let message: string | undefined;
    let toast: ActionResult["toast"];
    let oreScan: ActionResult["oreScan"];
    const fail = (text: string): ActionResult => ({ ok: false, message: text, toast: { kind: "error", text } });
    const setInventory = async () => {
      await db.update(players).set({ inventory: inv }).where(eq(players.id, player.id));
      await markEverHad(world, inv);
    };

    const reachOk = (x: number, y: number, z: number, limit = MAX_MINE_REACH) =>
      Math.hypot(x + 0.5 - eye[0], y + 0.5 - eye[1], z + 0.5 - eye[2]) <= limit;

    const machineNear = (id: number, limit = 10) => {
      const row = tick.machines.find((m) => m.id === id);
      if (!row) return null;
      if (Math.hypot(row.x + 0.5 - player.x, row.y - player.y, row.z + 0.5 - player.z) > limit) return null;
      return row;
    };

    switch (action.action) {
      case "move": {
        const dist = Math.hypot(action.x - player.x, action.y - player.y, action.z - player.z);
        const dtSec = Math.max(0.2, (now - player.lastSeenAt.getTime()) / 1000);
        const maxDist = Math.max(6, dtSec * 24);
        if (!Number.isFinite(dist) || dist > maxDist || action.x < -4 || action.x > 100 || action.z < -4 || action.z > 100 || action.y < -4 || action.y > 90) {
          return fail("Movement rejected");
        }
        const stamina = action.sprint ? Math.max(0, player.stamina - 6) : Math.min(100, player.stamina + 8);
        const depth = depthOf(Math.floor(action.y));
        const flags = depth > world.flags.maxDepth ? { ...world.flags, maxDepth: depth } : world.flags;
        if (flags !== world.flags) await db.update(worlds).set({ flags }).where(eq(worlds.id, world.id));
        await db
          .update(players)
          .set({
            x: action.x,
            y: action.y,
            z: action.z,
            yaw: action.yaw,
            pitch: action.pitch,
            stamina,
            lastSeenAt: new Date(now),
          })
          .where(eq(players.id, player.id));
        const state = await snapshot(world, player.id, null, tick);
        return { ok: true, state };
      }

      case "minestart": {
        const { x, y, z } = action;
        if (!inBounds(x, y, z)) return fail("Outside the mine");
        if (!reachOk(x, y, z, MAX_MINE_REACH + (hasItem(player, "nuclear_drill") ? 1 : 0))) return fail("Too far away");
        const block = BLOCKS[lookup(x, y, z)];
        if (!block || block.id === 0) return fail("Nothing to mine");
        const tool = toolFor(player);
        if (!tool) return fail("Hold a pickaxe or drill");
        if (tool.spec.tier < block.minTier) return fail(`Too hard — needs Tier ${block.minTier}`);
        const eyeToTarget = Math.hypot(x + 0.5 - eye[0], y + 0.5 - eye[1], z + 0.5 - eye[2]);
        const steps = Math.max(1, Math.floor(eyeToTarget * 4));
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const sx = Math.floor(eye[0] + (x + 0.5 - eye[0]) * t);
          const sy = Math.floor(eye[1] + (y + 0.5 - eye[1]) * t);
          const sz = Math.floor(eye[2] + (z + 0.5 - eye[2]) * t);
          if (sx === x && sy === y && sz === z) break;
          if (lookup(sx, sy, sz) !== 0) return fail("Line of sight blocked");
        }
        miningSessions.set(player.id, { key: blockKey(x, y, z), startedAt: now });
        return { ok: true, message: `${block.name}: ${(block.hardness / tool.spec.speed).toFixed(2)}s` };
      }

      case "minefinish": {
        const { x, y, z } = action;
        const session = miningSessions.get(player.id);
        if (!session || session.key !== blockKey(x, y, z)) return fail("Mining session expired");
        const block = BLOCKS[lookup(x, y, z)];
        if (!block) return fail("Nothing to mine");
        const tool = toolFor(player);
        if (!tool || tool.spec.tier < block.minTier) return fail(`Too hard — needs Tier ${block.minTier}`);
        const required = (block.hardness / tool.spec.speed) * 1000 * 0.8;
        if (now - session.startedAt < required) return fail("Mining too fast");
        if (!reachOk(x, y, z, MAX_MINE_REACH + (tool.spec.area > 1 ? 1 : 0))) return fail("Too far away");
        miningSessions.delete(player.id);

        const targets: [number, number, number][] = [[x, y, z]];
        if (tool.spec.area > 1) {
          for (const [ox, oy, oz] of areaOffsets([action.nx || 0, action.ny || 0, action.nz || 1])) {
            if (ox === 0 && oy === 0 && oz === 0) continue;
            targets.push([x + ox, y + oy, z + oz]);
          }
        }

        let mined = 0;
        const collected: [string, number][] = [];
        for (const [tx, ty, tz] of targets) {
          if (!inBounds(tx, ty, tz)) continue;
          const b = lookup(tx, ty, tz);
          const def = BLOCKS[b];
          if (!def || def.id === 0 || def.id === 1) continue;
          if (def.minTier > tool.spec.tier) continue;
          if (tick.machines.some((m) => m.x === tx && m.y === ty && m.z === tz)) continue;
          if (targets.length > 1 && !reachOk(tx, ty, tz, MAX_MINE_REACH + 2)) continue;
          cache.changes.set(blockKey(tx, ty, tz), 0);
          newChanges.push({ id: -1 - newChanges.length, x: tx, y: ty, z: tz, block: 0 });
          for (const [item, count] of def.drops) collected.push([item, count]);
          mined++;
        }
        if (mined === 0) return fail("No breakable blocks in that face");
        const inserted = await db
          .insert(blockChanges)
          .values(newChanges.map((c) => ({ worldId: world.id, x: c.x, y: c.y, z: c.z, block: 0, playerId: player.id })))
          .returning();
        for (let i = 0; i < newChanges.length; i++) newChanges[i].id = inserted[i].id;
        let overflow = 0;
        for (const [item, count] of collected) overflow += addItem(inv, item, count);
        await setInventory();
        if (overflow > 0) {
          toast = { kind: "info", text: "Backpack full — some drops were left underground." };
        }
        message = `Mined ${mined} block${mined === 1 ? "" : "s"}`;
        break;
      }

      case "build": {
        const def = MACHINE_BY_ID.get(action.machine);
        if (!def) return fail("Unknown structure");
        if (!world.tech.includes(def.tech)) return fail("Blueprint locked — research it first");
        const { x, y, z } = action;
        if (!inBounds(x, y, z)) return fail("Outside the mine");
        if (lookup(x, y, z) !== 0) return fail("Need an empty block");
        if (tick.machines.some((m) => m.x === x && m.y === y && m.z === z)) return fail("Block occupied");
        if (Math.hypot(x + 0.5 - player.x, y + 0.5 - player.y, z + 0.5 - player.z) > BUILD_REACH) return fail("Too far away");
        const below = lookup(x, y - 1, z);
        const supported = below !== 0 || tick.machines.some((m) => m.x === x && m.y === y - 1 && m.z === z);
        if (!supported) return fail("Needs solid ground beneath it");
        if (!consumeAll(inv, def.cost)) return fail(`Missing materials for ${def.name}`);
        const recipe = RECIPES.find((r) => r.machine === def.id) ?? null;
        const [row] = await db
          .insert(machines)
          .values({
            worldId: world.id,
            type: def.id,
            x,
            y,
            z,
            enabled: true,
            recipeId: recipe?.id ?? null,
            inputs: new Array<Slot>(def.inputSlots ?? 0).fill(null),
            outputs: new Array<Slot>(def.outputSlots ?? 0).fill(null),
          })
          .returning();
        await setInventory();
        await pushEvent(world, "build", `${player.name} built ${def.name}.`, player.name);
        message = `${def.name} placed`;
        tick.machines.push(row);
        break;
      }

      case "dismantle": {
        const row = machineNear(action.machineId, BUILD_REACH + 2);
        if (!row) return fail("Too far away");
        const def = MACHINE_BY_ID.get(row.type);
        await db.delete(machines).where(eq(machines.id, row.id));
        if (def) for (const [item, count] of def.cost) addItem(inv, item, count);
        await setInventory();
        message = `${def?.name ?? "Structure"} dismantled`;
        break;
      }

      case "machineRecipe": {
        const row = machineNear(action.machineId);
        if (!row) return fail("Too far away");
        if (!action.recipeId) {
          await db.update(machines).set({ recipeId: null, progress: 0 }).where(eq(machines.id, row.id));
          break;
        }
        const recipe = RECIPE_BY_ID.get(action.recipeId);
        if (!recipe || recipe.machine !== row.type) return fail("Recipe does not belong to this machine");
        if (recipe.tech && !world.tech.includes(recipe.tech)) return fail("Recipe locked");
        await db.update(machines).set({ recipeId: recipe.id, progress: 0 }).where(eq(machines.id, row.id));
        message = `Set ${recipe.name}`;
        break;
      }

      case "machineToggle": {
        const row = machineNear(action.machineId);
        if (!row) return fail("Too far away");
        await db.update(machines).set({ enabled: !row.enabled }).where(eq(machines.id, row.id));
        message = row.enabled ? "Switched off" : "Running";
        break;
      }

      case "machineLoad": {
        const row = machineNear(action.machineId);
        if (!row) return fail("Too far away");
        const def = MACHINE_BY_ID.get(row.type);
        if (!def) return fail("Unknown machine");
        const amount = Math.max(1, Math.min(64, Math.floor(action.count) || 1));
        if (countItem(inv, action.item) < 1) return fail("Not in your backpack");
        if (action.target === "fuel") {
          if (!def.fuel) return fail("This structure has no fuel slot");
          if (action.item !== "coal") return fail("Only coal burns here");
          const moved = removeItem(inv, "coal", Math.min(amount, countItem(inv, "coal")));
          await db.update(machines).set({ fuel: row.fuel + moved }).where(eq(machines.id, row.id));
        } else {
          if (!def.inputSlots) return fail("This structure has no input slots");
          if (def.fuel && action.item === "coal" && countItem(row.inputs, "coal") === 0 && row.fuel === 0) {
            const moved = removeItem(inv, "coal", Math.min(amount, countItem(inv, "coal")));
            await db.update(machines).set({ fuel: row.fuel + moved }).where(eq(machines.id, row.id));
          } else {
            const moved = removeItem(inv, action.item, amount);
            addItem(row.inputs, action.item, moved);
            await db.update(machines).set({ inputs: row.inputs }).where(eq(machines.id, row.id));
          }
        }
        await setInventory();
        message = `Loaded ${action.item.replace(/_/g, " ")}`;
        break;
      }

      case "machineTake": {
        const row = machineNear(action.machineId);
        if (!row) return fail("Too far away");
        const index = Math.floor(action.index);
        const slot = row.outputs[index];
        if (!slot) return fail("Empty output slot");
        if (addItem(inv, slot.item, slot.count) > 0) return fail("Backpack full");
        row.outputs[index] = null;
        await db.update(machines).set({ outputs: row.outputs }).where(eq(machines.id, row.id));
        await setInventory();
        message = `Collected ${slot.count}× ${ITEM_BY_ID.get(slot.item)?.name ?? slot.item}`;
        break;
      }

      case "research": {
        const node = TECH_BY_ID.get(action.node);
        if (!node) return fail("Unknown research");
        if (world.tech.includes(node.id)) return fail("Already researched");
        if (!node.parents.every((p) => world.tech.includes(p))) return fail("Parent research missing");
        if (!consumeAll(inv, node.cost)) return fail("Not enough materials delivered");
        const tech = [...world.tech, node.id];
        await db.update(worlds).set({ tech }).where(eq(worlds.id, world.id));
        await setInventory();
        await pushEvent(world, "research", `${player.name} completed research: ${node.name}.`, player.name);
        message = `${node.name} researched`;
        break;
      }

      case "decon": {
        const row = machineNear(action.machineId);
        if (!row || row.type !== "decon_shower") return fail("Stand near a Decon Shower");
        await db.update(players).set({ radiation: 0 }).where(eq(players.id, player.id));
        message = "Dose flushed";
        break;
      }

      case "reactor": {
        const row = tick.machines.find((m) => m.type === "reactor");
        if (!row) return fail("No reactor built");
        const reactor = { ...world.reactor };
        if (typeof action.rods === "number") {
          reactor.rods = Math.max(0, Math.min(100, Math.round(action.rods)));
          reactor.scrammed = false;
          if (reactor.rods > 0 && !reactor.on) reactor.on = true;
        }
        if (typeof action.on === "boolean") reactor.on = action.on;
        if (action.scram) {
          reactor.on = false;
          reactor.scrammed = true;
          reactor.rods = 0;
          await pushEvent(world, "alarm", "Manual SCRAM from the reactor console.");
        }
        if (action.loadRod) {
          if (countItem(inv, "fuel_rod") < 1) return fail("No fuel rod in the backpack");
          if (!row.inputs.length) return fail("Reactor core has no rod rack — rebuild the reactor");
          const remainder = addItem(row.inputs, "fuel_rod", 1);
          if (remainder > 0) return fail("Rod rack full");
          removeItem(inv, "fuel_rod", 1);
          await db.update(machines).set({ inputs: row.inputs }).where(eq(machines.id, row.id));
          await setInventory();
        }
        await db.update(worlds).set({ reactor }).where(eq(worlds.id, world.id));
        message = `Rods ${reactor.rods}%`;
        break;
      }

      case "chat": {
        const text = String(action.text ?? "").slice(0, 160).trim();
        if (!text) return fail("Empty message");
        await pushEvent(world, "chat", text, player.name);
        break;
      }

      case "respawn": {
        const sp = spawnPosition(cache.gen);
        await db
          .update(players)
          .set({ x: sp[0], y: sp[1], z: sp[2], health: 100, radiation: 0, heat: 0 })
          .where(eq(players.id, player.id));
        message = "Returned to camp";
        break;
      }

      case "moveItems": {
        const from = Math.floor(action.from);
        const to = Math.floor(action.to);
        const count = Math.max(1, Math.floor(action.count) || 1);
        if (from < 0 || to < 0 || from >= inv.length || to >= inv.length) return fail("Invalid slot");
        const source = inv[from];
        if (!source) return fail("Empty slot");
        const targetSlot = inv[to];
        if (targetSlot && targetSlot.item !== source.item) {
          const swap = { ...targetSlot };
          inv[to] = { ...source };
          inv[from] = swap;
        } else if (!moveStack(inv, from, to, count)) {
          return fail("Cannot move that stack");
        }
        await setInventory();
        break;
      }

      case "scan": {
        if (!hasItem(player, "ore_scanner")) return fail("Ore Scanner not carried");
        oreScan = cache.gen.nearbyOres(player.x, player.y, player.z, 16, 12);
        message = oreScan.length ? `${oreScan.length} ore signatures nearby` : "No ore signatures within 16 blocks";
        break;
      }

      default:
        return fail("Unknown action");
    }

    await db.update(players).set({ lastSeenAt: new Date(now) }).where(eq(players.id, player.id));
    const refreshed = await db.select().from(players).where(eq(players.id, player.id)).limit(1);
    const tickAfter = { ...tick, machines: await db.select().from(machines).where(eq(machines.worldId, world.id)) };
    const state = await snapshot(world, player.id, null, tickAfter, newChanges);
    if (refreshed[0]) {
      state.self.inventory = normalize(refreshed[0].inventory);
      state.self.vitals = {
        health: refreshed[0].health,
        stamina: refreshed[0].stamina,
        oxygen: refreshed[0].oxygen,
        heat: refreshed[0].heat,
        radiation: refreshed[0].radiation,
      };
      state.self.x = refreshed[0].x;
      state.self.y = refreshed[0].y;
      state.self.z = refreshed[0].z;
      state.tech = (await db.select().from(worlds).where(eq(worlds.id, world.id)).limit(1))[0]?.tech ?? world.tech;
    }
    return { ok: true, message, toast, state, changes: newChanges, oreScan };
  });
}

export async function worldSummary() {
  const world = await ensureWorld();
  const online = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(players)
    .where(eq(players.worldId, world.id));
  return {
    seed: world.seed,
    tech: world.tech,
    everHad: world.flags.everHad,
    maxDepth: world.flags.maxDepth,
    players: online[0]?.count ?? 0,
    buildable: buildableMachines(world.tech).length,
  };
}

export const publicRecipes = () => RECIPES.map((r) => ({ id: r.id, name: r.name, machine: r.machine, outputs: r.outputs }));
export const publicTech = () => TECH.map((t) => ({ id: t.id, name: t.name, era: t.era, parents: t.parents }));

export const closeSessions = () => miningSessions.clear();
