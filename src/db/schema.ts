import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** One shared, persistent mine per save. */
export const worlds = pgTable("worlds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  seed: integer("seed").notNull(),
  tech: jsonb("tech").$type<string[]>().notNull().default([]),
  reactor: jsonb("reactor")
    .$type<{
      temperature: number;
      rods: number;
      on: boolean;
      scrammed: boolean;
      meltdownAt: number | null;
      radiationUntil: number | null;
    }>()
    .notNull(),
  flags: jsonb("flags").$type<{ everHad: string[]; maxDepth: number }>().notNull().default({ everHad: [], maxDepth: 0 }),
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A persistent survivor. Identity is a browser-generated token. */
export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    worldId: integer("world_id").notNull(),
    token: text("token").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#f59e0b"),
    x: doublePrecision("x").notNull().default(48),
    y: doublePrecision("y").notNull().default(58),
    z: doublePrecision("z").notNull().default(48),
    yaw: doublePrecision("yaw").notNull().default(0),
    pitch: doublePrecision("pitch").notNull().default(0),
    health: doublePrecision("health").notNull().default(100),
    stamina: doublePrecision("stamina").notNull().default(100),
    oxygen: doublePrecision("oxygen").notNull().default(100),
    heat: doublePrecision("heat").notNull().default(0),
    radiation: doublePrecision("radiation").notNull().default(0),
    inventory: jsonb("inventory").$type<({ item: string; count: number } | null)[]>().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("players_token_idx").on(table.token)],
);

/** Only mined/placed blocks are stored. Everything else regenerates from the seed. */
export const blockChanges = pgTable(
  "block_changes",
  {
    id: serial("id").primaryKey(),
    worldId: integer("world_id").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    z: integer("z").notNull(),
    block: integer("block").notNull(),
    playerId: integer("player_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("block_changes_world_idx").on(table.worldId, table.id)],
);

/** Player-built structures. One row per placed machine block. */
export const machines = pgTable(
  "machines",
  {
    id: serial("id").primaryKey(),
    worldId: integer("world_id").notNull(),
    type: text("type").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    z: integer("z").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    recipeId: text("recipe_id"),
    progress: doublePrecision("progress").notNull().default(0),
    fuel: integer("fuel").notNull().default(0),
    burn: doublePrecision("burn").notNull().default(0),
    inputs: jsonb("inputs").$type<({ item: string; count: number } | null)[]>().notNull(),
    outputs: jsonb("outputs").$type<({ item: string; count: number } | null)[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("machines_world_idx").on(table.worldId)],
);

/** Team chat, system notifications and reactor alarms. */
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    worldId: integer("world_id").notNull(),
    kind: text("kind").notNull(),
    author: text("author"),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_world_idx").on(table.worldId, table.id)],
);
