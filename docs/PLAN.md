# Deepcore — design and build plan

## 1. What the game is

Deepcore is a shared, persistent co-op voxel mine. A team spawns on a flat camp above a deep shaft, each player with a steel pickaxe. Depth is the progression axis: harder rock, richer ores and worse hazards the further down you go. Ore must be hauled to the base, where structures convert it. Each structure unlocks a better tool, which opens the next layer.

The intended ladder:

| Era | Materials | Structures | Tool |
| --- | --- | --- | --- |
| 0 Hand Tools | Topsoil / Shale | Workbench, crate, lamp, Research Desk | Steel pickaxe, T1, 1× |
| 1 Smelting | Layers 1–2 | Brick Kiln, Stone Furnace, Anvil, Blast Furnace | Hardened steel, T2, 1.6× |
| 2 Steam | Layers 1–3 | Pump, Boiler, Engine, Crusher, Washer | Steam drill, T3, 3× |
| 3 Electric | Layer 3 | Turbine, Generator, Battery, Arc Furnace, Electrolysis, Circuits | Ore scanner |
| 4 Chemical | Layer 4 | Chemical Plant, Alloy Furnace, Machine Shop, Rare-Earth Separator, Decon | Tungsten drill, T4, 5× |
| 5 Nuclear | Layers 5–6 | Leach, Precipitate, Convert, Centrifuge cascade, Fuel Fabricator, Reactor, Cooling Pool, Waste Vault | **Nuclear drill, T5, 12×, 3×3** |

The nuclear chain is six physical structures plus a controllable reactor; the endgame reward is boring 3×3 tunnels into the mantle.

## 2. Runtime model chosen for this build

The brief specifies Rust + Bevy + `bevy_replicon` in a four-crate workspace. That is the right target for a shipped dedicated-server game, but this execution environment is a Node/Next.js + PostgreSQL sandbox with no Rust toolchain, no GPU, and no long-lived process supervisor for a Bevy client. Shipping an uncompiled Rust tree would be unverifiable and would violate the brief's "no stubs" rule.

This build therefore delivers the **complete game design as a playable, persistent online game** with the same architectural rules:

- `shared` equivalent (`src/game/content.ts`, `world.ts`, `inventory.ts`, `types.ts`): pure, deterministic game logic with no rendering and no database.
- `server` equivalent (`src/game/server.ts` + `/api/*`): authoritative simulation — intents in, validated state out.
- `client` equivalent (`src/components/**`): a Three.js first-person renderer, local movement prediction, procedural meshes and an industrial terminal UI.
- Persistence is PostgreSQL (a stronger fit than SQLite for a web deployment) instead of region files + SQLite.

### Determinism and authority

Both sides instantiate the same `WorldGen(seed)`. The server stores only edits in `block_changes`; the client renders the same base world and overlays edits. Mining is server-timed: `minestart` opens a session, `minefinish` is accepted only if the elapsed time matches the break formula, the block is in reach, line of sight is clear, the tool tier is sufficient, and the session exists. The client predicts only its own walking and mining animation.

## 3. Rust workspace layout (target implementation)

The plan for the native edition, unchanged from the brief:

```
deepcore/
├── Cargo.toml                  # pinned Bevy + replicon versions, dev dynamic_linking
├── assets/data/*.ron           # blocks, items, recipes, machines, tech_tree, layers, hazards
├── assets/shaders/voxel.wgsl
├── crates/
│   ├── shared/  content/ voxel/ worldgen/ movement/ inventory/ crafting/ power/ hazards/ protocol/
│   ├── server/  net/ world/ sim/ main.rs
│   ├── client/  render/ input/ prediction/ ui/ hud/ audio/ main.rs
│   └── lobby/   axum + sqlx accounts, tokens, server list
└── tools/atlas_gen/            # procedural 16×16 texture atlas
```

Each feature is a Bevy plugin (`MiningPlugin`, `InventoryPlugin`, `PowerGridPlugin`, …). The server runs a fixed 30 Hz `FixedUpdate` tick; chunk generation and meshing run on worker/task pools; content lives in RON and is hashed for the handshake; chunk edits are packed with `postcard` + `zstd` into region files; players/machines/tech/reactor state go to SQLite.

## 4. Milestones and how this build maps to them

| Milestone | Native acceptance criteria | Status in this build |
| --- | --- | --- |
| M0 Skeleton | Window + cube; headless 30 Hz server; `scripts/check.sh` | Web app boots; server tick budget modelled in `runTick`; typecheck/build gates |
| M1 Voxel world | Palette chunks, deterministic generation, atlas, greedy meshing, AABB controller, raycast, mining/placing, hotbar, depth | Deterministic chunk generation, face-culled vertex-colour meshing, AABB controller with step-up, DDA raycast, tier mining, hotbar, depth/layer HUD. Palette compression/atlas deferred (browser geometry instead) |
| M2 Multiplayer | Handshake, streaming, interest management, prediction, validated intents, menu, latency flags, bots | Shared-world join with tokens, immediate action responses + 1.3 s snapshots, interpolation, server validation, menu, live team list. Latency simulation and bots deferred |
| M3 Content & Era 0 | RON loaders + validator + balance report, inventory UI, hand crafting, trees, timber, lamps, darkness | Registry + validator, 97 items / 63 recipes / 33 structures / 23 tech nodes, full inventory UI, trees/timber, build blueprints, dynamic darkness and headlamp |
| M4 Machines & Era 1 | Block entities, multi-block, machine UI, fuel, kiln/furnace/anvil/blast furnace, research tree UI | Single-block structures with terminal UI, coal fuel, all four Era-1 processors, research desk + tree UI. Multi-block footprints deferred |
| M5 Steam & logistics | Pipe/steam solver, pump/boiler/engine, crusher/washer yields, conveyors, rails/lift, steam drill, flooding | Steam supply/demand solver with water gating, boiler/engine/turbine, crusher/washer with yield recipes, steam drill. Conveyors, rails, lifts and flooding deferred |
| M6 Electric | Cable network, brownout scaling, batteries, arc/electrolysis/circuits, modules, scanner, gas | Grid kW supply/demand, brownout progress scaling, battery cushion, arc furnace, electrolysis, circuit assembler, ore scanner. Cable topology, modules and gas deferred |
| M7 Chemical | Chemical plant, alloys, machine shop, rare earths, decon, heat/cave-ins, suits, Geiger, tungsten drill | Chemical plant → fluorine/acid, alloy furnace, machine shop, rare-earth separator, decon shower, heat + radiation + suits/Geiger. Cave-ins deferred |
| M8 Nuclear | Processing, cascade, fuel, reactor console/scram/meltdown, waste, nuclear drill, radiation, integration test | Complete chain playable; cascade speeds cycles; reactor rods/SCRAM/overheat/meltdown radiation zone; cooling pool/vault; 3×3 nuclear drill; smoke-tested via API |
| M9 Persistence & polish | Region/SQLite saves, autosave, audio, particles, menus, settings, objectives, balance | Every mutation is persisted immediately; objectives panel, menu, HUD, event feed, Geiger audio clicks, screen effects. Region files/autosave/particles/settings deferred |
| M10 Accounts & server browser | Lobby accounts, argon2, tokens, server registry, browser, Docker | Single shared world reachable by URL; per-browser survivor token only. Lobby/browser/Docker deferred |

## 5. Gameplay tuning decisions

- **One base, one team tree.** Tech is stored on `worlds.tech`; inventories are per player. Machines are shared and anyone may operate them.
- **Best carried drill is equipped.** Avoids hotbar fumbling while keeping the server as the tool authority.
- **Machines default to running** so a placed furnace visibly does something; every machine explains its idle reason.
- **Power is base-wide** (supply vs demand) instead of per-cable topology. Brownouts scale processing speed, which preserves the intended pressure without a cable graph.
- **Hazards are live but forgiving.** Heat and dose accumulate with depth; suits, vents and the decon shower counter them; death returns you to camp with gear.
- **World size** 96×96×64 with a 56-block descent and a carved access ramp. Layer bands are scaled from the brief so all six layers remain reachable in a session.
- **Content volumes** are tuned for a playable session: 33 structures cover every Era-gating step rather than the full 40–50 list.

## 6. Progression audit (circular-dependency pass)

Checked and fixed before closing content:

- Control rods are crafted *after* researching Nuclear Power, not as its cost.
- Circuit Mk2 unlocks with Electronics (gold from the Basalt layer), so the tungsten drill is obtainable before the Deep Crust.
- The Arc Furnace does not require its own carbon electrodes; electrodes are consumed by the Alloy Furnace, which sits after Arc Smelting.
- Monazite is tier 4 (Deep Crust), so rare-earth research is reachable with the tungsten drill.
- Every recipe output has a consumer; the validator enforces it.
- Concrete path: timber → workbench → desk → smelting → kiln/furnace → anvil → steelmaking → blast furnace → hardened pickaxe → steam → power → crusher → generator/turbine → arc/electrolysis/electronics → chemistry → alloys/shop → tungsten drill → uranium → leach → yellowcake → UF6 → centrifuge → core cell → reactor → nuclear drill.

## 7. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Client/server divergence | One shared `WorldGen` and one shared break/inventory rule set; only edits are stored |
| Chunk load hitch | Async queue limited to two meshed chunks per frame, fog hides the edge, edits remesh only affected chunks |
| Poll-based multiplayer lag | Action responses update state immediately; remote avatars interpolate; 420 ms movement posts |
| Progression dead ends | Validator + manual circular-dependency audit + API-driven smoke tests |
| Database drift | Versioned Drizzle schema, `drizzle-kit push`, seed created once with explicit defaults |
| WebGL gaps (software rendering) | Graceful world still boots; canvas retains HUD and server remains playable via actions |
