"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ERA_NAMES, ITEM_BY_ID, LAYERS, MACHINE_BY_ID, MACHINES, TECH } from "@/game/content";
import type { ActionResult, Action, WorldState } from "@/game/types";
import { DeepcoreEngine, type HudState, type Target } from "./game/engine";
import { BuildPanel, Hotbar, InventoryPanel, ManualPanel, ObjectivesPanel, ResearchPanel } from "./game/panels";
import { MachinePanel } from "./game/MachinePanel";

type Panel = null | "inventory" | "build" | "research" | "objectives" | "manual";
type Toast = { id: number; kind: "info" | "error" | "good"; text: string };

const EMPTY_HUD: HudState = {
  depth: 0,
  layer: "Topsoil",
  fps: 0,
  target: null,
  requirement: null,
  canMine: false,
  progress: 0,
  geiger: 0,
  x: 48,
  y: 56,
  z: 48,
  grounded: false,
};

const initialCallsign = () => {
  if (typeof window === "undefined") return "Prospector";
  return localStorage.getItem("deepcore.callsign") ?? "Prospector";
};

export default function DeepcoreApp() {
  const [token, setToken] = useState("");
  const [callsign, setCallsign] = useState("Prospector");
  const [screen, setScreen] = useState<"menu" | "joining" | "game">("menu");
  const [state, setState] = useState<WorldState | null>(null);
  const [boot, setBoot] = useState<WorldState | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [buildArmed, setBuildArmed] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [locked, setLocked] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [summary, setSummary] = useState<{ players: number; tech: number; maxDepth: number; structures: number } | null>(null);

  const engineRef = useRef<DeepcoreEngine | null>(null);
  const stateRef = useRef<WorldState | null>(null);
  const cursorRef = useRef(0);
  const tokenRef = useRef("");
  const nameRef = useRef("Prospector");
  const toastId = useRef(0);

  useEffect(() => {
    let id = localStorage.getItem("deepcore.token");
    if (!id) {
      id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `survivor-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      localStorage.setItem("deepcore.token", id);
    }
    setToken(id);
    tokenRef.current = id;
    const stored = initialCallsign();
    setCallsign(stored);
    nameRef.current = stored;
    fetch("/api/summary")
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setSummary({
            players: Number(data.players ?? 0),
            tech: Array.isArray(data.tech) ? data.tech.length : Number(data.tech ?? 0),
            maxDepth: Number(data.maxDepth ?? 0),
            structures: Number(data.buildable ?? 0),
          });
        }
      })
      .catch(() => undefined);
  }, []);

  const pushToast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
  }, []);

  const applyState = useCallback((next: WorldState) => {
    const engine = engineRef.current;
    if (engine) {
      engine.applyChanges(next.changes ?? []);
      engine.setMachines(next.machines);
      engine.setPlayers(next.players, next.self.id);
    }
    cursorRef.current = Math.max(cursorRef.current, next.cursor ?? 0);
    const prev = stateRef.current;
    stateRef.current = next;
    setState(next);
    if (engine) {
      const moved = prev ? Math.hypot(next.self.x - prev.self.x, next.self.y - prev.self.y, next.self.z - prev.self.z) : 0;
      if (!prev || moved > 6) engine.teleport(next.self.x, next.self.y, next.self.z);
      const tool = next.self.tool ? ITEM_BY_ID.get(next.self.tool)?.tool ?? null : null;
      engine.setTool(tool);
    }
  }, []);

  const send = useCallback(
    async (action: Action, quiet = false): Promise<ActionResult | null> => {
      if (!tokenRef.current) return null;
      try {
        const res = await fetch("/api/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...action, token: tokenRef.current, name: nameRef.current }),
        });
        const data = (await res.json()) as ActionResult;
        if (!data.ok) {
          if (!quiet && data.message) pushToast("error", data.message);
          return data;
        }
        if (data.changes?.length) engineRef.current?.applyChanges(data.changes);
        if (data.state) applyState(data.state);
        if (data.toast && !quiet && action.action !== "move") pushToast(data.toast.kind, data.toast.text);
        if (data.oreScan) {
          const nearest = data.oreScan[0];
          pushToast("info", nearest ? `Scanner: ${nearest.key.replace(/_/g, " ")} ${nearest.distance.toFixed(1)}m away at y=${nearest.pos[1]}` : "Scanner: no ore within 16 blocks");
        }
        return data;
      } catch {
        if (!quiet) pushToast("error", "Lost connection to Shaft 01");
        return null;
      }
    },
    [applyState, pushToast],
  );

  const join = useCallback(async () => {
    if (!tokenRef.current) return;
    const name = callsign.trim().slice(0, 18) || "Prospector";
    nameRef.current = name;
    localStorage.setItem("deepcore.callsign", name);
    setScreen("joining");
    try {
      const res = await fetch(`/api/state?token=${encodeURIComponent(tokenRef.current)}&since=0&name=${encodeURIComponent(name)}`);
      const data = (await res.json()) as WorldState & { ok: boolean; message?: string };
      if (!data.ok) {
        pushToast("error", data.message ?? "Unable to enter the mine");
        setScreen("menu");
        return;
      }
      cursorRef.current = data.cursor ?? 0;
      stateRef.current = data;
      setState(data);
      setBoot(data);
      setScreen("game");
    } catch {
      pushToast("error", "The shaft did not answer. Try again.");
      setScreen("menu");
    }
  }, [callsign, pushToast]);

  const engineCallbacks = useRef({
    onHud: (next: HudState) => setHud(next),
    onMove: (m: { x: number; y: number; z: number; yaw: number; pitch: number; sprint: boolean; crouch: boolean }) =>
      void send({ action: "move", ...m }, true),
    onMineStart: (t: Target) => void send({ action: "minestart", x: t.x, y: t.y, z: t.z, nx: t.nx, ny: t.ny, nz: t.nz }, true),
    onMineFinish: (t: Target) => void send({ action: "minefinish", x: t.x, y: t.y, z: t.z, nx: t.nx, ny: t.ny, nz: t.nz }),
    onPlace: (pos: { x: number; y: number; z: number }) => {
      setBuildArmed((armed) => {
        if (!armed) return armed;
        void send({ action: "build", machine: armed, x: pos.x, y: pos.y, z: pos.z }).then((result) => {
          if (result?.ok) setBuildArmed(null);
        });
        return armed;
      });
    },
    onInteract: (id: number) => setMachineId(id),
    onLockChange: (value: boolean) => setLocked(value),
  });
  engineCallbacks.current.onHud = (next: HudState) => setHud(next);
  engineCallbacks.current.onMove = (m) => void send({ action: "move", ...m }, true);
  engineCallbacks.current.onMineStart = (t) =>
    void send({ action: "minestart", x: t.x, y: t.y, z: t.z, nx: t.nx, ny: t.ny, nz: t.nz }, true);
  engineCallbacks.current.onMineFinish = (t) =>
    void send({ action: "minefinish", x: t.x, y: t.y, z: t.z, nx: t.nx, ny: t.ny, nz: t.nz });
  engineCallbacks.current.onInteract = (id) => setMachineId(id);
  engineCallbacks.current.onLockChange = (value) => setLocked(value);

  // Engine lifecycle (runs once when the game screen mounts).
  useEffect(() => {
    if (screen !== "game" || !boot) return;
    const canvas = document.getElementById("deepcore-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const engine = new DeepcoreEngine({
      canvas,
      seed: boot.seed,
      self: boot.self,
      callbacks: {
        onHud: (h) => engineCallbacks.current.onHud(h),
        onMove: (m) => engineCallbacks.current.onMove(m),
        onMineStart: (t) => engineCallbacks.current.onMineStart(t),
        onMineFinish: (t) => engineCallbacks.current.onMineFinish(t),
        onPlace: (p) => engineCallbacks.current.onPlace(p),
        onInteract: (id) => engineCallbacks.current.onInteract(id),
        onLockChange: (v) => engineCallbacks.current.onLockChange(v),
      },
    });
    engineRef.current = engine;
    engine.applyChanges(boot.changes);
    engine.setMachines(boot.machines);
    engine.setPlayers(boot.players, boot.self.id);
    engine.setTool(boot.self.tool ? ITEM_BY_ID.get(boot.self.tool)?.tool ?? null : null);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [screen, boot]);

  const inputEnabled = screen === "game" && !panel && machineId === null && !chatOpen;
  useEffect(() => {
    engineRef.current?.setInputEnabled(inputEnabled);
  }, [inputEnabled]);
  useEffect(() => {
    engineRef.current?.setBuildArmed(buildArmed);
  }, [buildArmed]);

  // Poll world state for teammates, machines and events.
  useEffect(() => {
    if (screen !== "game") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/state?token=${encodeURIComponent(tokenRef.current)}&since=${cursorRef.current}&name=${encodeURIComponent(nameRef.current)}`,
        );
        const data = (await res.json()) as WorldState;
        if (!cancelled && data.ok) applyState(data);
      } catch {
        /* transient network failure; next poll retries */
      }
      if (!cancelled) timer = setTimeout(poll, 1300);
    };
    timer = setTimeout(poll, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [screen, applyState]);

  const closePanels = useCallback(() => {
    setPanel(null);
    setMachineId(null);
    setBuildArmed(null);
    setChatOpen(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (screen !== "game") return;
      if (e.code === "Escape") {
        closePanels();
        engineRef.current?.exitLock();
        return;
      }
      if (chatOpen) return;
      if (e.code === "KeyE") setPanel((p) => (p === "inventory" ? null : "inventory"));
      if (e.code === "KeyB") setPanel((p) => (p === "build" ? null : "build"));
      if (e.code === "KeyR") setPanel((p) => (p === "research" ? null : "research"));
      if (e.code === "KeyO") setPanel((p) => (p === "objectives" ? null : "objectives"));
      if (e.code === "KeyM") setPanel((p) => (p === "manual" ? null : "manual"));
      if (e.code === "Enter") setChatOpen(true);
      if (e.code === "KeyG") void send({ action: "scan" });
      if (e.code.startsWith("Digit")) {
        const n = Number(e.code.replace("Digit", ""));
        if (n >= 1 && n <= 9) setSelected(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, closePanels, chatOpen, send]);

  const submitChat = () => {
    const text = chatText.trim();
    setChatText("");
    setChatOpen(false);
    if (text) void send({ action: "chat", text });
  };

  if (screen === "menu" || screen === "joining") {
    return (
      <MenuScreen
        callsign={callsign}
        setCallsign={setCallsign}
        onJoin={join}
        joining={screen === "joining"}
        summary={summary}
      />
    );
  }

  const self = state?.self;
  const machine = state?.machines.find((m) => m.id === machineId) ?? null;
  const radiation = self?.vitals.radiation ?? 0;
  const health = self?.vitals.health ?? 100;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#05080b] text-slate-100">
      <canvas id="deepcore-canvas" className="absolute inset-0 h-full w-full" />

      {/* Radiation / heat screen effects */}
      {radiation > 250 ? (
        <div className="pointer-events-none absolute inset-0 z-10" style={{ boxShadow: `inset 0 0 ${Math.min(190, radiation / 3)}px rgba(132,204,22,${Math.min(0.5, radiation / 1600)})` }} />
      ) : null}
      {health < 45 ? <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle,transparent_35%,rgba(185,28,28,0.35))]" /> : null}
      {(self?.vitals.heat ?? 0) > 75 ? (
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle,transparent_45%,rgba(234,88,12,0.28))]" />
      ) : null}

      {/* Top left vitals */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 w-[248px] space-y-1.5">
        <div className="rounded border border-amber-300/25 bg-[#070c10]/85 p-2.5 backdrop-blur">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-amber-200/80">Vitals</span>
            <span className="font-mono text-[9px] text-white/40">{self?.name}</span>
          </div>
          <Vital label="Health" value={health} max={100} color="from-emerald-400 to-lime-300" suffix="" />
          <Vital label="Dose" value={radiation} max={1000} color="from-lime-400 to-yellow-300" suffix=" mSv" />
          <Vital label="Body heat" value={self?.vitals.heat ?? 0} max={200} color="from-amber-400 to-rose-400" suffix="°" />
          <Vital label="Stamina" value={self?.vitals.stamina ?? 100} max={100} color="from-sky-400 to-cyan-300" suffix="" />
        </div>
        <div className="rounded border border-white/10 bg-[#070c10]/80 p-2 backdrop-blur">
          <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-white/35">
            <span>Power grid</span>
            <span className={state && state.grid.factor < 0.99 ? "text-amber-300" : "text-emerald-300"}>
              {state ? `${Math.round(state.grid.factor * 100)}%` : "—"}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-mono text-sm text-sky-200">{state?.grid.supply ?? 0} kW</span>
            <span className="font-mono text-[10px] text-white/40">demand {state?.grid.demand ?? 0}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1 font-mono text-[8px] uppercase tracking-wider text-white/35">
            <span className={state?.grid.water ? "text-cyan-300/80" : "text-rose-300/70"}>{state?.grid.water ? "water fed" : "no water"}</span>
            <span>· batteries {state?.grid.batteries ?? 0}</span>
            <span>· reactor {Math.round(state?.reactor.temperature ?? 0)}°C</span>
          </div>
        </div>
      </div>

      {/* Crosshair and mines */}
      <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
        <div className="relative h-24 w-24">
          <div className={`absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border ${hud.target ? (hud.canMine ? "border-amber-200" : "border-rose-400") : "border-white/40"}`} />
          <div className={`absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${hud.canMine || !hud.target ? "bg-amber-200" : "bg-rose-400"}`} />
          {hud.progress > 0 ? (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(#fbbf24 ${Math.round(hud.progress * 360)}deg, rgba(255,255,255,0.08) 0deg)`,
                maskImage: "radial-gradient(circle, transparent 62%, #000 64%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 62%, #000 64%)",
              }}
            />
          ) : null}
        </div>
        {hud.target ? (
          <div className="absolute left-1/2 top-[calc(50%+64px)] -translate-x-1/2 whitespace-nowrap rounded border border-white/10 bg-black/65 px-2 py-1 font-mono text-[10px] text-amber-100">
            {hud.target}
            <span className={`ml-2 ${hud.canMine ? "text-white/40" : "text-rose-300"}`}>{hud.requirement}</span>
          </div>
        ) : null}
        {buildArmed ? (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded border border-emerald-300/50 bg-emerald-400/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-100">
            Placing {MACHINE_BY_ID.get(buildArmed)?.name} · click ground
          </div>
        ) : null}
      </div>

      {/* Top right depth / team */}
      <div className="absolute right-3 top-3 z-20 w-[252px] space-y-1.5">
        <div className="rounded border border-amber-300/25 bg-[#070c10]/85 p-2.5 backdrop-blur">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/35">Depth</p>
              <p className="font-mono text-2xl leading-none text-amber-200">
                {hud.depth}
                <span className="ml-1 text-[10px] tracking-widest text-white/35">BLK</span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/35">{hud.layer}</p>
              <p className="font-mono text-[10px] text-white/45">
                {hud.x} · {hud.y} · {hud.z}
              </p>
              <p className="font-mono text-[9px] text-white/25">{locked ? `${hud.fps} fps` : "paused"}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1">
            {LAYERS.map((layer) => {
              const active = layer.name === hud.layer;
              return (
                <div key={layer.id} className="flex-1">
                  <div className={`h-1.5 rounded-sm ${active ? "bg-amber-300" : "bg-white/10"}`} />
                  <p className={`mt-0.5 truncate font-mono text-[7px] uppercase tracking-wide ${active ? "text-amber-200" : "text-white/25"}`}>{layer.name}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[9px] uppercase tracking-wider text-white/40">
              {self?.tool ? ITEM_BY_ID.get(self.tool)?.name : "no drill"}
            </span>
            <span className={`flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider ${hud.geiger > 0.35 ? "text-lime-300" : "text-white/30"}`}>
              <span className={hud.geiger > 0.35 ? "animate-pulse" : ""}>☢</span> geiger
              {hud.geiger > 0 ? ` ${Math.round(hud.geiger * 100)}%` : ""}
            </span>
          </div>
        </div>
        <div className="rounded border border-white/10 bg-[#070c10]/80 p-2 backdrop-blur">
          <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-white/35">
            <span>Team</span>
            <span>{state?.players.length ?? 0}/16</span>
          </div>
          <div className="mt-1 space-y-1">
            {(state?.players ?? []).slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate text-[10px] text-white/60">{p.name}</span>
                <span className="font-mono text-[9px] text-white/30">-{p.depth}m</span>
                <span className="h-1 w-8 overflow-hidden rounded bg-white/10">
                  <span className="block h-full bg-emerald-400" style={{ width: `${p.health}%` }} />
                </span>
              </div>
            ))}
            {!state?.players.length ? <p className="text-[10px] text-white/30">Solo descent</p> : null}
          </div>
        </div>
      </div>

      {/* Menu buttons */}
      <div className="absolute right-3 top-[236px] z-20 flex flex-col gap-1">
        {[
          ["inventory", "E", "Pack"],
          ["build", "B", "Build"],
          ["research", "R", "R&D"],
          ["objectives", "O", "Goals"],
          ["manual", "M", "Manual"],
        ].map(([key, hint, label]) => (
          <button
            key={key}
            onClick={() => setPanel(panel === key ? null : (key as Panel))}
            className={`flex items-center justify-between gap-3 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-widest backdrop-blur ${
              panel === key ? "border-amber-300/60 bg-amber-300/20 text-amber-100" : "border-white/10 bg-[#070c10]/80 text-white/55 hover:border-amber-300/40"
            }`}
          >
            {label}
            <span className="rounded bg-white/10 px-1 text-[8px] text-white/50">{hint}</span>
          </button>
        ))}
        <button
          onClick={() => void send({ action: "scan" })}
          className="flex items-center justify-between gap-3 rounded border border-white/10 bg-[#070c10]/80 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/55 backdrop-blur hover:border-lime-300/40"
        >
          Scan <span className="rounded bg-white/10 px-1 text-[8px] text-white/50">G</span>
        </button>
      </div>

      {/* Event feed + chat */}
      <div className="absolute bottom-3 left-3 z-20 w-[330px] max-w-[45vw] space-y-1.5">
        <div className="max-h-40 space-y-1 overflow-hidden rounded border border-white/10 bg-[#070c10]/75 p-2 backdrop-blur">
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/30">Shaft comms</p>
          {(state?.events ?? []).slice(0, 7).map((event) => (
            <p key={event.id} className="text-[10px] leading-snug text-white/55">
              {event.author ? <span className="font-mono text-amber-200/80">{event.author}: </span> : null}
              <span className={event.kind === "alarm" ? "text-rose-300" : event.kind === "research" ? "text-emerald-200" : ""}>{event.message}</span>
            </p>
          ))}
        </div>
        {chatOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitChat();
            }}
            className="flex items-center gap-1 rounded border border-amber-300/40 bg-black/80 p-1"
          >
            <input
              autoFocus
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setChatOpen(false);
                  setChatText("");
                }
              }}
              maxLength={160}
              placeholder="Message the team…"
              className="min-w-0 flex-1 bg-transparent px-2 py-1 text-[11px] text-white outline-none placeholder:text-white/25"
            />
            <button className="rounded bg-amber-300/20 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-amber-100">Send</button>
          </form>
        ) : (
          <button
            onClick={() => setChatOpen(true)}
            className="w-full rounded border border-white/10 bg-[#070c10]/70 px-2 py-1 text-left font-mono text-[9px] uppercase tracking-widest text-white/35 backdrop-blur hover:border-amber-300/30"
          >
            Enter to talk
          </button>
        )}
      </div>

      {/* Toasts */}
      <div className="pointer-events-none absolute bottom-24 left-1/2 z-30 flex w-[420px] max-w-[80vw] -translate-x-1/2 flex-col items-center gap-1">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`w-full rounded border px-3 py-1.5 text-center text-[11px] backdrop-blur ${
              toast.kind === "error"
                ? "border-rose-400/40 bg-rose-950/85 text-rose-100"
                : toast.kind === "good"
                  ? "border-emerald-400/40 bg-emerald-950/85 text-emerald-100"
                  : "border-amber-300/30 bg-[#0a1015]/90 text-amber-100"
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>

      {/* Hotbar */}
      <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1">
        {self ? <Hotbar self={self} selected={selected} onSelect={setSelected} /> : null}
        <div className="rounded bg-black/50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white/40">
          {self && self.inventory[selected] ? ITEM_BY_ID.get(self.inventory[selected]!.item)?.name : "empty slot"} · left click mine · right click operate
        </div>
      </div>

      {!locked && !panel && machineId === null ? (
        <div className="pointer-events-none absolute left-1/2 top-[58%] z-20 -translate-x-1/2 rounded border border-amber-300/30 bg-black/65 px-3 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-amber-100/90 backdrop-blur">
          Click the mine to capture the mouse
          <span className="mt-0.5 block text-[8px] tracking-widest text-white/35">or drag to look · arrows also turn</span>
        </div>
      ) : null}

      {/* Panels */}
      {panel ? (
        <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center" onClick={() => setPanel(null)}>
          <div className="w-full max-w-4xl rounded-md border border-amber-300/25 bg-[#080d11]/97 shadow-[0_30px_100px_#000]" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-1 border-b border-white/10 p-2">
              {[
                ["inventory", "Inventory"],
                ["build", "Blueprints"],
                ["research", "Research"],
                ["objectives", "Objectives"],
                ["manual", "Field manual"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPanel(key as Panel)}
                  className={`rounded-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] ${
                    panel === key ? "bg-amber-300/20 text-amber-100" : "text-white/45 hover:text-white/80"
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="flex-1" />
              <button onClick={() => setPanel(null)} className="rounded border border-white/15 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-white/50">
                ESC
              </button>
            </div>
            <div className="p-3">
              {self && panel === "inventory" ? <InventoryPanel self={self} selected={selected} onSelect={setSelected} send={send} /> : null}
              {state && panel === "build" ? <BuildPanel state={state} buildArmed={buildArmed} onArm={(m) => { setBuildArmed(m); if (m) setPanel(null); }} /> : null}
              {state && panel === "research" ? <ResearchPanel state={state} send={send} /> : null}
              {state && panel === "objectives" ? <ObjectivesPanel state={state} /> : null}
              {panel === "manual" ? <ManualPanel /> : null}
            </div>
          </div>
        </div>
      ) : null}

      {state && machine ? (
        <MachinePanel machine={machine} state={state} onClose={() => setMachineId(null)} send={send} />
      ) : null}
    </div>
  );
}

function Vital({ label, value, max, color, suffix }: { label: string; value: number; max: number; color: string; suffix: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="mt-1">
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-white/40">
        <span>{label}</span>
        <span className="text-white/60">
          {Math.round(value)}
          {suffix}
        </span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded bg-white/10">
        <div className={`h-full bg-gradient-to-r ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MenuScreen({
  callsign,
  setCallsign,
  onJoin,
  joining,
  summary,
}: {
  callsign: string;
  setCallsign: (value: string) => void;
  onJoin: () => void;
  joining: boolean;
  summary: { players: number; tech: number; maxDepth: number; structures: number } | null;
}) {
  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-[#05080b] text-slate-100">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{ backgroundImage: "url('/images/deepcore-hero.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#05080b]/70 via-[#05080b]/85 to-[#05080b]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(251,191,36,0.12),transparent_45%),radial-gradient(circle_at_75%_60%,rgba(16,185,129,0.16),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-4 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-sm border border-amber-300/50 bg-amber-300/15 font-mono text-[11px] font-bold text-amber-200">DC</span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-amber-200/80">Deepcore</p>
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">Shaft 01 · persistent co-op mine</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-white/35 sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${summary ? "animate-pulse bg-emerald-400" : "bg-white/30"}`} />
            {summary ? `${summary.players} survivor${summary.players === 1 ? "" : "s"} online` : "server authoritative"}
          </div>
        </header>

        <div className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-amber-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" /> Multiplayer mining · 56 blocks to the mantle
            </p>
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl">
              DEEP
              <span className="bg-gradient-to-br from-amber-200 via-amber-400 to-emerald-400 bg-clip-text text-transparent">CORE</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base">
              One steel pickaxe. One shared mine. Dig through six layers of rock, haul ore back to camp, and build the machine chain from a brick
              kiln to a centrifuge cascade. The endgame is a working reactor — and a Nuclear Drill that eats a 3×3 tunnel per swing.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 items-center gap-2 rounded border border-white/15 bg-black/50 px-3 py-2 backdrop-blur focus-within:border-amber-300/60">
                <span className="font-mono text-[9px] uppercase tracking-widest text-white/35">Callsign</span>
                <input
                  value={callsign}
                  maxLength={18}
                  onChange={(e) => setCallsign(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onJoin();
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                  placeholder="Prospector"
                />
              </div>
              <button
                onClick={onJoin}
                disabled={joining}
                className="group relative overflow-hidden rounded border border-amber-300/60 bg-gradient-to-r from-amber-400 to-amber-300 px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[#1a1206] transition hover:brightness-110 disabled:opacity-60"
              >
                {joining ? "Descending…" : "Enter the mine →"}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Survivors", summary ? `${summary.players}` : "—"],
                ["Research", summary ? `${summary.tech}/${TECH.length}` : "—"],
                ["Deepest", summary ? `${summary.maxDepth}b` : "—"],
                ["Structures", summary ? `${summary.structures}` : `${MACHINES.length}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-white/10 bg-[#070c10]/60 px-2.5 py-2 backdrop-blur">
                  <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-white/35">{label}</p>
                  <p className="font-mono text-lg text-amber-100">{value}</p>
                </div>
              ))}
            </div>

            <p className="mt-4 max-w-xl text-[11px] leading-relaxed text-white/35">
              No install, no downloads. Every edit is stored in Postgres; the terrain regenerates deterministically from the world seed. Your
              inventory, the shared tech tree, machines and reactor survive server restarts.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-white/10 bg-[#070c10]/80 p-4 backdrop-blur">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-200/80">Shift briefing</p>
              <ol className="mt-2 space-y-2 text-[12px] leading-snug text-white/60">
                {[
                  "Chop camp timber, build a Workbench and a Research Desk.",
                  "Dig coal, copper and iron in the Shale Beds. Smelt, then forge steel.",
                  "Steam pumps open the Granite and Basalt layers. Automate ore washing.",
                  "Electricity, chemistry and rare earths feed the uranium chain.",
                  "Find pitchblende with a Geiger counter. Enrich, fabricate, go critical.",
                ].map((line, index) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-amber-300/40 font-mono text-[8px] text-amber-200">
                      {index + 1}
                    </span>
                    {line}
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-md border border-white/10 bg-[#070c10]/80 p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-200/80">The ladder</p>
                <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">Era 0 → 5</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {ERA_NAMES.map((era, index) => (
                  <div key={era} className="rounded border border-white/10 bg-black/30 px-2 py-1.5">
                    <p className="font-mono text-[8px] uppercase tracking-widest text-white/30">Era {index}</p>
                    <p className="text-[11px] text-white/75">{era}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-[#070c10]/80 p-3 text-[11px] text-white/45 backdrop-blur">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.25em] text-white/35">Controls</p>
              <p>
                <b className="text-white/70">WASD</b> walk · <b className="text-white/70">Shift</b> sprint · <b className="text-white/70">Space</b> jump ·{" "}
                <b className="text-white/70">LMB</b> mine · <b className="text-white/70">RMB</b> operate · <b className="text-white/70">E</b> pack ·{" "}
                <b className="text-white/70">B</b> build · <b className="text-white/70">R</b> research · <b className="text-white/70">O</b> goals
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {LAYERS.map((layer, index) => (
            <div key={layer.id} className="flex items-center gap-2 rounded border border-white/10 bg-[#070c10]/60 px-2.5 py-2 backdrop-blur">
              <span className="grid h-7 w-7 place-items-center rounded-sm bg-gradient-to-br from-amber-300/30 to-emerald-400/10 font-mono text-[10px] text-amber-100">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-white/80">{layer.name}</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-white/30">
                  depth {layer.from}–{layer.to} · tier {layer.minTier} · {layer.hazard}
                </p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded border border-amber-300/25 bg-amber-300/5 px-2.5 py-2">
            <span className="grid h-7 w-7 place-items-center rounded-sm bg-amber-300/20 font-mono text-[10px] text-amber-100">☢</span>
            <div>
              <p className="text-[11px] text-amber-100">Uranium → reactor → nuclear drill</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-white/30">goal: 3×3 tunnel into the mantle</p>
            </div>
          </div>
        </div>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 pb-2 font-mono text-[9px] uppercase tracking-widest text-white/25">
          <span>Deepcore web edition · shared world seed {summary ? "live" : "20260214"} · server tick 30 Hz</span>
          <span>Built with Next.js · Three.js · Postgres · Drizzle</span>
        </footer>
      </div>
    </main>
  );
}
