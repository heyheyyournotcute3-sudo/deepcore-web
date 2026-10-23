# PROGRESS — Deepcore

**Last updated during the build session that produced this repository.**
Hand this file to the next session first: it lists exact commands, what works, what is deferred, known bugs and the immediate next steps.

## Run commands

```bash
npm install
npx drizzle-kit push                 # required once, or after schema edits
npm run dev                          # dev on :3000
# production / health check
npm run build && npm run start
curl localhost:3000/api/health
```

Validation gates used each milestone:

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

Reset a save to a fresh mine (SQL):

```sql
DELETE FROM block_changes; DELETE FROM machines; DELETE FROM events; DELETE FROM players;
UPDATE worlds SET tech = '["hand_tools"]'::jsonb,
  flags = '{"everHad": [], "maxDepth": 0}'::jsonb,
  reactor = '{"temperature":22,"rods":0,"on":false,"scrammed":false,"meltdownAt":null,"radiationUntil":null}'::jsonb;
```

## Status by milestone

- **M0 Skeleton — done (web edition).** Next.js App Router + Drizzle/Postgres, dark industrial UI, `/api/health`, `/api/state`, `/api/action`, `/api/summary`. Rust/Bevy workspace not built in this environment (see `docs/PLAN.md` §2).
- **M1 Voxel world — done.** Deterministic `WorldGen` (96×96×64, surface y≈56, six depth bands, caves, hash-clustered veins, camp plateau, access ramp, trees, bedrock). Face-culled vertex-colour chunk meshes on a 2-chunks/frame budget. AABB controller with gravity, sprint, crouch, 1-block step-up, jump. DDA block targeting, outline, tier-aware break formula, 3×3 area mining for the Nuclear Drill, depth/layer HUD, procedural darkness/headlamp.
- **M2 Multiplayer foundation — partial.** Shared persistent world; per-browser survivor token; movement posts every 420 ms with server distance/every-check bounds; mining sessions server-timed and validated; line-of-sight raycast; immediate action snapshots + 1.3 s polling; remote avatar interpolation; chat/event feed. **Deferred:** websocket/UDP transport, interest management, latency/loss simulation, bots, true client prediction/reconciliation.
- **M3 Content, inventory, Era 0 — done.** Validated registry (97 items, 36 blocks, 33 machines, 63 recipes, 23 tech nodes, 6 layers). 45-slot inventory with swap/merge and server-validated moves; hotbar; overlay panels; objectives; help manual; trees/timber; headlamp; blueprint placement and full material refunds on dismantle.
- **M4 Machines & Era 1 — done (single-block).** Workbench, Research Desk, Brick Kiln, Stone Furnace, Anvil, Blast Furnace. Coal fuel, input/output slots, recipe switching, idle reasons, progress bars, research tree with material delivery, tech-gated blueprints. **Deferred:** multi-block footprints/rotation ghosts.
- **M5 Steam & Era 2 — partial.** Boiler/engine supply kW, hand pump gates steam, crusher and washer with yield recipes, steam drill. **Deferred:** pipe networks, conveyors/item pipes, rails/minecarts, lifts, flooding/oxygen.
- **M6 Electric & Era 3 — partial.** Base-wide kW supply/demand, brownout scaling, battery banks, arc furnace, electrolysis, circuit assembler, ore scanner, vent fans (heat). **Deferred:** cable topology/network overlay, upgrade modules, gas pockets.
- **M7 Chemical & Era 4 — partial.** Chemical plant, alloy furnace, machine shop, rare-earth separator, decon shower, heat and radiation hazards, cooling suit/respirator/hazmat/Geiger, tungsten drill. **Deferred:** cave-ins, flood/gas simulation, respirator mechanical effect.
- **M8 Nuclear — done at gameplay level.** Crusher → leaching tank → precipitator → conversion → cascade-scaled centrifuge → fuel fabricator → fuel rods / compact core cells → reactor console (rods, SCRAM, overheat, meltdown radiation zone) → cooling pool / waste vault → **Nuclear Drill**. Verified through API smoke tests: reactor supplied 1616 kW at 45 % rods with two rods loaded, scram event fired, leaching produced uranium solution + tailings, kiln produced bricks, power demand/brownout math works.
- **M9 Persistence & polish — partial.** Every mutation writes immediately to Postgres; edits, inventories, vitals, machines, research, reactor, chat survive restarts. Objectives panel, event feed, Geiger audio clicks, radiation/heat/low-health screen effects, menu. **Deferred:** region files/autosave batching, particles, machine animations, settings/keybinds, audio assets, dedicated balance-report binary.
- **M10 Accounts & browser — deferred.** Single shared world at the app URL with anonymous survivor tokens; no lobby/accounts/server browser/Docker.

## Known bugs / rough edges

1. **Reactor display is one tick behind** in HTTP responses less than one tick old; it converges on the next poll (the tick's fresh reactor state is not written to the snapshot object). Cosmetic.
2. **Chunk load stutter** for a fraction of a second at spawn while ~100 chunk meshes stream in at two per frame. Fog hides the edge; generation is deterministic so it converges.
3. **No client reconciliation.** If the server rejects a movement post, the local camera keeps its predicted position until the next teleport-scale correction (>6 blocks). Normal play stays within the accepted delta.
4. **Block edits are loaded in bulk on first state fetch** (limit 6000). A very long-lived world with millions of edits would need pagination or region files.
5. **World is shared globally per database.** Multiple independent servers would need a world selector; the schema already keys everything by `worldId`.
6. **Machines are single-voxel.** Reactor multi-block shell requirement is abstracted into its build cost.
7. **No water or gas fluid simulation.** Heat/radiation stand in for the deeper hazard set.
8. **Fuel/steam have no pipe topology.** Supply is summed base-wide; pipes are a build cost only.
9. **Generated backdrop image** is the only binary asset; all in-world art is procedural.
10. **`markEverHad` reads a stale world row** within a single request, so an objective can appear one request late. Correct after the next poll.

## Smoke-test evidence (last run)

- Join creates a survivor at `(48.5, 57.2, 48.5)`, steel pickaxe + headlamp, tech `["hand_tools"]`.
- Mining the camp surface block succeeds after the tuned delay and drops sand; `minefinish` without `minestart` → `Mining session expired`.
- Builds reject missing materials and out-of-reach positions; mining granite with the T1 pickaxe reports tier failure when in reach.
- Research `smelting` consumed 8 coal + 8 clay and unlocked the desk branch.
- Brick kiln with coal fuel produced bricks and could be collected from the output slot.
- Leaching tank produced uranium solution + radioactive tailings with the generator online; grid reported 140 kW supply / 60 kW demand.
- Reactor accepted two fuel rods, produced 1476 kW at 45 % rod withdrawal, and SCRAM logged a team alarm event.
- Content validator runs at module import: unknown item/machine/tech ids, missing parents and dead-end recipe outputs fail the build.

## Next steps (in order)

1. Add websocket (or SSE) state streaming and client reconciliation to replace 1.3 s polling; reuse `src/game/server.ts` unchanged.
2. Add cable/pipe graph solving (topology recomputed on placement, per-tick numeric solve) and the power overlay.
3. Implement flooding/gas cellular simulation plus the pump/vent counterplay, then oxygen damage.
4. Multi-block reactor shell + scram panel validation and a cooling-pool/waste radiation field.
5. Split inventories into a tabbed storage UI and add storage crates as real containers.
6. Add a `balance_report` script that walks the tech tree and prints raw ore totals per era.
7. Port the simulation to the Rust workspace in `docs/PLAN.md` if a Bevy-capable environment is available; keep content ids and tuning identical.
