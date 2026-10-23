/**
 * DEEPCORE content registry.
 *
 * Every rule and number lives here rather than in gameplay code, mirroring the
 * RON data files described in the design document. The registry is validated at
 * module load so a bad id fails the build instead of a player's session.
 */

export type ItemCategory = "raw" | "material" | "component" | "chemical" | "nuclear" | "tool" | "gear";

export type ToolSpec = { tier: number; speed: number; area: number };

export type Item = {
  id: string;
  name: string;
  stack: number;
  cat: ItemCategory;
  color: string;
  glow?: boolean;
  tool?: ToolSpec;
  note?: string;
};

export type BlockDef = {
  id: number;
  key: string;
  name: string;
  hardness: number;
  minTier: number;
  color: string;
  drops: [string, number][];
  glow?: boolean;
  radiation?: number;
  ore?: boolean;
};

export type MachineCategory = "station" | "processing" | "power" | "utility" | "nuclear";

export type MachineDef = {
  id: string;
  name: string;
  blurb: string;
  category: MachineCategory;
  tech: string;
  cost: [string, number][];
  color: string;
  kw?: number;
  fuel?: boolean;
  producerKw?: number;
  requiresWater?: boolean;
  inputSlots?: number;
  outputSlots?: number;
  waterCost?: number;
};

export type Recipe = {
  id: string;
  name: string;
  machine: string;
  time: number;
  inputs: [string, number][];
  outputs: [string, number][];
  tech?: string;
};

export type TechNode = {
  id: string;
  name: string;
  era: number;
  parents: string[];
  cost: [string, number][];
  blurb: string;
};

export type LayerDef = {
  id: string;
  name: string;
  from: number;
  to: number;
  base: string[];
  minTier: number;
  hazard: string;
  ambient: number;
  ores: { block: string; freq: number; size: number }[];
};

const item = (
  id: string,
  name: string,
  cat: ItemCategory,
  color: string,
  extra: Partial<Item> = {},
): Item => ({ id, name, cat, color, stack: 64, ...extra });

const tool = (id: string, name: string, tier: number, speed: number, area: number, color: string): Item =>
  item(id, name, "tool", color, {
    stack: 1,
    tool: { tier, speed, area },
    note: `Tier ${tier} · ${speed}× speed${area > 1 ? ` · ${area}×${area} face` : ""}`,
  });

export const ITEMS: Item[] = [
  // Raw stone and soil
  item("dirt", "Dirt", "raw", "#7a5a3a"),
  item("gravel", "Gravel", "raw", "#8b8580"),
  item("cobblestone", "Cobblestone", "raw", "#7d7d80"),
  item("limestone", "Limestone", "raw", "#b8b2a2"),
  item("shale", "Shale", "raw", "#5d5a52"),
  item("granite_cobble", "Granite Cobble", "raw", "#8a7d72"),
  item("basalt_cobble", "Basalt Cobble", "raw", "#4c4649"),
  item("gneiss", "Gneiss", "raw", "#6e6660"),
  item("obsidian", "Obsidian", "raw", "#2b2438"),
  item("mantle_rock", "Mantle Rock", "raw", "#5c2f2c"),
  item("clay_ball", "Clay", "raw", "#a8765a"),
  item("sand", "Sand", "raw", "#d8c48c"),
  item("timber", "Timber", "raw", "#8a6234"),
  item("coal", "Coal", "raw", "#232328", { note: "Furnace fuel" }),
  item("raw_copper", "Raw Copper", "raw", "#c47a45", { note: "Layer 2" }),
  item("raw_tin", "Raw Tin", "raw", "#c9c6bd", { note: "Layer 2" }),
  item("raw_iron", "Raw Iron", "raw", "#b08a72", { note: "Layers 2–3" }),
  item("raw_lead", "Raw Lead", "raw", "#8b8fa3", { note: "Layer 3" }),
  item("raw_zinc", "Raw Zinc", "raw", "#a7b0b5", { note: "Layer 3" }),
  item("sulfur", "Sulfur", "raw", "#e0d24a", { note: "Layer 3–4" }),
  item("quartz", "Quartz", "raw", "#e9e3d6", { note: "Layer 3" }),
  item("raw_bauxite", "Raw Bauxite", "raw", "#b78b6c", { note: "Layer 3" }),
  item("salt", "Rock Salt", "raw", "#e7e9ef", { note: "Layer 3" }),
  item("raw_nickel", "Raw Nickel", "raw", "#9aa8a0", { note: "Layer 4" }),
  item("raw_tungsten", "Raw Tungsten", "raw", "#6b6f78", { note: "Layer 4" }),
  item("raw_chromium", "Raw Chromium", "raw", "#8f9fb2", { note: "Layer 4" }),
  item("graphite", "Graphite", "raw", "#303238", { note: "Layer 4" }),
  item("fluorite", "Fluorite", "raw", "#7fd8c2", { note: "Layer 4" }),
  item("raw_zircon", "Raw Zircon", "raw", "#c9a2a2", { note: "Layer 4" }),
  item("raw_gold", "Raw Gold", "raw", "#e0b447", { note: "Layer 4" }),
  item("uranium_ore", "Uranium Ore", "raw", "#5d8a3a", { glow: true, note: "Radioactive" }),
  item("monazite", "Monazite Sand", "raw", "#b58c62", { note: "Layer 5" }),
  item("core_crystal", "Core Crystal", "raw", "#ff7a2f", { glow: true, note: "Trophy" }),

  // Smelted and manufactured materials
  item("brick", "Brick", "material", "#a25c4a"),
  item("fire_brick", "Fire Brick", "material", "#c07a53"),
  item("glass", "Glass", "material", "#9fd6d8"),
  item("iron_ingot", "Iron Ingot", "material", "#c8c2b8"),
  item("copper_ingot", "Copper Ingot", "material", "#d2833f"),
  item("tin_ingot", "Tin Ingot", "material", "#d7d4cd"),
  item("bronze_ingot", "Bronze Ingot", "material", "#c08b45"),
  item("lead_ingot", "Lead Ingot", "material", "#8e93a8"),
  item("zinc_ingot", "Zinc Ingot", "material", "#adb6bb"),
  item("cadmium", "Cadmium", "material", "#c8b05e", { note: "Zinc byproduct" }),
  item("steel_ingot", "Steel Ingot", "material", "#b9bec6"),
  item("nickel_ingot", "Nickel Ingot", "material", "#a9b8ae"),
  item("chromium_ingot", "Chromium Ingot", "material", "#9fb4cc"),
  item("tungsten_ingot", "Tungsten Ingot", "material", "#7c828c"),
  item("aluminium_ingot", "Aluminium Ingot", "material", "#cfd8de"),
  item("gold_ingot", "Gold Ingot", "material", "#f0c14b"),
  item("silicon", "Silicon", "material", "#6f7a86"),
  item("steel_plate", "Steel Plate", "component", "#a9b1bb"),
  item("iron_plate", "Iron Plate", "component", "#b5b0a6"),
  item("copper_plate", "Copper Plate", "component", "#c8763c"),
  item("copper_wire", "Copper Wire", "component", "#e09a52"),
  item("copper_pipe", "Copper Pipe", "component", "#bb6d39"),
  item("bronze_gear", "Bronze Gear", "component", "#c59a4f"),
  item("steel_rod", "Steel Rod", "component", "#9aa3ad"),
  item("stainless_steel", "Stainless Steel", "component", "#d3dbe2"),
  item("tungsten_carbide", "Tungsten Carbide", "component", "#5f666f"),
  item("carbon_electrode", "Carbon Electrode", "component", "#3a3d44"),
  item("zirconium_tubing", "Zirconium Tubing", "component", "#b9c2c0"),
  item("lead_shielding", "Lead Shielding", "component", "#7d8296"),
  item("shielding_plate", "Dense Shielding Plate", "component", "#596070"),
  item("battery_pack", "Battery Pack", "component", "#4f8a5c"),
  item("circuit_mk1", "Circuit Mk1", "component", "#4f8f6a"),
  item("circuit_mk2", "Circuit Mk2", "component", "#3f9c8a"),
  item("rare_earth_magnet", "Rare-Earth Magnet", "component", "#b46fa8"),
  item("stainless_rotor", "Stainless Rotor", "component", "#9fa9b3"),
  item("machine_part", "Precision Parts", "component", "#93a0ae"),

  // Chemicals and the nuclear chain
  item("sulfuric_acid", "Sulfuric Acid", "chemical", "#d6d24a"),
  item("fluorine_compound", "Fluorine Compound", "chemical", "#8ff0cf"),
  item("chlorine", "Chlorine", "chemical", "#b9e06a"),
  item("lye", "Lye", "chemical", "#e8eef0"),
  item("crushed_uranium_ore", "Crushed Uranium Ore", "nuclear", "#4f7a34"),
  item("uranium_solution", "Uranium Solution", "nuclear", "#c2d65a"),
  item("radioactive_tailings", "Radioactive Tailings", "nuclear", "#89a83c", { glow: true }),
  item("yellowcake", "Yellowcake", "nuclear", "#e3d360", { glow: true }),
  item("uranium_hexafluoride", "UF6 Canister", "nuclear", "#cfd8b0"),
  item("enriched_canister", "Enriched Canister", "nuclear", "#8ef06a", { glow: true }),
  item("depleted_canister", "Depleted Canister", "nuclear", "#7c8460"),
  item("fuel_rod", "Fuel Rod", "nuclear", "#9ff08a", { glow: true }),
  item("spent_fuel_rod", "Spent Fuel Rod", "nuclear", "#b9d84f", { glow: true }),
  item("compact_core_cell", "Compact Core Cell", "nuclear", "#8dff5e", { glow: true }),
  item("control_rod", "Control Rod", "nuclear", "#6b7280"),
  item("stable_waste", "Stabilised Waste", "nuclear", "#4f5a3d"),

  // Tools and hazard gear
  tool("steel_pickaxe", "Steel Pickaxe", 1, 1, 1, "#b5bcc4"),
  tool("hardened_pickaxe", "Hardened Steel Pickaxe", 2, 1.6, 1, "#d8dee5"),
  tool("steam_drill", "Steam Drill", 3, 3, 1, "#d08a45"),
  tool("tungsten_drill", "Tungsten-Carbide Drill", 4, 5, 1, "#8b939e"),
  tool("nuclear_drill", "Nuclear Drill", 5, 12, 3, "#8dff5e"),
  item("headlamp", "Helmet Lamp", "gear", "#ffe3a3", { stack: 1, note: "Always lit while carried" }),
  item("oil_lamp", "Oil Lamp", "gear", "#ffb257", { stack: 16 }),
  item("respirator", "Respirator", "gear", "#9fb8b0", { stack: 1 }),
  item("cooling_suit", "Cooling Suit", "gear", "#7fb6d8", { stack: 1 }),
  item("hazmat_suit", "Lead-Lined Hazmat Suit", "gear", "#b9e08a", { stack: 1 }),
  item("geiger_counter", "Geiger Counter", "gear", "#d6e05a", { stack: 1 }),
  item("ore_scanner", "Ore Scanner", "gear", "#6fe0d0", { stack: 1 }),
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

const block = (
  key: string,
  name: string,
  hardness: number,
  minTier: number,
  color: string,
  drops: [string, number][],
  ore = false,
  extra: Partial<BlockDef> = {},
): BlockDef => ({ id: -1, key, name, hardness, minTier, color, drops, ore, ...extra });

export const BLOCKS: BlockDef[] = [
  block("air", "Air", 0, 99, "#000000", []),
  block("bedrock", "Bedrock", 9999, 99, "#26262b", []),
  block("dirt", "Dirt", 0.6, 1, "#7a5a3a", [["dirt", 1]]),
  block("gravel", "Gravel", 0.8, 1, "#85807b", [["gravel", 1]]),
  block("clay", "Clay", 0.7, 1, "#a8765a", [["clay_ball", 2]]),
  block("sand", "Sand", 0.5, 1, "#d8c48c", [["sand", 1]]),
  block("stone", "Stone", 1.8, 1, "#7d7d80", [["cobblestone", 1]]),
  block("limestone", "Limestone", 2.2, 1, "#b8b2a2", [["limestone", 1]]),
  block("shale", "Shale", 2.6, 1, "#5d5a52", [["shale", 1]]),
  block("granite", "Granite", 4, 2, "#8a7d72", [["granite_cobble", 1]]),
  block("basalt", "Basalt", 6.5, 3, "#4c4649", [["basalt_cobble", 1]]),
  block("gneiss", "Gneiss", 9, 4, "#6e6660", [["gneiss", 1]]),
  block("obsidian", "Obsidian", 11, 4, "#2b2438", [["obsidian", 1]]),
  block("mantle_rock", "Mantle Rock", 18, 5, "#5c2f2c", [["mantle_rock", 1]]),
  block("timber", "Timber", 1.1, 1, "#7a5327", [["timber", 2]]),
  block("leaves", "Leaves", 0.3, 1, "#3f6b3a", []),
  block("coal_seam", "Coal Seam", 2, 1, "#2b2b31", [["coal", 2]], true),
  block("malachite", "Malachite", 2.2, 1, "#3f8a5c", [["raw_copper", 2]], true),
  block("cassiterite", "Cassiterite", 2.4, 1, "#6d6357", [["raw_tin", 1]], true),
  block("hematite", "Hematite", 2.8, 1, "#8a4038", [["raw_iron", 2]], true),
  block("galena", "Galena", 4.4, 2, "#7d8090", [["raw_lead", 1]], true),
  block("sphalerite", "Sphalerite", 4.4, 2, "#8d9a7d", [["raw_zinc", 1]], true),
  block("sulfur_deposit", "Sulfur Deposit", 3, 2, "#d8ca4a", [["sulfur", 2]], true),
  block("quartz", "Quartz Vein", 3.6, 2, "#d8d2c2", [["quartz", 1]], true),
  block("bauxite", "Bauxite", 4.2, 2, "#a87b5c", [["raw_bauxite", 2]], true),
  block("salt", "Rock Salt", 3, 2, "#e2e4ea", [["salt", 2]], true),
  block("pentlandite", "Pentlandite", 7, 3, "#8a8f76", [["raw_nickel", 1]], true),
  block("wolframite", "Wolframite", 8, 3, "#4f5560", [["raw_tungsten", 1]], true),
  block("chromite", "Chromite", 7, 3, "#4a4650", [["raw_chromium", 1]], true),
  block("graphite_vein", "Graphite Vein", 6, 3, "#2c2e34", [["graphite", 2]], true),
  block("fluorite", "Fluorite", 7, 3, "#5fc9b0", [["fluorite", 1]], true),
  block("zircon", "Zircon", 7.5, 3, "#a88080", [["raw_zircon", 1]], true),
  block("gold_vein", "Gold Vein", 6.5, 3, "#c9a13f", [["raw_gold", 1]], true),
  block("pitchblende", "Pitchblende", 10, 4, "#3d5a2c", [["uranium_ore", 1]], true, {
    glow: true,
    radiation: 0.55,
  }),
  block("monazite", "Monazite Vein", 12, 4, "#8a6a4a", [["monazite", 2]], true),
  block("core_crystal", "Core Crystal", 25, 5, "#ff7a2f", [["core_crystal", 1]], true, {
    glow: true,
    radiation: 0.2,
  }),
];

BLOCKS.forEach((b, index) => {
  b.id = index;
});

export const BLOCK_BY_KEY = new Map(BLOCKS.map((b) => [b.key, b]));
export const AIR = 0;
export const BEDROCK = 1;
export const MACHINE_BLOCK = 40;
export const WORLD_SIZE = 96;
export const WORLD_HEIGHT = 64;
export const SURFACE_Y = 56;
export const CHUNK = 16;

export const blockId = (key: string): number => {
  const b = BLOCK_BY_KEY.get(key);
  if (!b) throw new Error(`Unknown block: ${key}`);
  return b.id;
};

export const MACHINES: MachineDef[] = [
  {
    id: "workbench",
    name: "Workbench",
    blurb: "Build station. Unlocks nothing by itself — everything else is placed from blueprints.",
    category: "station",
    tech: "hand_tools",
    cost: [["timber", 8]],
    color: "#8a6234",
  },
  {
    id: "storage_crate",
    name: "Storage Crate",
    blurb: "Team-shared ore cache. Machine outputs can be staged here by hand.",
    category: "station",
    tech: "hand_tools",
    cost: [["timber", 10]],
    color: "#7c5a34",
  },
  {
    id: "oil_lamp",
    name: "Oil Lamp",
    blurb: "Placed light source. Keeps tunnels visible without a suit lamp.",
    category: "utility",
    tech: "hand_tools",
    cost: [["timber", 2], ["clay_ball", 2]],
    color: "#ffb257",
  },
  {
    id: "research_desk",
    name: "Research Desk",
    blurb: "Team tech tree. Deposit materials to unlock the next era.",
    category: "station",
    tech: "hand_tools",
    cost: [["timber", 12], ["copper_ingot", 4]],
    color: "#4f8f6a",
  },
  {
    id: "brick_kiln",
    name: "Brick Kiln",
    blurb: "Fires clay into bricks and fire bricks.",
    category: "processing",
    tech: "smelting",
    fuel: true,
    cost: [["clay_ball", 20], ["cobblestone", 8]],
    color: "#a25c4a",
    inputSlots: 3,
    outputSlots: 2,
  },
  {
    id: "stone_furnace",
    name: "Stone Furnace",
    blurb: "Coal-fired smelting for copper, tin, iron, lead, zinc, gold and glass.",
    category: "processing",
    tech: "smelting",
    fuel: true,
    cost: [["cobblestone", 20], ["brick", 6], ["clay_ball", 6]],
    color: "#6f6f74",
    inputSlots: 3,
    outputSlots: 3,
  },
  {
    id: "anvil",
    name: "Anvil",
    blurb: "Plates, rods, gears, pipes, shielding, batteries and tool heads.",
    category: "processing",
    tech: "metallurgy",
    cost: [["iron_ingot", 8], ["cobblestone", 12]],
    color: "#5a5f66",
    inputSlots: 4,
    outputSlots: 3,
  },
  {
    id: "blast_furnace",
    name: "Blast Furnace",
    blurb: "Iron plus coal plus limestone flux becomes steel.",
    category: "processing",
    tech: "steelmaking",
    fuel: true,
    cost: [["fire_brick", 16], ["iron_plate", 8]],
    color: "#8a4a3a",
    inputSlots: 3,
    outputSlots: 2,
  },
  {
    id: "hand_pump",
    name: "Hand Pump",
    blurb: "Water feed. A boiler will not make steam without at least one pump on the base.",
    category: "utility",
    tech: "steam_power",
    cost: [["bronze_ingot", 6], ["copper_pipe", 4]],
    color: "#4f7f8a",
  },
  {
    id: "steam_boiler",
    name: "Steam Boiler",
    blurb: "Burns coal into 90 kW of steam pressure. Needs a pump.",
    category: "power",
    tech: "steam_power",
    fuel: true,
    requiresWater: true,
    producerKw: 90,
    cost: [["steel_plate", 8], ["copper_pipe", 6], ["bronze_gear", 2]],
    color: "#b0713f",
  },
  {
    id: "steam_engine",
    name: "Steam Engine",
    blurb: "Burns coal for 70 kW of shaft power. Cheaper than a generator, thirstier.",
    category: "power",
    tech: "steam_power",
    fuel: true,
    producerKw: 70,
    cost: [["bronze_ingot", 10], ["steel_rod", 4]],
    color: "#9a7a45",
  },
  {
    id: "crusher",
    name: "Crusher",
    blurb: "Crushes uranium ore for leaching and quartz for silicon feedstock.",
    category: "processing",
    tech: "ore_processing",
    kw: 30,
    cost: [["steel_plate", 6], ["bronze_gear", 4]],
    color: "#7a7f86",
    inputSlots: 2,
    outputSlots: 2,
  },
  {
    id: "ore_washer",
    name: "Ore Washer",
    blurb: "Washed ore yields 1.5 ingots per ore instead of 1.",
    category: "processing",
    tech: "ore_processing",
    kw: 20,
    cost: [["steel_plate", 4], ["copper_pipe", 4]],
    color: "#5a7f8a",
    inputSlots: 3,
    outputSlots: 2,
  },
  {
    id: "generator",
    name: "Generator",
    blurb: "Coal generator, 140 kW. The backbone of Era 3.",
    category: "power",
    tech: "electrification",
    fuel: true,
    producerKw: 140,
    cost: [["steel_plate", 10], ["copper_wire", 12], ["bronze_gear", 4]],
    color: "#c99a3f",
  },
  {
    id: "steam_turbine",
    name: "Steam Turbine",
    blurb: "260 kW from coal and a water feed. Needs a pump.",
    category: "power",
    tech: "electrification",
    fuel: true,
    requiresWater: true,
    producerKw: 260,
    cost: [["steel_plate", 16], ["copper_wire", 16], ["bronze_gear", 8]],
    color: "#b8c0c8",
  },
  {
    id: "battery_bank",
    name: "Battery Bank",
    blurb: "Cushions brownouts. While charged, covers a 30% demand spike.",
    category: "power",
    tech: "electrification",
    cost: [["battery_pack", 4], ["zinc_ingot", 4], ["lead_ingot", 6]],
    color: "#4f8a5c",
  },
  {
    id: "vent_fan",
    name: "Vent Fan",
    blurb: "Clears heat. Cuts body-heat gain by 30% while you stand near it.",
    category: "utility",
    tech: "electrification",
    kw: 10,
    cost: [["steel_plate", 4], ["copper_wire", 6]],
    color: "#7f8f9a",
  },
  {
    id: "arc_furnace",
    name: "Arc Furnace",
    blurb: "Silicon from quartz and fast steel remelting.",
    category: "processing",
    tech: "arc_smelting",
    kw: 70,
    cost: [["steel_plate", 8], ["circuit_mk1", 2], ["graphite", 6]],
    color: "#6f7a86",
    inputSlots: 3,
    outputSlots: 2,
  },
  {
    id: "electrolysis_cell",
    name: "Electrolysis Cell",
    blurb: "Aluminium from bauxite; chlorine and lye from rock salt.",
    category: "processing",
    tech: "electrolysis",
    kw: 90,
    cost: [["steel_plate", 6], ["copper_plate", 6], ["circuit_mk1", 2]],
    color: "#4f8fa8",
    inputSlots: 2,
    outputSlots: 3,
  },
  {
    id: "circuit_assembler",
    name: "Circuit Assembler",
    blurb: "Silicon plus copper into circuits; gold into Mk2 circuits.",
    category: "processing",
    tech: "electronics",
    kw: 40,
    cost: [["steel_plate", 6], ["copper_wire", 8], ["circuit_mk1", 1]],
    color: "#3f9c8a",
    inputSlots: 3,
    outputSlots: 2,
  },
  {
    id: "chemical_plant",
    name: "Chemical Plant",
    blurb: "Sulfuric acid from sulfur; fluorine compounds from fluorite and acid.",
    category: "processing",
    tech: "chemistry",
    kw: 100,
    cost: [["stainless_steel", 6], ["circuit_mk1", 4], ["glass", 8]],
    color: "#d6d24a",
    inputSlots: 3,
    outputSlots: 3,
  },
  {
    id: "alloy_furnace",
    name: "Alloy Furnace",
    blurb: "Stainless steel and tungsten carbide for the nuclear age.",
    category: "processing",
    tech: "advanced_alloys",
    kw: 80,
    cost: [["steel_plate", 12], ["fire_brick", 12], ["circuit_mk1", 2], ["carbon_electrode", 4]],
    color: "#d3dbe2",
    inputSlots: 4,
    outputSlots: 2,
  },
  {
    id: "machine_shop",
    name: "Machine Shop",
    blurb: "Precision parts, rotors, zirconium tubing and the deep drills.",
    category: "processing",
    tech: "machine_shop",
    kw: 70,
    cost: [["steel_plate", 12], ["bronze_gear", 8], ["circuit_mk1", 4]],
    color: "#93a0ae",
    inputSlots: 5,
    outputSlots: 2,
  },
  {
    id: "rare_earth_separator",
    name: "Rare-Earth Separator",
    blurb: "Monazite into the magnets used by centrifuges and core motors.",
    category: "processing",
    tech: "rare_earths",
    kw: 90,
    cost: [["stainless_steel", 4], ["circuit_mk2", 2], ["glass", 6]],
    color: "#b46fa8",
    inputSlots: 3,
    outputSlots: 2,
  },
  {
    id: "decon_shower",
    name: "Decon Shower",
    blurb: "Flushes radiation dose to zero. Use the panel action.",
    category: "utility",
    tech: "hazmat_program",
    kw: 25,
    cost: [["lead_shielding", 2], ["copper_pipe", 4], ["steel_plate", 4]],
    color: "#8fd8c2",
  },
  {
    id: "leaching_tank",
    name: "Leaching Tank",
    blurb: "Crushed uranium plus acid becomes uranium solution and tailings.",
    category: "nuclear",
    tech: "uranium_milling",
    kw: 60,
    cost: [["stainless_steel", 4], ["lead_shielding", 4], ["circuit_mk2", 1]],
    color: "#c2d65a",
    inputSlots: 2,
    outputSlots: 2,
  },
  {
    id: "precipitator",
    name: "Precipitator",
    blurb: "Uranium solution plus lye precipitates yellowcake.",
    category: "nuclear",
    tech: "uranium_milling",
    kw: 40,
    cost: [["stainless_steel", 4], ["glass", 6], ["circuit_mk2", 1]],
    color: "#e3d360",
    inputSlots: 2,
    outputSlots: 2,
  },
  {
    id: "conversion_plant",
    name: "Conversion Plant",
    blurb: "Yellowcake plus fluorine compound becomes UF6 canisters.",
    category: "nuclear",
    tech: "conversion",
    kw: 70,
    cost: [["stainless_steel", 6], ["lead_shielding", 2], ["circuit_mk2", 2]],
    color: "#cfd8b0",
    inputSlots: 2,
    outputSlots: 2,
  },
  {
    id: "centrifuge",
    name: "Centrifuge",
    blurb: "Enriches UF6. Adjacent centrifuges shorten the cycle (cascade).",
    category: "nuclear",
    tech: "enrichment",
    kw: 150,
    cost: [["stainless_rotor", 2], ["rare_earth_magnet", 4], ["circuit_mk2", 2]],
    color: "#8ef06a",
    inputSlots: 1,
    outputSlots: 2,
  },
  {
    id: "fuel_fabricator",
    name: "Fuel Fabricator",
    blurb: "Enriched canisters into fuel rods and compact core cells.",
    category: "nuclear",
    tech: "fuel_fabrication",
    kw: 90,
    cost: [["stainless_steel", 6], ["rare_earth_magnet", 2], ["circuit_mk2", 2]],
    color: "#9ff08a",
    inputSlots: 3,
    outputSlots: 2,
  },
  {
    id: "reactor",
    name: "Reactor",
    blurb: "Graphite-moderated 2400 kW core. Open its console to control the rods.",
    category: "nuclear",
    tech: "nuclear_power",
    producerKw: 0,
    inputSlots: 3,
    outputSlots: 2,
    cost: [["stainless_steel", 20], ["lead_shielding", 12], ["graphite", 16], ["control_rod", 2]],
    color: "#7fe0a0",
  },
  {
    id: "cooling_pool",
    name: "Cooling Pool",
    blurb: "Timed cool-down for spent rods before they become stable waste.",
    category: "nuclear",
    tech: "waste_management",
    kw: 20,
    cost: [["lead_shielding", 4], ["glass", 10]],
    color: "#5f9fa8",
    inputSlots: 2,
    outputSlots: 2,
  },
  {
    id: "waste_vault",
    name: "Waste Vault",
    blurb: "Sealed storage. Waste left loose at the base irradiates the camp.",
    category: "nuclear",
    tech: "waste_management",
    cost: [["lead_shielding", 6], ["stainless_steel", 4]],
    color: "#4f5a3d",
    inputSlots: 2,
    outputSlots: 0,
  },
];

export const MACHINE_BY_ID = new Map(MACHINES.map((m) => [m.id, m]));

export const RECIPES: Recipe[] = [
  // Era 1
  { id: "fire_bricks", name: "Fire Bricks", machine: "brick_kiln", time: 6, inputs: [["clay_ball", 2], ["sand", 1]], outputs: [["fire_brick", 1]] },
  { id: "bricks", name: "Bricks", machine: "brick_kiln", time: 3, inputs: [["clay_ball", 1]], outputs: [["brick", 1]] },
  { id: "smelt_copper", name: "Copper Ingot", machine: "stone_furnace", time: 5, inputs: [["raw_copper", 1]], outputs: [["copper_ingot", 1]] },
  { id: "smelt_tin", name: "Tin Ingot", machine: "stone_furnace", time: 5, inputs: [["raw_tin", 1]], outputs: [["tin_ingot", 1]] },
  { id: "smelt_iron", name: "Iron Ingot", machine: "stone_furnace", time: 6, inputs: [["raw_iron", 1]], outputs: [["iron_ingot", 1]] },
  { id: "smelt_lead", name: "Lead Ingot", machine: "stone_furnace", time: 6, inputs: [["raw_lead", 1]], outputs: [["lead_ingot", 1]] },
  { id: "refine_zinc", name: "Zinc + Cadmium", machine: "stone_furnace", time: 8, inputs: [["raw_zinc", 2]], outputs: [["zinc_ingot", 1], ["cadmium", 1]] },
  { id: "smelt_gold", name: "Gold Ingot", machine: "stone_furnace", time: 7, inputs: [["raw_gold", 1]], outputs: [["gold_ingot", 1]] },
  { id: "make_glass", name: "Glass", machine: "stone_furnace", time: 4, inputs: [["sand", 2]], outputs: [["glass", 1]] },
  { id: "make_bronze", name: "Bronze Ingot", machine: "stone_furnace", time: 7, inputs: [["copper_ingot", 1], ["tin_ingot", 1]], outputs: [["bronze_ingot", 2]] },
  { id: "copper_plate", name: "Copper Plate", machine: "anvil", time: 3, inputs: [["copper_ingot", 1]], outputs: [["copper_plate", 1]] },
  { id: "copper_wire", name: "Copper Wire", machine: "anvil", time: 4, inputs: [["copper_plate", 1]], outputs: [["copper_wire", 2]] },
  { id: "copper_pipe", name: "Copper Pipe", machine: "anvil", time: 5, inputs: [["copper_plate", 2]], outputs: [["copper_pipe", 2]] },
  { id: "iron_plate", name: "Iron Plate", machine: "anvil", time: 4, inputs: [["iron_ingot", 1]], outputs: [["iron_plate", 1]] },
  { id: "bronze_gear", name: "Bronze Gear", machine: "anvil", time: 5, inputs: [["bronze_ingot", 1]], outputs: [["bronze_gear", 1]] },
  { id: "steel_plate", name: "Steel Plate", machine: "anvil", time: 5, inputs: [["steel_ingot", 1]], outputs: [["steel_plate", 1]] },
  { id: "steel_rod", name: "Steel Rod", machine: "anvil", time: 4, inputs: [["steel_plate", 1]], outputs: [["steel_rod", 2]] },
  { id: "lead_shielding", name: "Lead Shielding", machine: "anvil", time: 6, inputs: [["lead_ingot", 2]], outputs: [["lead_shielding", 1]] },
  {
    id: "make_hardened_pickaxe",
    name: "Hardened Steel Pickaxe",
    machine: "anvil",
    time: 14,
    inputs: [["steel_plate", 4], ["steel_rod", 2], ["bronze_gear", 1]],
    outputs: [["hardened_pickaxe", 1]],
    tech: "steelmaking",
  },
  {
    id: "make_battery",
    name: "Battery Pack",
    machine: "anvil",
    time: 10,
    inputs: [["lead_ingot", 1], ["copper_plate", 1], ["sulfuric_acid", 1], ["chlorine", 1]],
    outputs: [["battery_pack", 1]],
    tech: "chemistry",
  },
  { id: "make_steel", name: "Steel Ingot", machine: "blast_furnace", time: 12, inputs: [["iron_ingot", 2], ["coal", 2], ["limestone", 1]], outputs: [["steel_ingot", 2]] },

  // Era 2
  { id: "crush_uranium", name: "Crush Uranium", machine: "crusher", time: 8, inputs: [["uranium_ore", 1]], outputs: [["crushed_uranium_ore", 1]] },
  { id: "crush_quartz", name: "Crush Quartz", machine: "crusher", time: 6, inputs: [["quartz", 2]], outputs: [["silicon", 1]] },
  { id: "wash_iron", name: "Wash Iron Ore", machine: "ore_washer", time: 10, inputs: [["raw_iron", 2], ["coal", 1]], outputs: [["iron_ingot", 3]] },
  { id: "wash_copper", name: "Wash Copper Ore", machine: "ore_washer", time: 10, inputs: [["raw_copper", 2], ["coal", 1]], outputs: [["copper_ingot", 3]] },
  { id: "wash_tin", name: "Wash Tin Ore", machine: "ore_washer", time: 10, inputs: [["raw_tin", 2], ["coal", 1]], outputs: [["tin_ingot", 3]] },
  { id: "wash_zinc", name: "Wash Zinc Ore", machine: "ore_washer", time: 10, inputs: [["raw_zinc", 2], ["coal", 1]], outputs: [["zinc_ingot", 3]] },

  // Era 3
  { id: "arc_silicon", name: "Refine Silicon", machine: "arc_furnace", time: 8, inputs: [["quartz", 2], ["coal", 1]], outputs: [["silicon", 2]] },
  { id: "arc_steel", name: "Remelt Steel", machine: "arc_furnace", time: 8, inputs: [["iron_ingot", 2], ["coal", 1]], outputs: [["steel_ingot", 2]] },
  { id: "make_aluminium", name: "Aluminium Ingot", machine: "electrolysis_cell", time: 12, inputs: [["raw_bauxite", 2]], outputs: [["aluminium_ingot", 1]] },
  { id: "split_salt", name: "Chlorine + Lye", machine: "electrolysis_cell", time: 8, inputs: [["salt", 2]], outputs: [["lye", 1], ["chlorine", 1]] },
  { id: "circuit_mk1", name: "Circuit Mk1", machine: "circuit_assembler", time: 8, inputs: [["silicon", 1], ["copper_wire", 2]], outputs: [["circuit_mk1", 1]] },
  { id: "circuit_mk2", name: "Circuit Mk2", machine: "circuit_assembler", time: 14, inputs: [["circuit_mk1", 2], ["gold_ingot", 1]], outputs: [["circuit_mk2", 1]], tech: "electronics" },
  { id: "carbon_electrode", name: "Carbon Electrode", machine: "arc_furnace", time: 9, inputs: [["graphite", 2], ["copper_plate", 1]], outputs: [["carbon_electrode", 1]] },

  // Era 4
  { id: "sulfuric_acid", name: "Sulfuric Acid", machine: "chemical_plant", time: 8, inputs: [["sulfur", 2]], outputs: [["sulfuric_acid", 1]] },
  { id: "fluorine", name: "Fluorine Compound", machine: "chemical_plant", time: 12, inputs: [["fluorite", 2], ["sulfuric_acid", 1]], outputs: [["fluorine_compound", 1]] },
  { id: "stainless", name: "Stainless Steel", machine: "alloy_furnace", time: 14, inputs: [["steel_ingot", 2], ["nickel_ingot", 1], ["chromium_ingot", 1]], outputs: [["stainless_steel", 2]] },
  { id: "tungsten_carbide", name: "Tungsten Carbide", machine: "alloy_furnace", time: 14, inputs: [["tungsten_ingot", 1], ["graphite", 1]], outputs: [["tungsten_carbide", 1]] },
  { id: "smelt_nickel", name: "Nickel Ingot", machine: "arc_furnace", time: 9, inputs: [["raw_nickel", 1]], outputs: [["nickel_ingot", 1]] },
  { id: "smelt_chromium", name: "Chromium Ingot", machine: "arc_furnace", time: 9, inputs: [["raw_chromium", 1]], outputs: [["chromium_ingot", 1]] },
  { id: "smelt_tungsten", name: "Tungsten Ingot", machine: "arc_furnace", time: 11, inputs: [["raw_tungsten", 1]], outputs: [["tungsten_ingot", 1]] },
  { id: "machine_part", name: "Precision Parts", machine: "machine_shop", time: 10, inputs: [["steel_plate", 2], ["bronze_gear", 1]], outputs: [["machine_part", 1]] },
  { id: "zirconium", name: "Zirconium Tubing", machine: "machine_shop", time: 12, inputs: [["raw_zircon", 2]], outputs: [["zirconium_tubing", 1]] },
  { id: "stainless_rotor", name: "Stainless Rotor", machine: "machine_shop", time: 16, inputs: [["stainless_steel", 2], ["machine_part", 1]], outputs: [["stainless_rotor", 1]] },
  {
    id: "make_steam_drill",
    name: "Steam Drill",
    machine: "anvil",
    time: 18,
    inputs: [["steel_plate", 4], ["bronze_gear", 4], ["copper_pipe", 4]],
    outputs: [["steam_drill", 1]],
    tech: "steam_power",
  },
  {
    id: "make_tungsten_drill",
    name: "Tungsten-Carbide Drill",
    machine: "machine_shop",
    time: 24,
    inputs: [["tungsten_carbide", 4], ["steel_rod", 4], ["circuit_mk2", 1], ["battery_pack", 1]],
    outputs: [["tungsten_drill", 1]],
    tech: "tungsten_drill",
  },
  { id: "rare_earth_magnet", name: "Rare-Earth Magnet", machine: "rare_earth_separator", time: 16, inputs: [["monazite", 2], ["sulfuric_acid", 1]], outputs: [["rare_earth_magnet", 1]] },

  // Hazmat gear
  { id: "cooling_suit", name: "Cooling Suit", machine: "machine_shop", time: 18, inputs: [["aluminium_ingot", 4], ["copper_pipe", 4], ["glass", 2]], outputs: [["cooling_suit", 1]], tech: "hazmat_program" },
  { id: "respirator", name: "Respirator", machine: "machine_shop", time: 12, inputs: [["steel_plate", 2], ["glass", 2], ["lead_shielding", 1]], outputs: [["respirator", 1]], tech: "hazmat_program" },
  { id: "hazmat_suit", name: "Lead-Lined Hazmat Suit", machine: "machine_shop", time: 24, inputs: [["lead_shielding", 4], ["stainless_steel", 2], ["circuit_mk1", 1]], outputs: [["hazmat_suit", 1]], tech: "hazmat_program" },
  { id: "geiger_counter", name: "Geiger Counter", machine: "machine_shop", time: 12, inputs: [["copper_wire", 4], ["circuit_mk1", 1], ["glass", 1]], outputs: [["geiger_counter", 1]], tech: "hazmat_program" },
  { id: "ore_scanner", name: "Ore Scanner", machine: "machine_shop", time: 16, inputs: [["copper_wire", 6], ["circuit_mk2", 1], ["glass", 2]], outputs: [["ore_scanner", 1]], tech: "hazmat_program" },

  // Era 5 nuclear chain
  { id: "leach_uranium", name: "Leach Uranium", machine: "leaching_tank", time: 20, inputs: [["crushed_uranium_ore", 2], ["sulfuric_acid", 1]], outputs: [["uranium_solution", 1], ["radioactive_tailings", 1]] },
  { id: "precipitate", name: "Precipitate Yellowcake", machine: "precipitator", time: 18, inputs: [["uranium_solution", 1], ["lye", 1]], outputs: [["yellowcake", 1]] },
  { id: "convert", name: "Convert to UF6", machine: "conversion_plant", time: 22, inputs: [["yellowcake", 1], ["fluorine_compound", 1]], outputs: [["uranium_hexafluoride", 1]] },
  { id: "enrich", name: "Enrich UF6", machine: "centrifuge", time: 28, inputs: [["uranium_hexafluoride", 1]], outputs: [["enriched_canister", 1], ["depleted_canister", 1]] },
  { id: "fuel_rod", name: "Fuel Rod", machine: "fuel_fabricator", time: 20, inputs: [["enriched_canister", 1], ["zirconium_tubing", 1]], outputs: [["fuel_rod", 1]] },
  { id: "core_cell", name: "Compact Core Cell", machine: "fuel_fabricator", time: 30, inputs: [["enriched_canister", 1], ["stainless_steel", 2], ["lead_shielding", 1]], outputs: [["compact_core_cell", 1]] },
  { id: "control_rod", name: "Control Rod", machine: "anvil", time: 12, inputs: [["cadmium", 2], ["stainless_steel", 2]], outputs: [["control_rod", 1]], tech: "nuclear_power" },
  { id: "shield_plate", name: "Dense Shielding Plate", machine: "anvil", time: 14, inputs: [["depleted_canister", 1], ["lead_shielding", 1]], outputs: [["shielding_plate", 1]], tech: "waste_management" },
  { id: "cool_spent", name: "Cool Spent Fuel", machine: "cooling_pool", time: 60, inputs: [["spent_fuel_rod", 1]], outputs: [["stable_waste", 1]] },
  { id: "stabilise_tailings", name: "Stabilise Tailings", machine: "cooling_pool", time: 30, inputs: [["radioactive_tailings", 2], ["glass", 1]], outputs: [["stable_waste", 1]], tech: "waste_management" },
  {
    id: "make_nuclear_drill",
    name: "Nuclear Drill",
    machine: "machine_shop",
    time: 60,
    inputs: [["compact_core_cell", 1], ["tungsten_carbide", 4], ["stainless_steel", 6], ["rare_earth_magnet", 2], ["lead_shielding", 2]],
    outputs: [["nuclear_drill", 1]],
    tech: "nuclear_drill",
  },
];

export const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export const TECH: TechNode[] = [
  { id: "hand_tools", name: "Hand Tools", era: 0, parents: [], cost: [], blurb: "Shelter, light and a workbench. Steel pickaxe only." },
  { id: "smelting", name: "Smelting", era: 1, parents: ["hand_tools"], cost: [["coal", 8], ["clay_ball", 8]], blurb: "Kilns and furnaces turn rock into metal." },
  { id: "metallurgy", name: "Metallurgy", era: 1, parents: ["smelting"], cost: [["copper_ingot", 8], ["iron_ingot", 4]], blurb: "Anvil work: plates, wires, gears and tools." },
  { id: "steelmaking", name: "Steelmaking", era: 1, parents: ["metallurgy"], cost: [["iron_ingot", 12], ["coal", 12], ["bronze_gear", 2]], blurb: "Blast furnace and the hardened pickaxe. Opens the Granite Depths." },
  { id: "steam_power", name: "Steam Power", era: 2, parents: ["steelmaking"], cost: [["steel_plate", 6], ["copper_pipe", 4], ["bronze_gear", 2]], blurb: "Pumps, boilers and steam engines. The Steam Drill." },
  { id: "ore_processing", name: "Ore Processing", era: 2, parents: ["steam_power"], cost: [["steel_plate", 4], ["copper_plate", 4]], blurb: "Crushers and washers. More metal per haul." },
  { id: "electrification", name: "Electrification", era: 3, parents: ["ore_processing"], cost: [["copper_wire", 12], ["steel_plate", 8], ["bronze_gear", 4]], blurb: "Generators, turbines, battery banks and a real grid." },
  { id: "arc_smelting", name: "Arc Smelting", era: 3, parents: ["electrification"], cost: [["copper_wire", 8], ["quartz", 10]], blurb: "Electric heat, silicon and electrode production." },
  { id: "electrolysis", name: "Electrolysis", era: 3, parents: ["electrification"], cost: [["salt", 12], ["copper_plate", 6]], blurb: "Aluminium, chlorine and lye from rock salt." },
  { id: "electronics", name: "Electronics", era: 3, parents: ["arc_smelting"], cost: [["silicon", 4], ["copper_wire", 10]], blurb: "Circuits. Everything deep needs them." },
  { id: "chemistry", name: "Chemistry", era: 4, parents: ["electronics", "electrolysis"], cost: [["sulfur", 10], ["glass", 8], ["circuit_mk1", 2]], blurb: "Sulfuric acid and fluorine compounds. Feedstock for uranium." },
  { id: "advanced_alloys", name: "Advanced Alloys", era: 4, parents: ["chemistry"], cost: [["nickel_ingot", 2], ["chromium_ingot", 2], ["steel_ingot", 6]], blurb: "Alloy furnace: stainless steel and tungsten carbide." },
  { id: "machine_shop", name: "Machine Shop", era: 4, parents: ["advanced_alloys"], cost: [["steel_plate", 10], ["circuit_mk1", 4]], blurb: "Precision parts, rotors, tubing and the drills." },
  { id: "rare_earths", name: "Rare Earths", era: 4, parents: ["machine_shop"], cost: [["monazite", 4], ["sulfuric_acid", 2]], blurb: "Magnets strong enough to spin a cascade." },
  { id: "hazmat_program", name: "Hazard Program", era: 4, parents: ["advanced_alloys"], cost: [["lead_shielding", 4], ["glass", 6]], blurb: "Suits, respirators, Geiger counters and the decon shower." },
  { id: "tungsten_drill", name: "Tungsten Drill", era: 4, parents: ["machine_shop", "hazmat_program"], cost: [["tungsten_carbide", 4], ["battery_pack", 2], ["circuit_mk2", 1]], blurb: "Tier 4. The Deep Crust opens." },
  { id: "uranium_milling", name: "Uranium Milling", era: 5, parents: ["chemistry", "tungsten_drill"], cost: [["steel_plate", 8], ["circuit_mk2", 1]], blurb: "Leaching tanks and precipitators. Yellowcake." },
  { id: "conversion", name: "Conversion", era: 5, parents: ["uranium_milling"], cost: [["fluorine_compound", 4], ["stainless_steel", 4]], blurb: "Yellowcake to UF6 canisters." },
  { id: "enrichment", name: "Enrichment", era: 5, parents: ["conversion", "rare_earths"], cost: [["rare_earth_magnet", 4], ["stainless_steel", 6]], blurb: "Centrifuge cascade. Enriched and depleted canisters." },
  { id: "fuel_fabrication", name: "Fuel Fabrication", era: 5, parents: ["enrichment"], cost: [["stainless_steel", 4], ["circuit_mk2", 2]], blurb: "Fuel rods and compact core cells." },
  { id: "nuclear_power", name: "Nuclear Power", era: 5, parents: ["fuel_fabrication"], cost: [["lead_shielding", 8], ["graphite", 12], ["stainless_steel", 4]], blurb: "Reactor, control rods and a scram interlock." },
  { id: "waste_management", name: "Waste Management", era: 5, parents: ["nuclear_power"], cost: [["glass", 8], ["lead_shielding", 4]], blurb: "Cooling pools and waste vaults." },
  { id: "nuclear_drill", name: "Nuclear Drill", era: 5, parents: ["fuel_fabrication", "machine_shop"], cost: [["lead_shielding", 6], ["tungsten_carbide", 6], ["rare_earth_magnet", 2]], blurb: "The endgame tool. 3×3 face, 12× speed, tier 5." },
];

export const TECH_BY_ID = new Map(TECH.map((t) => [t.id, t]));

export const LAYERS: LayerDef[] = [
  {
    id: "topsoil",
    name: "Topsoil",
    from: 0,
    to: 7,
    base: ["dirt", "gravel", "clay", "sand"],
    minTier: 1,
    hazard: "None",
    ambient: 16,
    ores: [
      { block: "coal_seam", freq: 0.16, size: 1 },
      { block: "malachite", freq: 0.04, size: 0.8 },
    ],
  },
  {
    id: "shale_beds",
    name: "Shale Beds",
    from: 7,
    to: 18,
    base: ["stone", "limestone", "shale"],
    minTier: 1,
    hazard: "Darkness",
    ambient: 22,
    ores: [
      { block: "coal_seam", freq: 0.1, size: 1.2 },
      { block: "malachite", freq: 0.09, size: 1 },
      { block: "cassiterite", freq: 0.055, size: 0.9 },
      { block: "hematite", freq: 0.1, size: 1.1 },
    ],
  },
  {
    id: "granite_depths",
    name: "Granite Depths",
    from: 18,
    to: 30,
    base: ["granite"],
    minTier: 2,
    hazard: "Flooding · heat seeps",
    ambient: 36,
    ores: [
      { block: "hematite", freq: 0.085, size: 1.1 },
      { block: "galena", freq: 0.06, size: 1 },
      { block: "sphalerite", freq: 0.06, size: 1 },
      { block: "sulfur_deposit", freq: 0.05, size: 0.9 },
      { block: "quartz", freq: 0.055, size: 1 },
      { block: "bauxite", freq: 0.05, size: 1 },
      { block: "salt", freq: 0.06, size: 1.1 },
    ],
  },
  {
    id: "basalt_furnace",
    name: "Basalt Furnace",
    from: 30,
    to: 42,
    base: ["basalt"],
    minTier: 3,
    hazard: "Heat · gas pockets",
    ambient: 62,
    ores: [
      { block: "pentlandite", freq: 0.05, size: 0.9 },
      { block: "wolframite", freq: 0.032, size: 0.8 },
      { block: "chromite", freq: 0.05, size: 0.9 },
      { block: "graphite_vein", freq: 0.05, size: 1 },
      { block: "fluorite", freq: 0.035, size: 0.8 },
      { block: "zircon", freq: 0.035, size: 0.8 },
      { block: "gold_vein", freq: 0.03, size: 0.7 },
    ],
  },
  {
    id: "deep_crust",
    name: "Deep Crust",
    from: 42,
    to: 51,
    base: ["gneiss", "obsidian"],
    minTier: 4,
    hazard: "Radiation · cave-ins",
    ambient: 88,
    ores: [
      { block: "pitchblende", freq: 0.055, size: 0.9 },
      { block: "monazite", freq: 0.04, size: 0.8 },
      { block: "graphite_vein", freq: 0.04, size: 0.9 },
    ],
  },
  {
    id: "mantle_edge",
    name: "Mantle Edge",
    from: 51,
    to: 56,
    base: ["mantle_rock"],
    minTier: 5,
    hazard: "Extreme heat · extreme radiation",
    ambient: 140,
    ores: [
      { block: "pitchblende", freq: 0.1, size: 1.1 },
      { block: "core_crystal", freq: 0.05, size: 0.7 },
      { block: "monazite", freq: 0.05, size: 0.8 },
    ],
  },
];

export const layerAtDepth = (depth: number): LayerDef =>
  LAYERS.find((l) => depth >= l.from && depth < l.to) ?? LAYERS[LAYERS.length - 1];

export const STARTING_ITEMS: [string, number][] = [
  ["steel_pickaxe", 1],
  ["headlamp", 1],
];

export const OBJECTIVES: { id: string; label: string; hint: string; done: (o: ObjectiveState) => boolean }[] = [
  { id: "timber", label: "Cut timber from the camp trees", hint: "Left-click a tree trunk with the pickaxe.", done: (o) => o.everHad.includes("timber") },
  { id: "workbench", label: "Place a Workbench", hint: "Press B, pick Workbench, place it at camp.", done: (o) => o.machines.includes("workbench") },
  { id: "desk", label: "Build the Research Desk", hint: "Costs 12 timber and 4 copper ingots.", done: (o) => o.machines.includes("research_desk") },
  { id: "smelting", label: "Research Smelting", hint: "8 coal + 8 clay at the desk. Dig the topsoil.", done: (o) => o.tech.includes("smelting") },
  { id: "furnace", label: "Place a Stone Furnace", hint: "24 cobblestone + 8 clay.", done: (o) => o.machines.includes("stone_furnace") },
  { id: "iron", label: "Smelt your first iron ingot", hint: "Load raw iron and coal into the furnace panel.", done: (o) => o.everHad.includes("iron_ingot") },
  { id: "metallurgy", label: "Research Metallurgy, place an Anvil", hint: "8 copper + 4 iron ingots.", done: (o) => o.tech.includes("metallurgy") && o.machines.includes("anvil") },
  { id: "steel", label: "Make steel in a Blast Furnace", hint: "Research Steelmaking, then iron + coal + limestone.", done: (o) => o.everHad.includes("steel_ingot") },
  { id: "hardened", label: "Forge the Hardened Steel Pickaxe", hint: "4 steel plates, 2 rods, 1 bronze gear at the Anvil.", done: (o) => o.everHad.includes("hardened_pickaxe") },
  { id: "depth3", label: "Reach the Granite Depths (depth 18)", hint: "Tier 2 is required to cut granite.", done: (o) => o.maxDepth >= 18 },
  { id: "steam", label: "Research Steam Power", hint: "Research nodes unlock pumps, boilers and the Steam Drill.", done: (o) => o.tech.includes("steam_power") },
  { id: "steam_drill", label: "Assemble a Steam Drill", hint: "Anvil: 4 steel plates, 4 bronze gears, 4 copper pipes.", done: (o) => o.everHad.includes("steam_drill") },
  { id: "uranium", label: "Find pitchblende in the Deep Crust", hint: "Depth 42+. Carry a Geiger counter.", done: (o) => o.everHad.includes("uranium_ore") },
  { id: "yellowcake", label: "Produce yellowcake", hint: "Crush, leach and precipitate uranium.", done: (o) => o.everHad.includes("yellowcake") },
  { id: "reactor", label: "Bring a reactor online", hint: "Research Nuclear Power and place the reactor.", done: (o) => o.machines.includes("reactor") },
  { id: "nuclear_drill", label: "Build the Nuclear Drill", hint: "Core cell + tungsten carbide + stainless + magnets.", done: (o) => o.everHad.includes("nuclear_drill") },
];

export type ObjectiveState = { tech: string[]; machines: string[]; everHad: string[]; maxDepth: number };

// ---------------------------------------------------------------------------
// Validation: fail fast on content that references things that do not exist.
// ---------------------------------------------------------------------------
function validateContent() {
  const problems: string[] = [];
  const requireItem = (id: string, where: string) => {
    if (!ITEM_BY_ID.has(id)) problems.push(`${where}: unknown item "${id}"`);
  };
  const requireTech = (id: string, where: string) => {
    if (!TECH_BY_ID.has(id)) problems.push(`${where}: unknown tech "${id}"`);
  };

  for (const b of BLOCKS) for (const [d] of b.drops) requireItem(d, `block ${b.key}`);
  for (const m of MACHINES) {
    requireTech(m.tech, `machine ${m.id}`);
    for (const [c] of m.cost) requireItem(c, `machine ${m.id}`);
  }
  for (const r of RECIPES) {
    if (!MACHINE_BY_ID.has(r.machine)) problems.push(`recipe ${r.id}: unknown machine "${r.machine}"`);
    for (const [i] of r.inputs) requireItem(i, `recipe ${r.id}`);
    for (const [o] of r.outputs) requireItem(o, `recipe ${r.id}`);
    if (r.tech) requireTech(r.tech, `recipe ${r.id}`);
  }
  for (const t of TECH) {
    for (const p of t.parents) requireTech(p, `tech ${t.id}`);
    for (const [c] of t.cost) requireItem(c, `tech ${t.id}`);
  }
  for (const l of LAYERS) {
    for (const base of l.base) {
      if (!BLOCK_BY_KEY.has(base)) problems.push(`layer ${l.id}: unknown base block "${base}"`);
    }
    for (const ore of l.ores) {
      const b = BLOCK_BY_KEY.get(ore.block);
      if (!b) problems.push(`layer ${l.id}: unknown ore block "${ore.block}"`);
      else if (!b.ore) problems.push(`layer ${l.id}: "${ore.block}" is not flagged as an ore`);
    }
  }
  for (const [id] of STARTING_ITEMS) requireItem(id, "starting inventory");

  // Every recipe output should have a use somewhere (crafted item, build cost,
  // research cost or gear). Ores must drop something usable.
  const used = new Set<string>();
  for (const r of RECIPES) for (const [i] of r.inputs) used.add(i);
  for (const m of MACHINES) for (const [c] of m.cost) used.add(c);
  for (const t of TECH) for (const [c] of t.cost) used.add(c);
  for (const b of BLOCKS) for (const [d] of b.drops) used.add(d);
  // Consumed by gameplay actions rather than recipes.
  for (const id of [
    "headlamp", "fuel_rod", "spent_fuel_rod", "stable_waste", "compact_core_cell",
    "core_crystal", "shielding_plate", "oil_lamp", "respirator", "cooling_suit",
    "hazmat_suit", "geiger_counter", "ore_scanner", "steel_pickaxe", "hardened_pickaxe",
    "steam_drill", "tungsten_drill", "nuclear_drill", "coal", "timber",
  ]) {
    used.add(id);
  }

  const techReachable = (id: string): boolean => {
    const node = TECH_BY_ID.get(id);
    if (!node) return false;
    const missing = node.parents.filter((p) => !TECH_BY_ID.has(p));
    return missing.length === 0;
  };

  for (const t of TECH) if (!techReachable(t.id)) problems.push(`tech ${t.id}: missing parent node`);
  for (const r of RECIPES) {
    if (!used.has(r.id) && !r.outputs.some(([o]) => used.has(o))) {
      problems.push(`recipe ${r.id}: nothing consumes its outputs (${r.outputs.map(([o]) => o).join(", ")})`);
    }
  }

  if (problems.length) {
    throw new Error(`Deepcore content validation failed:\n${problems.join("\n")}`);
  }
}

validateContent();

export const buildableMachines = (tech: string[]): MachineDef[] =>
  MACHINES.filter((m) => tech.includes(m.tech));

export const machineRecipes = (machineId: string): Recipe[] =>
  RECIPES.filter((r) => r.machine === machineId);

export const ERA_NAMES = ["Hand Tools", "Smelting", "Steam", "Electric", "Chemical", "Nuclear"];
