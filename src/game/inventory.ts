import { ITEM_BY_ID, STARTING_ITEMS } from "./content";
import type { Slot, Stack } from "./types";

export const HOTBAR_SLOTS = 9;
export const BACKPACK_SLOTS = 36;
export const TOTAL_SLOTS = HOTBAR_SLOTS + BACKPACK_SLOTS;

export const emptyInventory = (): Slot[] => new Array<Slot>(TOTAL_SLOTS).fill(null);

export const startingInventory = (): Slot[] => {
  const inv = emptyInventory();
  for (const [item, count] of STARTING_ITEMS) addItem(inv, item, count);
  return inv;
};

export const stackLimit = (item: string): number => ITEM_BY_ID.get(item)?.stack ?? 64;

export const normalize = (raw: unknown): Slot[] => {
  const inv = emptyInventory();
  if (!Array.isArray(raw)) return inv;
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const entry = raw[i] as Stack | null | undefined;
    if (entry && typeof entry.item === "string" && typeof entry.count === "number" && entry.count > 0) {
      if (ITEM_BY_ID.has(entry.item)) {
        inv[i] = { item: entry.item, count: Math.min(Math.floor(entry.count), stackLimit(entry.item)) };
      }
    }
  }
  return inv;
};

export const countItem = (inv: Slot[], item: string): number =>
  inv.reduce((sum, slot) => (slot && slot.item === item ? sum + slot.count : sum), 0);

export const countAll = (inv: Slot[], costs: [string, number][]): boolean =>
  costs.every(([item, n]) => countItem(inv, item) >= n);

export const removeItem = (inv: Slot[], item: string, count: number): number => {
  let left = count;
  for (let i = 0; i < inv.length && left > 0; i++) {
    const slot = inv[i];
    if (!slot || slot.item !== item) continue;
    const take = Math.min(slot.count, left);
    slot.count -= take;
    left -= take;
    if (slot.count <= 0) inv[i] = null;
  }
  return count - left;
};

export const addItem = (inv: Slot[], item: string, count: number): number => {
  const limit = stackLimit(item);
  let left = count;
  for (let i = 0; i < inv.length && left > 0; i++) {
    const slot = inv[i];
    if (!slot || slot.item !== item || slot.count >= limit) continue;
    const put = Math.min(limit - slot.count, left);
    slot.count += put;
    left -= put;
  }
  for (let i = 0; i < inv.length && left > 0; i++) {
    if (inv[i]) continue;
    const put = Math.min(limit, left);
    inv[i] = { item, count: put };
    left -= put;
  }
  return left;
};

export const consumeAll = (inv: Slot[], costs: [string, number][]): boolean => {
  if (!countAll(inv, costs)) return false;
  for (const [item, n] of costs) removeItem(inv, item, n);
  return true;
};

export const moveStack = (inv: Slot[], from: number, to: number, count?: number): boolean => {
  if (from === to || from < 0 || to < 0 || from >= inv.length || to >= inv.length) return false;
  const src = inv[from];
  if (!src) return false;
  const amount = Math.min(count ?? src.count, src.count);
  const dst = inv[to];
  if (!dst) {
    inv[to] = { item: src.item, count: amount };
    src.count -= amount;
    if (src.count <= 0) inv[from] = null;
    return true;
  }
  if (dst.item !== src.item) return false;
  const room = stackLimit(dst.item) - dst.count;
  const put = Math.min(room, amount);
  if (put <= 0) return false;
  dst.count += put;
  src.count -= put;
  if (src.count <= 0) inv[from] = null;
  return true;
};

/** Quick-move: hotbar <-> backpack, stacking into an existing pile when possible. */
export const quickMove = (inv: Slot[], index: number): boolean => {
  const src = inv[index];
  if (!src) return false;
  const fromHotbar = index < HOTBAR_SLOTS;
  const range: [number, number] = fromHotbar ? [HOTBAR_SLOTS, TOTAL_SLOTS] : [0, HOTBAR_SLOTS];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = range[0]; i < range[1]; i++) {
      if (pass === 0 && (!inv[i] || inv[i]?.item !== src.item)) continue;
      if (moveStack(inv, index, i)) return true;
      if (!inv[index]) return true;
    }
  }
  return false;
};

export const inventoryEverHad = (inv: Slot[]): string[] =>
  inv.filter((s): s is Stack => Boolean(s)).map((s) => s.item);

export const findSlot = (inv: Slot[], item: string): number => inv.findIndex((s) => s?.item === item);
