# DEEPCORE

**A persistent, online co-op voxel mining game. One steel pickaxe, one shared mine, six layers down to a working reactor.**

Deepcore is built around a single loop: *dig deeper → haul ore home → build a structure → unlock a better tool → dig deeper*. The endgame is a uranium chain (crusher → leach → precipitate → convert → enrich → fabricate), a controllable reactor, and a **Nuclear Drill** that removes a 3×3 face per swing and opens the mantle.

This repository contains a complete, playable **web edition** of the design: a deterministic voxel world generated in the browser and re-generated authoritatively on the server, a Three.js first-person renderer, a server-authoritative simulation (mining, machines, power, research, hazards, reactor), and PostgreSQL persistence through Drizzle ORM. See `docs/PLAN.md` for how this maps onto the Rust/Bevy workspace described in the original brief, and `PROGRESS.md` for exactly what is and is not implemented.

---

## Quick start

```bash
npm install
npx drizzle-kit push        # create worlds / players / machines / block_changes / events
npm run dev                 # http://localhost:3000
# or
npm run build && npm run start
```

Environment: `DATABASE_URL` (already present in `.env`, e.g. `postgresql://postgres:postgres@127.0.0.1:5432/app_db`).

Health probe: `GET /api/health`.

There is **no downloaded art**: the mine is built from vertex-coloured geometry generated from the block registry, players from primitives, and the menu uses one generated backdrop image.

---

## How to play

1. Enter a callsign, press **Enter the mine**. You spawn at the flat camp with a steel pickaxe and a helmet lamp.
2. Chop a tree (`LMB` on a trunk) for **timber** (8 timber). Press `B` → **Workbench** → place it at camp.
3. Dig **clay** and **coal** in the topsoil. With 4 **copper ingots** (from malachite in the Shale Beds) and 12 timber, build the **Research Desk**.
4. Open `R`, deliver **8 coal + 8 clay** to research **Smelting**. Build the **Brick Kiln** (clay + cobblestone), fire bricks, then build the **Stone Furnace**.
5. Load ore + coal into the furnace through its panel. Research **Metallurgy → Steelmaking**, build the **Blast Furnace**, make steel, then forge the **Hardened Steel Pickaxe** at the Anvil. Tier 2 opens the Granite Depths.
6. Keep going: steam power → electricity → chemistry → rare earths → uranium. The `O` objectives panel walks you through the first hour.

### Controls

| Key | Action |
| --- | --- |
| `WASD`, `Shift`, `Ctrl`/`C`, `Space` | Walk, sprint, crouch, jump (1-block auto step-up) |
| Mouse | Look (click the canvas to capture the pointer) |
| `LMB` hold | Mine the targeted block; `RMB` on a structure opens its terminal |
| `1`–`9` | Select hotbar slot |
| `E` / `B` / `R` / `O` / `M` | Pack / Blueprints / Research / Objectives / Field manual |
| `Enter` | Team chat · **`G`** ore scanner · `Esc` release pointer / close panel |

The best drill you carry is always the one the server uses, and the server validates reach (5 blocks, 6.2 with drills), tool tier, line of sight, mining duration, materials, power and machine reach.

---

## Layers

| # | Layer | Depth | Tier | Ores | Hazard |
| --- | --- | --- | --- | --- | --- |
| 1 | Topsoil | 0–7 | 1 | Coal, clay, sand, malachite | — |
| 2 | Shale Beds | 7–18 | 1 | Coal, copper, tin, iron | Darkness |
| 3 | Granite Depths | 18–30 | 2 | Iron, lead, zinc, sulfur, quartz, bauxite, salt | Heat seeps |
| 4 | Basalt Furnace | 30–42 | 3 | Nickel, tungsten, chromium, graphite, fluorite, zircon, gold | Heat |
| 5 | Deep Crust | 42–51 | 4 | Pitchblende, monazite | Radiation, cave-ins |
| 6 | Mantle Edge | 51–56 | 5 | Dense pitchblende, core crystals | Extreme heat/radiation |

Break time = `hardness / (tool_speed × power_multiplier)`, served from the shared rule module. **Nuclear Drill**: tier 5, 12× speed, 3×3 face, ~100× a starting pickaxe.

---

## Implemented systems

- **Deterministic world** — value-noise caves, hash-clustered ore veins, camp plateau, descending access ramp, trees. Same seed and coordinates always yield the same block; only player edits are stored.
- **Server authority** — join tokens, movement sanity limits, mining sessions with duration checks, line-of-sight raycasts, tier rules, reach limits, build/recipe/research validation. Invalid intents are rejected and never crash the tick.
- **Inventory** — 45 slots (9 hotbar + 36 pack), stack limits, drag-free pick/swap, quick-move, server-validated moves, drops on mining with overflow reporting.
- **Multiplayer presence** — a shared world row, team chat/event feed, interpolated remote avatars, 16-player design target, 1.3 s state polling for teams/machines plus immediate action responses.
- **Content registry** — 97 items, 36 blocks, 33 structures, 63 recipes, 23 research nodes, 6 layers, all in `src/game/content.ts` and validated at module load (unknown ids, bad parents, unused outputs, missing machine references fail fast).
- **Machines** — timing-based processors with input/output slots, coal fuel, brownout-scaled progress, idle reasons (`No power`, `Out of coal`, `Missing Sulfuric Acid`, `Output full`), recipe switching, refunder dismantling.
- **Steam/electric grid** — boilers/engines/generators/turbines supply kW, machines demand kW, brownouts scale speed, battery banks cushion deficits, hand pumps gate steam, the reactor adds 2400 kW scaled by rod position.
- **Research** — team tech tree with material deliveries, parent requirements, era gating and unlock-aware blueprints.
- **Hazards** — depth-scaled body heat, radiation dose from pitchblende/waste/reactor incidents (hazmat suit −80 %, cooling suit + vent fans for heat, decon shower flush), dose/heat damage and camp recovery. The client adds screen grain/vignettes and a proximity Geiger.
- **Nuclear chain** — crusher, leaching tank, precipitator, conversion plant, cascade-scaled centrifuge, fuel fabricator, control rods, reactor console with rods/SCRAM/overheat/meltdown radiation zone, cooling pool, waste vault, compact core cell and the Nuclear Drill.
- **Persistence** — world seed, edits, players, inventories, vitals, machines, tech, reactor state and events survive restarts.

## Not implemented (see PROGRESS.md)

Rust/Bevy binaries, UDP replication and client prediction, flooding/gas simulation, cave-ins, minecarts/lifts, conveyors, pure HUD-vs-egui parity, headless bots, accounts/lobby browser, audio assets. This edition runs the same loops over HTTP + Postgres instead.

---

## Architecture

```
src/
├── game/
│   ├── content.ts     # every item, block, machine, recipe, tech node, layer + validator
│   ├── world.ts       # deterministic WorldGen, layers, break formula, reach, area mining
│   ├── inventory.ts   # slot math, stacking, costs, quick-move
│   ├── server.ts      # authoritative actions, machine ticks, power, hazards, reactor
│   └── types.ts       # protocol shapes (snapshots, intents, results)
├── db/                # Drizzle schema + pooled client
├── app/
│   ├── page.tsx       # landing + game shell
│   └── api/           # health, summary, state, action
└── components/
    ├── DeepcoreApp.tsx    # menu, HUD, chat, polling, action dispatch
    └── game/
        ├── engine.ts      # Three.js chunks, physics, raycast, mining, remotes
        ├── panels.tsx     # inventory, blueprints, research, objectives, manual
        └── MachinePanel.tsx
```

**Data flow.** The browser keeps its own deterministic chunk cache for rendering and collision (`WorldGen` + a sparse edit overlay). Every intent is an HTTP POST; the server validates it against the same shared rules, applies it, ticks machines/power/hazards, and returns a fresh snapshot. Block edits are appended to `block_changes`; clients apply edits and remesh only the affected chunks.

**Protocol (web edition).** `GET /api/state?token&since&name` → snapshot; `POST /api/action` with `{ token, name, action, ... }` → `{ ok, message, state?, changes?, oreScan? }`. Actions: `move`, `minestart`, `minefinish`, `build`, `dismantle`, `machineRecipe`, `machineToggle`, `machineLoad`, `machineTake`, `research`, `decon`, `reactor`, `chat`, `respawn`, `moveItems`, `scan`.

---

## Adding content

All content is data in `src/game/content.ts` (the analogue of the RON files in the brief). To add an ore:

1. Add the **item** it drops, e.g. `item("raw_cobalt", "Raw Cobalt", "raw", "#4a7fd8")`.
2. Add a **block** with hardness, minimum tier, colour, drops and `ore: true`.
3. Reference it from a **layer**'s `ores` list with a frequency and vein size.
4. Add at least one **recipe** or build/research cost that consumes the item — the validator rejects dead-end outputs.
5. Add a processing recipe that uses it in a machine, and (optionally) a tech node that unlocks it.

The validator runs on import and fails the build with readable messages for unknown item/machine/tech ids, missing parents, non-ore blocks in ore tables, and unused recipe outputs.

Balance knobs: block `hardness`/`minTier`, tool `speed`/`tier`/`area`, recipe `time`/`inputs`/`outputs`, machine `kw`/`producerKw`/`fuel`, tech `cost`, layer `freq`/`size`. Layer depth bands are matched by `SURFACE_Y - y`, so changing a band shifts the whole mine consistently on both sides.

---

## Persistence and reset

State lives in Postgres: `worlds`, `players`, `block_changes`, `machines`, `events` (`src/db/schema.ts`). The seed is created once (`20260214`) and reused.

```sql
-- reset a save to a fresh mine
DELETE FROM block_changes; DELETE FROM machines; DELETE FROM events; DELETE FROM players;
UPDATE worlds SET tech = '["hand_tools"]'::jsonb,
  flags = '{"everHad": [], "maxDepth": 0}'::jsonb,
  reactor = '{"temperature":22,"rods":0,"on":false,"scrammed":false,"meltdownAt":null,"radiationUntil":null}'::jsonb;
```

Apply schema changes with `npx drizzle-kit push`.

## Validation

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

## Deployment notes

The app is a single Next.js process with a Postgres dependency and no external services. Any Node host plus managed Postgres works; start with `npm run build && npm run start`. The world seed is shared by all players. For the Rust/Bevy dedicated server and the separate `lobby` service described in the brief, follow `docs/PLAN.md`; they are not part of this build.

## License

MIT for the code in this repository. Generated imagery is included for the project only.
