"use client";

import { useMemo, useState } from "react";
import {
  ERA_NAMES,
  ITEM_BY_ID,
  LAYERS,
  MACHINE_BY_ID,
  MACHINES,
  OBJECTIVES,
  RECIPES,
  TECH,
  TECH_BY_ID,
  type MachineDef,
} from "@/game/content";
import { countItem } from "@/game/inventory";
import type { Action, SelfState, Slot, WorldState } from "@/game/types";

export const initials = (name: string): string =>
  name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

export const money = (n: number): string => n.toLocaleString("en-US");

export function ItemGlyph({ item, size = "md" }: { item: string; size?: "sm" | "md" }) {
  const def = ITEM_BY_ID.get(item);
  const color = def?.color ?? "#8b8f96";
  return (
    <span
      className={`relative grid place-items-center rounded-[3px] font-mono font-bold text-[#07100f] ${
        size === "sm" ? "h-6 w-6 text-[9px]" : "h-9 w-9 text-[11px]"
      }`}
      style={{
        background: `linear-gradient(145deg, ${color}, ${color}99 70%, #10151a)`,
        boxShadow: def?.glow ? `0 0 10px ${color}88` : `inset 0 0 0 1px #ffffff22`,
      }}
      title={def?.name ?? item}
    >
      {initials(def?.name ?? item)}
      {def?.tool ? <span className="absolute -right-1 -top-1 rounded bg-amber-400 px-[3px] text-[8px] text-black">{def.tool.tier}</span> : null}
    </span>
  );
}

export function CostList({ cost, self }: { cost: [string, number][]; self: SelfState }) {
  if (!cost.length) return <span className="text-emerald-300/80">No material delivery</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {cost.map(([item, n]) => {
        const have = countItem(self.inventory, item);
        const ok = have >= n;
        return (
          <span
            key={item}
            className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
              ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/25 bg-rose-500/10 text-rose-200"
            }`}
          >
            <ItemGlyph item={item} size="sm" />
            {ITEM_BY_ID.get(item)?.name ?? item} {have}/{n}
          </span>
        );
      })}
    </div>
  );
}

export function SlotCell({
  slot,
  selected,
  onClick,
  tag,
}: {
  slot: Slot;
  selected?: boolean;
  onClick?: () => void;
  tag?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-12 w-12 items-center justify-center rounded-sm border transition ${
        selected ? "border-amber-300 bg-amber-400/15 shadow-[0_0_12px_#fbbf2444]" : "border-white/10 bg-black/40 hover:border-amber-300/40"
      }`}
      title={slot ? `${ITEM_BY_ID.get(slot.item)?.name ?? slot.item} × ${slot.count}` : "Empty"}
    >
      {slot ? (
        <>
          <ItemGlyph item={slot.item} />
          <span className="absolute bottom-0 right-1 font-mono text-[10px] text-amber-100">{slot.count}</span>
        </>
      ) : null}
      {tag ? <span className="absolute left-0.5 top-0 font-mono text-[8px] text-white/30">{tag}</span> : null}
    </button>
  );
}

export function Hotbar({
  self,
  selected,
  onSelect,
}: {
  self: SelfState;
  selected: number;
  onSelect: (slot: number) => void;
}) {
  return (
    <div className="pointer-events-auto flex items-end gap-1 rounded-md border border-amber-300/20 bg-[#070c10]/85 p-1.5 shadow-[0_12px_40px_#000000aa] backdrop-blur">
      {Array.from({ length: 9 }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          className={`relative flex h-12 w-12 flex-col items-center justify-center rounded-sm border transition ${
            selected === i ? "border-amber-300 bg-amber-300/15" : "border-white/10 bg-black/50 hover:border-amber-200/40"
          }`}
        >
          <span className="absolute left-1 top-0 font-mono text-[8px] text-white/40">{i + 1}</span>
          {self.inventory[i] ? (
            <>
              <ItemGlyph item={self.inventory[i]!.item} />
              <span className="absolute bottom-0 right-1 font-mono text-[10px] text-amber-100">{self.inventory[i]!.count}</span>
            </>
          ) : (
            <span className="h-4 w-4 rounded-sm border border-white/5" />
          )}
        </button>
      ))}
    </div>
  );
}

const PanelShell = ({ children }: { children: React.ReactNode }) => (
  <div className="max-h-[min(80vh,640px)] overflow-y-auto pr-1">{children}</div>
);

export function InventoryPanel({
  self,
  selected,
  onSelect,
  send,
}: {
  self: SelfState;
  selected: number;
  onSelect: (slot: number) => void;
  send: (action: Action) => void;
}) {
  const [moving, setMoving] = useState<number | null>(null);
  const pick = (index: number) => {
    onSelect(index);
    if (moving === null) {
      setMoving(index);
      return;
    }
    if (moving === index) {
      setMoving(null);
      return;
    }
    send({ action: "moveItems", from: moving, to: index, count: 64 });
    setMoving(null);
  };
  return (
    <PanelShell>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-amber-200">Backpack</h3>
        <p className="text-[11px] text-white/45">
          {moving === null ? "Click a slot to pick it up, click another to swap." : `Holding slot ${moving + 1} — click a destination.`}
        </p>
      </div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-white/35">Hotbar</p>
      <div className="mb-4 grid grid-cols-9 gap-1.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <SlotCell key={i} slot={self.inventory[i]} selected={moving === i || selected === i} onClick={() => pick(i)} tag={`${i + 1}`} />
        ))}
      </div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-white/35">Pack · 36 slots</p>
      <div className="grid grid-cols-9 gap-1.5">
        {Array.from({ length: 36 }).map((_, i) => (
          <SlotCell key={i} slot={self.inventory[i + 9]} selected={moving === i + 9} onClick={() => pick(i + 9)} />
        ))}
      </div>
      <div className="mt-4 rounded border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-white/55">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-amber-200/80">Equipped drill</p>
        {self.tool ? (
          <p className="text-white/80">
            {ITEM_BY_ID.get(self.tool)?.name} · tier {ITEM_BY_ID.get(self.tool)?.tool?.tier} · {ITEM_BY_ID.get(self.tool)?.tool?.speed}× speed. The
            best drill you carry is always the one the server uses.
          </p>
        ) : (
          <p className="text-rose-300">No drill carried. Craft a pickaxe at the Anvil.</p>
        )}
        <p className="mt-2 text-white/40">Death drops nothing in this build; the camp medic recovers you at the base with your gear.</p>
      </div>
    </PanelShell>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  station: "Camp",
  processing: "Processing",
  power: "Power",
  utility: "Utility",
  nuclear: "Nuclear",
};

export function BuildPanel({
  state,
  buildArmed,
  onArm,
}: {
  state: WorldState;
  buildArmed: string | null;
  onArm: (machine: string | null) => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const buildable = useMemo(() => MACHINES.filter((m) => state.tech.includes(m.tech)), [state.tech]);
  const groups = ["station", "processing", "power", "utility", "nuclear"].filter((g) => filter === "all" || filter === g);
  return (
    <PanelShell>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {["all", "station", "processing", "power", "utility", "nuclear"].map((g) => (
          <button
            key={g}
            onClick={() => setFilter(g)}
            className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
              filter === g ? "border-amber-300 bg-amber-300/15 text-amber-100" : "border-white/10 text-white/50"
            }`}
          >
            {g === "all" ? "All blueprints" : CATEGORY_LABEL[g]}
          </button>
        ))}
      </div>
      {buildArmed ? (
        <div className="mb-3 flex items-center justify-between rounded border border-emerald-300/40 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100">
          <span>
            Placing <b>{MACHINE_BY_ID.get(buildArmed)?.name}</b>. Aim at the ground and left-click. ESC to cancel.
          </span>
          <button onClick={() => onArm(null)} className="rounded border border-emerald-200/40 px-2 py-1 font-mono text-[10px]">
            Cancel
          </button>
        </div>
      ) : null}
      <div className="space-y-5">
        {groups.map((group) => {
          const list = buildable.filter((m) => m.category === group);
          if (!list.length) return null;
          return (
            <div key={group}>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">{CATEGORY_LABEL[group]}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((m) => {
                  const affordable = m.cost.every(([item, n]) => countItem(state.self.inventory, item) >= n);
                  return (
                    <div key={m.id} className="rounded border border-white/10 bg-black/30 p-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 h-7 w-7 shrink-0 rounded-sm" style={{ background: `linear-gradient(145deg, ${m.color}, #10151a)` }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-white/90">{m.name}</p>
                          <p className="mb-1.5 text-[11px] leading-snug text-white/45">{m.blurb}</p>
                          <div className="mb-1 flex flex-wrap gap-1 font-mono text-[9px] uppercase tracking-wider">
                            {m.kw ? <span className="rounded bg-sky-400/10 px-1 text-sky-200">{m.kw} kW</span> : null}
                            {m.producerKw ? <span className="rounded bg-emerald-400/10 px-1 text-emerald-200">+{m.producerKw} kW</span> : null}
                            {m.fuel ? <span className="rounded bg-amber-400/10 px-1 text-amber-200">coal</span> : null}
                            {m.requiresWater ? <span className="rounded bg-cyan-400/10 px-1 text-cyan-200">water</span> : null}
                            <span className="rounded bg-white/5 px-1 text-white/40">{CATEGORY_LABEL[m.category]}</span>
                          </div>
                          <CostList cost={m.cost} self={state.self} />
                        </div>
                      </div>
                      <button
                        disabled={!affordable}
                        onClick={() => onArm(m.id)}
                        className={`mt-2 w-full rounded-sm border py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                          affordable
                            ? "border-amber-300/60 bg-amber-300/15 text-amber-100 hover:bg-amber-300/25"
                            : "border-white/10 text-white/25"
                        }`}
                      >
                        {affordable ? "Place structure" : "Need materials"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

export function ResearchPanel({ state, send }: { state: WorldState; send: (a: Action) => void }) {
  const unlocked = new Set(state.tech);
  return (
    <PanelShell>
      <p className="mb-3 text-[11px] leading-relaxed text-white/50">
        Research is team-wide. Deliver the listed materials at the Research Desk to unlock blueprints and tools. Place the Desk first — the camp
        shares one tree.
      </p>
      <div className="space-y-5">
        {ERA_NAMES.map((era, eraIndex) => {
          const nodes = TECH.filter((t) => t.era === eraIndex);
          return (
            <div key={era}>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-amber-300/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-amber-200">
                  Era {eraIndex}
                </span>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">{era}</p>
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {nodes.map((node) => {
                  const done = unlocked.has(node.id);
                  const parentsOk = node.parents.every((p) => unlocked.has(p));
                  const afford = node.cost.every(([item, n]) => countItem(state.self.inventory, item) >= n);
                  return (
                    <div
                      key={node.id}
                      className={`rounded border p-3 ${
                        done ? "border-emerald-400/35 bg-emerald-400/5" : parentsOk ? "border-amber-300/25 bg-black/30" : "border-white/5 bg-black/20 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold text-white/90">{node.name}</p>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-white/35">
                          {done ? "unlocked" : parentsOk ? "available" : "locked"}
                        </span>
                      </div>
                      <p className="mb-2 text-[11px] leading-snug text-white/45">{node.blurb}</p>
                      {!done ? <CostList cost={node.cost} self={state.self} /> : null}
                      {!done ? (
                        <button
                          disabled={!parentsOk || !afford}
                          onClick={() => send({ action: "research", node: node.id })}
                          className={`mt-2 w-full rounded-sm border py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] ${
                            parentsOk && afford
                              ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25"
                              : "border-white/10 text-white/25"
                          }`}
                        >
                          {!parentsOk ? `Requires ${node.parents.map((p) => TECH_BY_ID.get(p)?.name).join(" + ")}` : afford ? "Deliver & research" : "Need materials"}
                        </button>
                      ) : (
                        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-emerald-300/70">✓ complete</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

export function ObjectivesPanel({ state }: { state: WorldState }) {
  const objectiveState = {
    tech: state.tech,
    machines: state.machines.map((m) => m.type),
    everHad: state.flags.everHad,
    maxDepth: state.flags.maxDepth,
  };
  const doneCount = OBJECTIVES.filter((o) => o.done(objectiveState)).length;
  return (
    <PanelShell>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-amber-200">Objectives</h3>
        <span className="font-mono text-[11px] text-white/50">
          {doneCount}/{OBJECTIVES.length}
        </span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded bg-white/10">
        <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-300" style={{ width: `${(doneCount / OBJECTIVES.length) * 100}%` }} />
      </div>
      <ol className="space-y-2">
        {OBJECTIVES.map((objective, index) => {
          const done = objective.done(objectiveState);
          return (
            <li key={objective.id} className={`rounded border p-2.5 ${done ? "border-emerald-400/25 bg-emerald-400/5" : "border-white/10 bg-black/25"}`}>
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border font-mono text-[10px] ${done ? "border-emerald-300 text-emerald-300" : "border-white/20 text-white/40"}`}>
                  {done ? "✓" : index + 1}
                </span>
                <div>
                  <p className={`text-[12px] ${done ? "text-emerald-100/80" : "text-white/85"}`}>{objective.label}</p>
                  <p className="text-[11px] text-white/40">{objective.hint}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded border border-white/10 bg-black/30 p-2">
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/35">Deepest point</p>
          <p className="font-mono text-base text-amber-200">{money(state.flags.maxDepth)} blocks</p>
        </div>
        <div className="rounded border border-white/10 bg-black/30 p-2">
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/35">Research</p>
          <p className="font-mono text-base text-emerald-200">
            {state.tech.length}/{TECH.length}
          </p>
        </div>
      </div>
    </PanelShell>
  );
}

export function ManualPanel() {
  const recipes = RECIPES.length;
  return (
    <PanelShell>
      <div className="space-y-4 text-[12px] leading-relaxed text-white/60">
        <section>
          <h3 className="mb-1 font-mono text-xs uppercase tracking-[0.25em] text-amber-200">Controls</h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {[
              ["WASD", "Walk"],
              ["Shift", "Sprint"],
              ["Ctrl / C", "Crouch"],
              ["Space", "Jump / step up"],
              ["Left click", "Mine (hold) / place when arming"],
              ["Right click", "Operate a structure"],
              ["1–9", "Select hotbar slot"],
              ["E", "Inventory"],
              ["B", "Blueprints"],
              ["R", "Research tree"],
              ["O", "Objectives"],
              ["M", "This manual"],
              ["Enter", "Chat"],
              ["G", "Geiger scan"],
              ["ESC", "Release pointer / close panel"],
            ].map(([key, label]) => (
              <li key={key} className="flex items-center gap-2">
                <span className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-amber-100">{key}</span>
                {label}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-mono text-xs uppercase tracking-[0.25em] text-amber-200">The descent</h3>
          <div className="overflow-hidden rounded border border-white/10">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-white/5 font-mono text-[9px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-2 py-1">Layer</th>
                  <th className="px-2 py-1">Depth</th>
                  <th className="px-2 py-1">Tier</th>
                  <th className="px-2 py-1">Hazard</th>
                </tr>
              </thead>
              <tbody>
                {LAYERS.map((layer) => (
                  <tr key={layer.id} className="border-t border-white/5">
                    <td className="px-2 py-1 text-white/80">{layer.name}</td>
                    <td className="px-2 py-1 font-mono text-white/45">
                      {layer.from}–{layer.to}
                    </td>
                    <td className="px-2 py-1 font-mono text-amber-200/80">T{layer.minTier}</td>
                    <td className="px-2 py-1 text-white/45">{layer.hazard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="grid gap-2 sm:grid-cols-2">
          <div className="rounded border border-amber-300/20 bg-amber-300/5 p-2.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-amber-200">Ladder</p>
            <p className="mt-1">
              Steel pickaxe (T1) → Hardened steel (T2) → Steam drill (T3) → Tungsten-carbide (T4) → Nuclear drill (T5, 3×3, 12× speed).
            </p>
          </div>
          <div className="rounded border border-emerald-300/20 bg-emerald-300/5 p-2.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-200">Nuclear chain</p>
            <p className="mt-1">Ore → Crusher → Leach → Precipitate → Convert UF6 → Centrifuge cascade → Fuel rod / core cell → Reactor &amp; Nuclear Drill.</p>
          </div>
        </section>
        <section className="rounded border border-white/10 bg-black/30 p-2.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/45">Content registry</p>
          <p className="mt-1 text-white/50">
            {recipes} recipes · {MACHINES.length} structures · {TECH.length} research nodes · {LAYERS.length} layers, all defined in
            <span className="font-mono text-amber-200/80"> src/game/content.ts</span>. Server rules run in
            <span className="font-mono text-amber-200/80"> src/game/server.ts</span>; the world regenerates deterministically from the seed and only
            player edits are persisted.
          </p>
        </section>
      </div>
    </PanelShell>
  );
}

export function MachineList({ machines }: { machines: WorldState["machines"] }) {
  if (!machines.length) return <p className="text-[11px] text-white/40">No structures built yet.</p>;
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {machines.map((m) => {
        const def: MachineDef | undefined = MACHINE_BY_ID.get(m.type);
        return (
          <div key={m.id} className="flex items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1.5">
            <span className="h-6 w-6 rounded-sm" style={{ background: `linear-gradient(145deg, ${def?.color ?? "#777"}, #10151a)` }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-white/80">{def?.name ?? m.type}</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-white/35">
                {m.x},{m.y},{m.z} · {m.enabled ? (m.idle ? m.idle : "running") : "off"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
