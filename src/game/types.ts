export type Stack = { item: string; count: number };
export type Slot = Stack | null;

export type Vitals = {
  health: number;
  stamina: number;
  oxygen: number;
  heat: number;
  radiation: number;
};

export type PlayerView = {
  id: number;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  depth: number;
  layer: string;
  tool: string | null;
  online: boolean;
};

export type ChangeView = { id: number; x: number; y: number; z: number; block: number };

export type MachineView = {
  id: number;
  type: string;
  x: number;
  y: number;
  z: number;
  enabled: boolean;
  recipeId: string | null;
  progress: number;
  fuel: number;
  inputs: Slot[];
  outputs: Slot[];
  idle: string | null;
};

export type EventView = {
  id: number;
  kind: string;
  author: string | null;
  message: string;
  createdAt: string;
};

export type ReactorState = {
  temperature: number;
  rods: number;
  on: boolean;
  scrammed: boolean;
  meltdownAt: number | null;
  radiationUntil: number | null;
};

export type GridState = {
  supply: number;
  demand: number;
  factor: number;
  batteries: number;
  water: boolean;
};

export type SelfState = {
  id: number;
  name: string;
  color: string;
  inventory: Slot[];
  vitals: Vitals;
  maxDepth: number;
  tool: string | null;
  toolSlot: number;
  x: number;
  y: number;
  z: number;
};

export type WorldState = {
  ok: true;
  worldId: number;
  seed: number;
  serverTime: number;
  cursor: number;
  tech: string[];
  self: SelfState;
  players: PlayerView[];
  machines: MachineView[];
  changes: ChangeView[];
  events: EventView[];
  reactor: ReactorState;
  grid: GridState;
  flags: { everHad: string[]; maxDepth: number };
};

export type ActionResult = {
  ok: boolean;
  message?: string;
  toast?: { kind: "info" | "error" | "good"; text: string };
  state?: WorldState;
  changes?: ChangeView[];
  oreScan?: { key: string; distance: number; pos: [number, number, number] }[];
};

export type Action =
  | { action: "move"; x: number; y: number; z: number; yaw: number; pitch: number; sprint?: boolean; crouch?: boolean }
  | { action: "minestart"; x: number; y: number; z: number; nx: number; ny: number; nz: number }
  | { action: "minefinish"; x: number; y: number; z: number; nx: number; ny: number; nz: number }
  | { action: "build"; machine: string; x: number; y: number; z: number }
  | { action: "dismantle"; machineId: number }
  | { action: "machineRecipe"; machineId: number; recipeId: string | null }
  | { action: "machineToggle"; machineId: number }
  | { action: "machineLoad"; machineId: number; item: string; count: number; target: "input" | "fuel" }
  | { action: "machineTake"; machineId: number; index: number }
  | { action: "research"; node: string }
  | { action: "decon"; machineId: number }
  | { action: "reactor"; rods?: number; on?: boolean; scram?: boolean; loadRod?: boolean }
  | { action: "chat"; text: string }
  | { action: "respawn" }
  | { action: "moveItems"; from: number; to: number; count: number }
  | { action: "scan" };
