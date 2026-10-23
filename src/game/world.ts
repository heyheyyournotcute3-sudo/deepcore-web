/**
 * Deterministic voxel world generation shared by the browser renderer and the
 * authoritative server. Same seed + same coordinates => same block, always.
 */
import {
  AIR,
  BEDROCK,
  BLOCK_BY_KEY,
  BLOCKS,
  CHUNK,
  LAYERS,
  MACHINE_BLOCK,
  SURFACE_Y,
  WORLD_HEIGHT,
  WORLD_SIZE,
  blockId,
  layerAtDepth,
  type BlockDef,
  type ToolSpec,
} from "./content";

export const CAMP = { x: 48, z: 48, radius: 13 };
export const RAMP = { x0: 60, x1: 84, z0: 46, z1: 49 };
export const TICK_HZ = 30;

const ID = {
  dirt: blockId("dirt"),
  gravel: blockId("gravel"),
  clay: blockId("clay"),
  sand: blockId("sand"),
  stone: blockId("stone"),
  timber: blockId("timber"),
  leaves: blockId("leaves"),
};

const hash3 = (seed: number, x: number, y: number, z: number): number => {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  h = Math.imul(h ^ (z | 0), 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

const noise3 = (seed: number, x: number, y: number, z: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const tz = smooth(z - zi);
  let acc = 0;
  for (let dz = 0; dz <= 1; dz++) {
    const wz = dz ? tz : 1 - tz;
    for (let dy = 0; dy <= 1; dy++) {
      const wy = dy ? ty : 1 - ty;
      for (let dx = 0; dx <= 1; dx++) {
        const wx = dx ? tx : 1 - tx;
        acc += wx * wy * wz * hash3(seed, xi + dx, yi + dy, zi + dz);
      }
    }
  }
  return acc;
};

const noise2 = (seed: number, x: number, z: number): number => noise3(seed, x, 0.5, z);

export const blockKey = (x: number, y: number, z: number): number =>
  x + z * WORLD_SIZE + y * WORLD_SIZE * WORLD_SIZE;

export const inBounds = (x: number, y: number, z: number): boolean =>
  x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT;

export const depthOf = (y: number): number => Math.max(0, SURFACE_Y - y);

export const layerOfY = (y: number) => layerAtDepth(depthOf(y));

export const rampWalkY = (x: number, z: number): number | null => {
  if (z < RAMP.z0 || z > RAMP.z1 || x < RAMP.x0 || x > RAMP.x1) return null;
  const step = Math.floor((x - RAMP.x0) / 2);
  return SURFACE_Y - 2 - step;
};

export const isCampColumn = (x: number, z: number): boolean =>
  Math.hypot(x - CAMP.x, z - CAMP.z) <= CAMP.radius;

/**
 * One instance per seed. Holds cached surface heights and tree blocks so a
 * per-block lookup stays cheap enough for collision and raycasts.
 */
export class WorldGen {
  readonly seed: number;
  private heights: Int16Array;
  private trees: Map<number, number>;

  constructor(seed: number) {
    this.seed = seed;
    this.heights = new Int16Array(WORLD_SIZE * WORLD_SIZE);
    this.trees = new Map();
    this.buildHeights();
    this.plantTrees();
  }

  private buildHeights() {
    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        const n = noise2(this.seed + 101, x / 22, z / 22);
        let top = SURFACE_Y - 1 - Math.round(n * 3.2);
        if (isCampColumn(x, z)) top = SURFACE_Y - 1;
        const ramp = rampWalkY(x, z);
        if (ramp !== null) top = ramp;
        this.heights[x + z * WORLD_SIZE] = top;
      }
    }
  }

  private plantTrees() {
    for (let z = 2; z < WORLD_SIZE - 2; z++) {
      for (let x = 2; x < WORLD_SIZE - 2; x++) {
        if (hash3(this.seed + 7, x, 0, z) > 0.006) continue;
        if (isCampColumn(x, z)) continue;
        if (x >= RAMP.x0 - 2 && x <= RAMP.x1 + 2 && z >= RAMP.z0 - 2 && z <= RAMP.z1 + 2) continue;
        const ground = this.heights[x + z * WORLD_SIZE];
        const height = 3 + Math.floor(hash3(this.seed + 9, x, 1, z) * 3);
        for (let i = 1; i <= height; i++) {
          this.trees.set(blockKey(x, ground + i, z), ID.timber);
        }
        const crownY = ground + height;
        for (let dy = -1; dy <= 2; dy++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 1.4;
              if (d > 3.2) continue;
              if (dx === 0 && dz === 0 && dy <= 0) continue;
              const k = blockKey(x + dx, crownY + dy, z + dz);
              if (!this.trees.has(k)) this.trees.set(k, ID.leaves);
            }
          }
        }
      }
    }
  }

  topSolid(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= WORLD_SIZE || z >= WORLD_SIZE) return SURFACE_Y - 1;
    return this.heights[x + z * WORLD_SIZE];
  }

  /** Base block before any player edits. */
  baseBlock(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    if (x <= 0 || z <= 0 || x >= WORLD_SIZE - 1 || z >= WORLD_SIZE - 1) return BEDROCK;
    if (y <= 1) return BEDROCK;

    const top = this.topSolid(x, z);
    const ramp = rampWalkY(x, z);
    const airAbove = ramp !== null ? ramp : top;

    if (y > airAbove) {
      return this.trees.get(blockKey(x, y, z)) ?? AIR;
    }

    const treeBlock = this.trees.get(blockKey(x, y, z));
    if (treeBlock && y <= airAbove) {
      // Trees sit in the air column; a trunk must not overwrite ground.
      if (y > top) return treeBlock;
    }

    const depth = depthOf(y);
    const layer = layerAtDepth(depth);

    if (depth >= 2 && depth <= 6 && !isCampColumn(x, z) && ramp === null) {
      const h = hash3(this.seed + 31, x, y, z);
      if (h < 0.04) return ID.gravel;
      if (h < 0.065) return ID.clay;
      if (h < 0.08) return ID.sand;
    }

    // Caves: two layered noise fields, kept away from the camp footprint.
    if (depth > 5 && y < top - 1 && !(isCampColumn(x, z) && depth < 18)) {
      const cavern = noise3(this.seed + 211, x * 0.085, y * 0.12, z * 0.085);
      const tunnel = Math.abs(noise3(this.seed + 307, x * 0.045, y * 0.075, z * 0.045) - 0.5);
      if (cavern > 0.655 || tunnel < 0.028) return AIR;
    }

    const baseKey = layer.base[Math.floor(hash3(this.seed + 53, x, y, z) * layer.base.length) % layer.base.length];
    const base = BLOCK_BY_KEY.get(baseKey)?.id ?? ID.stone;

    for (let i = 0; i < layer.ores.length; i++) {
      const ore = layer.ores[i];
      const cell = hash3(this.seed + 977 + i * 7919, x >> 2, y >> 2, z >> 2);
      if (cell < ore.freq) {
        const fill = hash3(this.seed + 613 + i * 131, x, y * 3 + z, z);
        if (fill < 0.35 + 0.45 * ore.size) {
          return BLOCK_BY_KEY.get(ore.block)?.id ?? base;
        }
      }
    }

    return base;
  }

  generateChunk(cx: number, cy: number, cz: number): Uint16Array {
    const out = new Uint16Array(CHUNK * CHUNK * CHUNK);
    let i = 0;
    for (let y = 0; y < CHUNK; y++) {
      const wy = cy * CHUNK + y;
      for (let z = 0; z < CHUNK; z++) {
        const wz = cz * CHUNK + z;
        for (let x = 0; x < CHUNK; x++) {
          out[i++] = this.baseBlock(cx * CHUNK + x, wy, wz);
        }
      }
    }
    return out;
  }

  /** Nearest ore positions, used by the Geiger counter and the ore scanner. */
  nearbyOres(x: number, y: number, z: number, radius: number, limit = 8): { key: string; distance: number; pos: [number, number, number] }[] {
    const found: { key: string; distance: number; pos: [number, number, number] }[] = [];
    const r = Math.min(radius, 20);
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const bx = Math.floor(x) + dx;
          const by = Math.floor(y) + dy;
          const bz = Math.floor(z) + dz;
          if (!inBounds(bx, by, bz)) continue;
          const b = this.baseBlock(bx, by, bz);
          const def = BLOCKS[b];
          if (!def?.ore) continue;
          const d = Math.hypot(dx, dy, dz);
          if (d > r) continue;
          found.push({ key: def.key, distance: d, pos: [bx, by, bz] });
        }
      }
    }
    return found.sort((a, b) => a.distance - b.distance).slice(0, limit);
  }
}

const genCache = new Map<number, WorldGen>();

export const getWorldGen = (seed: number): WorldGen => {
  const existing = genCache.get(seed);
  if (existing) return existing;
  const gen = new WorldGen(seed);
  genCache.set(seed, gen);
  return gen;
};

export type BlockLookup = (x: number, y: number, z: number) => number;

/** Base generation plus every stored edit. */
export const makeLookup = (gen: WorldGen, changes: Map<number, number>): BlockLookup => (x, y, z) => {
  const changed = changes.get(blockKey(x, y, z));
  if (changed !== undefined) return changed;
  if (!inBounds(x, y, z)) return AIR;
  return gen.baseBlock(x, y, z);
};

export const blockDefOf = (id: number): BlockDef | undefined => BLOCKS[id];

export const toolForItem = (itemId: string | null | undefined, tools: Map<string, ToolSpec>): ToolSpec | null =>
  (itemId && tools.get(itemId)) || null;

export const REACH = 5;
export const DRILL_REACH = 6.2;

/** Seconds of continuous mining, using the design formula hardness / (speed * power). */
export const breakSeconds = (block: BlockDef, tool: ToolSpec | null, power = 1): number => {
  if (!tool || tool.tier < block.minTier) return Infinity;
  return block.hardness / (tool.speed * power);
};

export const breakProgressLabel = (block: BlockDef, tool: ToolSpec | null): string => {
  const s = breakSeconds(block, tool);
  if (!Number.isFinite(s)) return `Too hard — needs Tier ${block.minTier}`;
  return `${s.toFixed(2)}s`;
};

/** 3×3 face offsets perpendicular to the dominant axis of the hit normal. */
export const areaOffsets = (normal: [number, number, number]): [number, number, number][] => {
  const axis = normal.map(Math.abs);
  const dominant = axis[0] >= axis[1] && axis[0] >= axis[2] ? 0 : axis[1] >= axis[2] ? 1 : 2;
  const out: [number, number, number][] = [];
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      if (dominant === 0) out.push([0, a, b]);
      else if (dominant === 1) out.push([a, 0, b]);
      else out.push([a, b, 0]);
    }
  }
  return out;
};

export const spawnPosition = (gen: WorldGen): [number, number, number] => [
  CAMP.x + 0.5,
  gen.topSolid(CAMP.x, CAMP.z) + 2.2,
  CAMP.z + 0.5,
];

export const MACHINE_OCCUPIED = MACHINE_BLOCK;

export const nearestLayer = (y: number) => {
  const layer = layerOfY(y);
  return { layer, depth: depthOf(y) };
};

export const LAYER_SUMMARY = LAYERS.map((l) => ({
  id: l.id,
  name: l.name,
  from: l.from,
  to: l.to,
  hazard: l.hazard,
  minTier: l.minTier,
  ambient: l.ambient,
}));
