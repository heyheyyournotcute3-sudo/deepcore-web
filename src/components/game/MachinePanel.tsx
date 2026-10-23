"use client";

import { useMemo, useState } from "react";
import { ITEM_BY_ID, MACHINE_BY_ID, RECIPES, TECH_BY_ID } from "@/game/content";
import { countItem } from "@/game/inventory";
import type { Action, MachineView, SelfState, WorldState } from "@/game/types";
import { CostList, ItemGlyph, initials } from "./panels";

export function MachinePanel({
  machine,
  state,
  onClose,
  send,
}: {
  machine: MachineView;
  state: WorldState;
  onClose: () => void;
  send: (action: Action) => void;
}) {
  const def = MACHINE_BY_ID.get(machine.type);
  const recipes = useMemo(() => RECIPES.filter((r) => r.machine === machine.type), [machine.type]);
  const active = recipes.find((r) => r.id === machine.recipeId) ?? null;
  const [rods, setRods] = useState(state.reactor.rods);
  if (!def) return null;

  const coalHeld = countItem(state.self.inventory, "coal");
  const self: SelfState = state.self;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-md border border-amber-300/25 bg-[#080d11] shadow-[0_30px_100px_#000]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-amber-400/10 to-transparent p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-sm font-mono text-sm font-bold text-black" style={{ background: def.color }}>
              {initials(def.name)}
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-white">{def.name}</h2>
              <p className="max-w-lg text-[11px] leading-snug text-white/45">{def.blurb}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded border border-white/15 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/60 hover:border-amber-300/50 hover:text-amber-100">
            Close
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-wider">
            <span className={`rounded px-2 py-1 ${machine.enabled ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-white/45"}`}>
              {machine.enabled ? "online" : "offline"}
            </span>
            {def.kw ? <span className="rounded bg-sky-400/10 px-2 py-1 text-sky-200">{def.kw} kW draw</span> : null}
            {def.producerKw ? <span className="rounded bg-emerald-400/10 px-2 py-1 text-emerald-200">+{def.producerKw} kW</span> : null}
            {def.fuel ? <span className="rounded bg-amber-400/10 px-2 py-1 text-amber-200">coal {machine.fuel}</span> : null}
            {def.requiresWater ? <span className={`rounded px-2 py-1 ${state.grid.water ? "bg-cyan-400/10 text-cyan-200" : "bg-rose-500/15 text-rose-200"}`}>{state.grid.water ? "water fed" : "no water feed"}</span> : null}
            <span className="rounded bg-white/5 px-2 py-1 text-white/40">
              {machine.x},{machine.y},{machine.z}
            </span>
            <button
              onClick={() => send({ action: "machineToggle", machineId: machine.id })}
              className="rounded border border-white/15 px-2 py-1 text-white/70 hover:border-amber-300/50 hover:text-amber-100"
            >
              {machine.enabled ? "Switch off" : "Start"}
            </button>
            <button
              onClick={() => {
                if (confirm(`Dismantle ${def.name}? All build materials are refunded.`)) {
                  send({ action: "dismantle", machineId: machine.id });
                  onClose();
                }
              }}
              className="rounded border border-rose-400/25 px-2 py-1 text-rose-200/80 hover:bg-rose-500/10"
            >
              Dismantle
            </button>
          </div>

          {machine.idle ? (
            <div className="rounded border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">
              <span className="font-mono text-[9px] uppercase tracking-widest text-amber-300/80">Status · </span>
              {machine.idle}
            </div>
          ) : null}

          {machine.type === "reactor" ? (
            <div className="rounded border border-emerald-300/25 bg-emerald-400/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-200">Reactor console</h3>
                <span className={`font-mono text-[10px] uppercase tracking-widest ${state.reactor.scrammed ? "text-rose-300" : "text-emerald-300"}`}>
                  {state.reactor.scrammed ? "scrammed" : state.reactor.on ? "critical" : "shutdown"}
                </span>
              </div>
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded border border-white/10 bg-black/30 p-2">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-white/35">Core temp</p>
                  <p className={`font-mono text-lg ${state.reactor.temperature > 780 ? "text-rose-300" : state.reactor.temperature > 640 ? "text-amber-300" : "text-emerald-200"}`}>
                    {Math.round(state.reactor.temperature)} °C
                  </p>
                </div>
                <div className="rounded border border-white/10 bg-black/30 p-2">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-white/35">Rods withdrawn</p>
                  <p className="font-mono text-lg text-amber-200">{state.reactor.rods}%</p>
                </div>
                <div className="rounded border border-white/10 bg-black/30 p-2">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-white/35">Output</p>
                  <p className="font-mono text-lg text-emerald-200">{state.reactor.on ? Math.round(2400 * (0.3 + 0.7 * (state.reactor.rods / 100))) : 0} kW</p>
                </div>
              </div>
              <div className="mb-3 h-2 overflow-hidden rounded bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500"
                  style={{ width: `${Math.min(100, state.reactor.temperature / 12)}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={rods}
                onChange={(e) => setRods(Number(e.target.value))}
                className="mb-2 w-full accent-emerald-400"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => send({ action: "reactor", rods, on: rods > 0 })}
                  className="rounded border border-emerald-300/40 bg-emerald-400/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-100"
                >
                  Withdraw to {rods}%
                </button>
                <button
                  onClick={() => send({ action: "reactor", rods: 0, on: false, scram: true })}
                  className="rounded border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-rose-100"
                >
                  SCRAM
                </button>
                <button
                  onClick={() => send({ action: "reactor", loadRod: true })}
                  className="rounded border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white/70"
                >
                  Load fuel rod ({countItem(self.inventory, "fuel_rod")})
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-snug text-white/40">
                Withdrawing rods raises power and heat. Without a Hand Pump on the base there is no coolant and no scram interlock: 780 °C will
                wreck the core and irradiate the camp for 20 minutes. Loaded fuel: {machine.inputs.reduce((n, s) => n + (s?.item === "fuel_rod" ? s.count : 0), 0)} rod(s).
              </p>
            </div>
          ) : null}

          {machine.type === "decon_shower" ? (
            <button
              onClick={() => send({ action: "decon", machineId: machine.id })}
              className="rounded border border-cyan-300/40 bg-cyan-400/15 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-cyan-100"
            >
              Flush radiation dose
            </button>
          ) : null}

          {recipes.length ? (
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">Recipe</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {recipes.map((recipe) => {
                  const locked = recipe.tech ? !state.tech.includes(recipe.tech) : false;
                  const selected = machine.recipeId === recipe.id;
                  return (
                    <button
                      key={recipe.id}
                      disabled={locked}
                      onClick={() => send({ action: "machineRecipe", machineId: machine.id, recipeId: recipe.id })}
                      className={`rounded border p-2 text-left transition ${
                        selected ? "border-amber-300/60 bg-amber-300/10" : locked ? "border-white/5 bg-black/20 opacity-50" : "border-white/10 bg-black/25 hover:border-amber-300/30"
                      }`}
                    >
                      <p className="text-[12px] text-white/85">{recipe.name}</p>
                      <p className="font-mono text-[9px] uppercase tracking-wider text-white/35">
                        {recipe.time}s
                        {recipe.tech ? ` · ${TECH_BY_ID.get(recipe.tech)?.name ?? recipe.tech}` : ""}
                        {locked ? " · locked" : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-white/50">
                        {recipe.inputs.map(([item, n]) => (
                          <span key={item} className="flex items-center gap-0.5 rounded bg-white/5 px-1">
                            <ItemGlyph item={item} size="sm" />×{n}
                          </span>
                        ))}
                        <span className="px-1 text-white/30">→</span>
                        {recipe.outputs.map(([item, n]) => (
                          <span key={item} className="flex items-center gap-0.5 rounded bg-emerald-400/10 px-1 text-emerald-100">
                            <ItemGlyph item={item} size="sm" />×{n}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {def.inputSlots || def.fuel ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-white/10 bg-black/25 p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">
                  {def.fuel ? "Fuel" : "Inputs"} {def.fuel ? `· ${machine.fuel} coal` : ""}
                </p>
                {def.fuel ? (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-9 items-center gap-1 rounded border border-white/10 bg-black/40 px-2 font-mono text-[11px] text-amber-100">
                      <ItemGlyph item="coal" size="sm" /> {machine.fuel}
                    </span>
                    <button
                      disabled={coalHeld < 1}
                      onClick={() => send({ action: "machineLoad", machineId: machine.id, item: "coal", count: 8, target: "fuel" })}
                      className="rounded border border-amber-300/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-100 disabled:opacity-30"
                    >
                      +8 coal ({coalHeld})
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {machine.inputs.map((slot, i) => (
                    <div key={i} className="relative flex h-12 w-12 items-center justify-center rounded-sm border border-white/10 bg-black/40">
                      {slot ? (
                        <>
                          <ItemGlyph item={slot.item} />
                          <span className="absolute bottom-0 right-1 font-mono text-[10px] text-amber-100">{slot.count}</span>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
                {active ? (
                  <div className="mt-3">
                    <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-white/30">Load from backpack</p>
                    <div className="space-y-1">
                      {active.inputs.map(([item, n]) => {
                        const held = countItem(self.inventory, item);
                        const loaded = countItem(machine.inputs, item);
                        return (
                          <div key={item} className="flex items-center justify-between gap-2 rounded bg-black/30 px-2 py-1">
                            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/70">
                              <ItemGlyph item={item} size="sm" />
                              <span className="truncate">{ITEM_BY_ID.get(item)?.name ?? item}</span>
                            </span>
                            <span className="flex items-center gap-1 font-mono text-[10px] text-white/40">
                              {loaded}/{n} in · {held} held
                              <button
                                disabled={held < 1}
                                onClick={() => send({ action: "machineLoad", machineId: machine.id, item, count: Math.max(n, 1) * 4, target: "input" })}
                                className="ml-1 rounded border border-white/15 px-1.5 py-0.5 uppercase text-amber-100 disabled:opacity-25"
                              >
                                load
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {!active && def.fuel ? <p className="mt-2 text-[10px] text-white/35">Fuel is burned while the structure is switched on.</p> : null}
              </div>

              <div className="rounded border border-white/10 bg-black/25 p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">Outputs</p>
                <div className="flex flex-wrap gap-1.5">
                  {machine.outputs.map((slot, i) => (
                    <button
                      key={i}
                      disabled={!slot}
                      onClick={() => send({ action: "machineTake", machineId: machine.id, index: i })}
                      className={`relative flex h-12 w-12 items-center justify-center rounded-sm border ${
                        slot ? "border-emerald-300/40 bg-emerald-400/10 hover:bg-emerald-400/20" : "border-white/10 bg-black/40"
                      }`}
                      title={slot ? "Collect" : "Empty"}
                    >
                      {slot ? (
                        <>
                          <ItemGlyph item={slot.item} />
                          <span className="absolute bottom-0 right-1 font-mono text-[10px] text-amber-100">{slot.count}</span>
                        </>
                      ) : null}
                    </button>
                  ))}
                </div>
                {active ? (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between font-mono text-[9px] uppercase tracking-widest text-white/35">
                      <span>{machine.enabled ? (machine.idle ?? "processing") : "paused"}</span>
                      <span>{Math.round(Math.min(100, (machine.progress / active.time) * 100))}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-white/10">
                      <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-300" style={{ width: `${Math.min(100, (machine.progress / active.time) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] text-white/40">
                      {active.time}s cycle · collects automatically into these slots; press an output to take it.
                    </p>
                  </div>
                ) : null}
                <div className="mt-3">
                  <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-white/30">Blueprint cost</p>
                  <CostList cost={def.cost} self={self} />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded border border-white/10 bg-black/25 p-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-white/35">Structure</p>
              <p className="text-[11px] leading-relaxed text-white/50">
                {def.category === "station"
                  ? "Passive camp structure. Blueprints are available from the build menu; research and crafting are team-wide."
                  : "Passive utility. Its effect applies while it is online and you are nearby."}
              </p>
            </div>
          )}

          <p className="text-[10px] text-white/25">Every state change here is validated and applied by the server, then broadcast to the team.</p>
          <p className="text-[10px] text-white/20">{state.grid.supply} kW supply · {state.grid.demand} kW demand · grid at {Math.round(state.grid.factor * 100)}%</p>
        </div>
      </div>
    </div>
  );
}
