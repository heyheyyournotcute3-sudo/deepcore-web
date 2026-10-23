"use client";

import * as THREE from "three";
import {
  BLOCKS,
  CHUNK,
  MACHINE_BLOCK,
  MACHINE_BY_ID,
  SURFACE_Y,
  WORLD_HEIGHT,
  WORLD_SIZE,
  layerAtDepth,
} from "@/game/content";
import type { ChangeView, MachineView, PlayerView, SelfState } from "@/game/types";
import { WorldGen, blockKey, depthOf, getWorldGen, inBounds } from "@/game/world";

export type Target = {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  block: number;
  machineId?: number;
};

export type HudState = {
  depth: number;
  layer: string;
  fps: number;
  target: string | null;
  requirement: string | null;
  canMine: boolean;
  progress: number;
  geiger: number;
  x: number;
  y: number;
  z: number;
  grounded: boolean;
};

type Callbacks = {
  onHud: (hud: HudState) => void;
  onMove: (m: { x: number; y: number; z: number; yaw: number; pitch: number; sprint: boolean; crouch: boolean }) => void;
  onMineStart: (t: Target) => void;
  onMineFinish: (t: Target) => void;
  onPlace: (pos: { x: number; y: number; z: number }) => void;
  onInteract: (machineId: number) => void;
  onLockChange: (locked: boolean) => void;
};

type Options = {
  canvas: HTMLCanvasElement;
  seed: number;
  self: SelfState;
  callbacks: Callbacks;
};

const FACES: { dir: [number, number, number]; corners: [number, number, number][]; shade: number }[] = [
  { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], shade: 1 },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.42 },
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.72 },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.6 },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.82 },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.52 },
];

const hash01 = (x: number, y: number, z: number): number => {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y ^ 0x165667b1, 0xc2b2ae35) ^ Math.imul(z, 0x27d4eb2d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

const chunkKey = (cx: number, cy: number, cz: number) => `${cx},${cy},${cz}`;
const ORE_TINT = new THREE.Color("#ffffff");

export class DeepcoreEngine {
  private canvas: HTMLCanvasElement;
  private cb: Callbacks;
  private seed: number;
  private gen: WorldGen;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private lamp: THREE.SpotLight;
  private lampTarget: THREE.Object3D;
  private ambient: THREE.PointLight;
  private material = new THREE.MeshLambertMaterial({ vertexColors: true });

  private chunks = new Map<string, Uint16Array>();
  private meshes = new Map<string, THREE.Mesh>();
  private queue: string[] = [];
  private edits = new Map<number, number>();
  private editsByChunk = new Map<string, Map<number, number>>();
  private machines = new Map<number, MachineView>();
  private machineBlocks = new Map<number, number>();
  private machineGroup = new THREE.Group();
  private machineLights: THREE.PointLight[] = [];
  private remoteGroup = new THREE.Group();
  private remotes = new Map<number, { group: THREE.Group; target: THREE.Vector3; health: number }>();

  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private grounded = false;
  private keys = new Set<string>();
  private locked = false;
  private inputEnabled = true;
  private sprint = false;
  private crouch = false;

  private highlight: THREE.LineSegments;
  private ghost: THREE.Mesh;
  buildArmed: string | null = null;

  private target: Target | null = null;
  private mouseDown = false;
  private mining = false;
  private mineStarted = 0;
  private mineBlock = -1;
  private mineReadyAt = 0;
  private toolTier = 1;
  private toolSpeed = 1;
  private toolArea = 1;
  private lastMoveSent = 0;
  private lastHud = 0;
  private lastGeiger = 0;
  private geiger = 0;
  private frames = 0;
  private fps = 60;
  private lastFrame = performance.now();
  private raf = 0;
  private disposed = false;
  private audio: AudioContext | null = null;
  private nextGeiger = 0;
  private machineSignature = "";
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  constructor(opts: Options) {
    this.canvas = opts.canvas;
    this.cb = opts.callbacks;
    this.seed = opts.seed;
    this.gen = getWorldGen(opts.seed);
    this.pos.set(opts.self.x, opts.self.y, opts.self.z);
    this.toolTier = 1;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.renderer.setClearColor(0x0a0f14);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b141c);
    this.scene.fog = new THREE.Fog(0x0b141c, 18, 52);
    this.camera = new THREE.PerspectiveCamera(75, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight), 0.1, 220);

    this.hemi = new THREE.HemisphereLight(0x9dc4e0, 0x3a2d20, 1.05);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe4bd, 0.85);
    this.sun.position.set(0.6, 1, 0.25);
    this.scene.add(this.sun);

    this.lamp = new THREE.SpotLight(0xffe6b8, 60, 30, Math.PI / 4.2, 0.55, 1.1);
    this.lamp.position.set(0, 0, 0);
    this.lampTarget = new THREE.Object3D();
    this.scene.add(this.lamp);
    this.scene.add(this.lampTarget);
    this.lamp.target = this.lampTarget;

    this.ambient = new THREE.PointLight(0xffdfae, 1.4, 10, 2);
    this.scene.add(this.ambient);
    this.scene.add(this.machineGroup);
    this.scene.add(this.remoteGroup);

    const highlightGeo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(highlightGeo),
      new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.85 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x7ff0d0, transparent: true, opacity: 0.22, wireframe: false }),
    );
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.bindEvents();
    this.onResize();
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  // ----------------------------------------------------------------- events
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.inputEnabled) return;
    this.keys.add(e.code);
    if (e.code === "Space" && this.locked) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.locked) {
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
    } else if (this.dragging && this.inputEnabled) {
      this.yaw -= (e.clientX - this.lastPointer.x) * 0.0034;
      this.pitch -= (e.clientY - this.lastPointer.y) * 0.0034;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    }
    this.pitch = Math.max(-1.54, Math.min(1.54, this.pitch));
  };
  private onPointerDown = (e: MouseEvent) => {
    if (!this.inputEnabled) return;
    if (!this.locked) this.requestLock();
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.ensureAudio();
    if (e.button === 0) {
      if (this.buildArmed) {
        this.tryPlace();
        return;
      }
      if (this.target?.machineId) {
        this.cb.onInteract(this.target.machineId);
        this.exitLock();
        return;
      }
      this.mouseDown = true;
      this.beginMine();
    } else if (e.button === 2) {
      if (this.target?.machineId) {
        this.cb.onInteract(this.target.machineId);
        this.exitLock();
      }
    }
  };
  private onPointerUp = (e: MouseEvent) => {
    this.dragging = false;
    if (e.button === 0) {
      this.mouseDown = false;
      this.stopMine();
    }
  };
  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    this.cb.onLockChange(this.locked);
    if (!this.locked) this.mouseDown = false;
  };
  private onContext = (e: Event) => e.preventDefault();
  private onResizeHandler = () => this.onResize();

  private bindEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onPointerUp);
    window.addEventListener("resize", this.onResizeHandler);
    this.canvas.addEventListener("mousedown", this.onPointerDown);
    this.canvas.addEventListener("contextmenu", this.onContext);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  private ensureAudio() {
    if (this.audio) {
      if (this.audio.state === "suspended") void this.audio.resume();
      return;
    }
    try {
      this.audio = new AudioContext();
    } catch {
      this.audio = null;
    }
  }

  private blip(freq = 220, duration = 0.05, gain = 0.03) {
    if (!this.audio) return;
    const osc = this.audio.createOscillator();
    const vol = this.audio.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    vol.gain.value = gain;
    osc.connect(vol).connect(this.audio.destination);
    osc.start();
    vol.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + duration);
    osc.stop(this.audio.currentTime + duration);
  }

  requestLock() {
    if (!this.inputEnabled) return;
    const result = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (result && typeof result.catch === "function") result.catch(() => undefined);
  }

  exitLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.exitLock();
    }
  }

  onResize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setSelf(self: SelfState, teleport = false) {
    if (teleport) {
      this.pos.set(self.x, self.y, self.z);
      this.vel.set(0, 0, 0);
    }
  }

  setTool(spec: { tier: number; speed: number; area: number } | null) {
    this.toolTier = spec?.tier ?? 0;
    this.toolSpeed = spec?.speed ?? 0;
    this.toolArea = spec?.area ?? 1;
  }

  setBuildArmed(machine: string | null) {
    this.buildArmed = machine;
    if (!machine) this.ghost.visible = false;
  }

  // -------------------------------------------------------------- voxel data
  private getChunk(cx: number, cy: number, cz: number): Uint16Array {
    const key = chunkKey(cx, cy, cz);
    const cached = this.chunks.get(key);
    if (cached) return cached;
    const data = this.gen.generateChunk(cx, cy, cz);
    const overlay = this.editsByChunk.get(key);
    if (overlay) for (const [idx, block] of overlay) data[idx] = block;
    this.chunks.set(key, data);
    return data;
  }

  private voxelAt(x: number, y: number, z: number): number {
    if (!inBounds(x, y, z)) return y < 0 ? 1 : 0;
    const edited = this.edits.get(blockKey(x, y, z));
    if (edited !== undefined) return edited;
    if (y >= WORLD_HEIGHT) return 0;
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const data = this.getChunk(cx, cy, cz);
    return data[(x % CHUNK) + (z % CHUNK) * CHUNK + (y % CHUNK) * CHUNK * CHUNK];
  }

  private solidAt(x: number, y: number, z: number): boolean {
    if (this.machineBlocks.has(blockKey(x, y, z))) return true;
    if (x < 0 || z < 0 || x >= WORLD_SIZE || z >= WORLD_SIZE || y < 0) return true;
    return this.voxelAt(x, y, z) !== 0;
  }

  applyChanges(changes: ChangeView[]) {
    if (!changes.length) return;
    for (const change of changes) {
      const key = blockKey(change.x, change.y, change.z);
      this.edits.set(key, change.block);
      const cx = Math.floor(change.x / CHUNK);
      const cy = Math.floor(change.y / CHUNK);
      const cz = Math.floor(change.z / CHUNK);
      const ck = chunkKey(cx, cy, cz);
      let overlay = this.editsByChunk.get(ck);
      if (!overlay) {
        overlay = new Map();
        this.editsByChunk.set(ck, overlay);
      }
      const idx = (change.x % CHUNK) + (change.z % CHUNK) * CHUNK + (change.y % CHUNK) * CHUNK * CHUNK;
      overlay.set(idx, change.block);
      const chunk = this.chunks.get(ck);
      if (chunk) chunk[idx] = change.block;
      this.markDirty(cx, cy, cz);
      const lx = change.x % CHUNK;
      const ly = change.y % CHUNK;
      const lz = change.z % CHUNK;
      if (lx === 0) this.markDirty(cx - 1, cy, cz);
      if (lx === CHUNK - 1) this.markDirty(cx + 1, cy, cz);
      if (ly === 0) this.markDirty(cx, cy - 1, cz);
      if (ly === CHUNK - 1) this.markDirty(cx, cy + 1, cz);
      if (lz === 0) this.markDirty(cx, cy, cz - 1);
      if (lz === CHUNK - 1) this.markDirty(cx, cy, cz + 1);
    }
  }

  private markDirty(cx: number, cy: number, cz: number) {
    const key = chunkKey(cx, cy, cz);
    const mesh = this.meshes.get(key);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      this.meshes.delete(key);
    }
    if (!this.queue.includes(key)) this.queue.push(key);
  }

  setMachines(machines: MachineView[]) {
    const signature = machines.map((m) => `${m.id}:${m.type}:${m.x},${m.y},${m.z}:${m.enabled ? 1 : 0}`).join("|");
    if (signature === this.machineSignature) {
      this.machines = new Map(machines.map((m) => [m.id, m]));
      this.machineBlocks.clear();
      for (const m of machines) this.machineBlocks.set(blockKey(m.x, m.y, m.z), m.id);
      return;
    }
    this.machineSignature = signature;
    this.machines = new Map(machines.map((m) => [m.id, m]));
    this.machineBlocks.clear();
    for (const m of machines) this.machineBlocks.set(blockKey(m.x, m.y, m.z), m.id);
    for (const child of [...this.machineGroup.children]) {
      this.machineGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    for (const light of this.machineLights) this.scene.remove(light);
    this.machineLights = [];
    for (const machine of machines) {
      const def = MACHINE_BY_ID.get(machine.type);
      const color = new THREE.Color(def?.color ?? "#8899aa");
      const geo = new THREE.BoxGeometry(0.94, 0.94, 0.94);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.35,
        emissive: color.clone().multiplyScalar(machine.enabled ? 0.55 : 0.12),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(machine.x + 0.5, machine.y + 0.5, machine.z + 0.5);
      this.machineGroup.add(mesh);
      if (machine.type === "oil_lamp" && this.machineLights.length < 6) {
        const light = new THREE.PointLight(0xffbb66, 9, 12, 1.8);
        light.position.set(machine.x + 0.5, machine.y + 1.1, machine.z + 0.5);
        this.machineLights.push(light);
        this.scene.add(light);
      }
      if (machine.type === "reactor") {
        const light = new THREE.PointLight(0x8dff9e, machine.enabled ? 22 : 4, 16, 2);
        light.position.set(machine.x + 0.5, machine.y + 1.4, machine.z + 0.5);
        this.machineLights.push(light);
        this.scene.add(light);
      }
    }
  }

  setPlayers(players: PlayerView[], selfId: number) {
    const seen = new Set<number>();
    for (const player of players) {
      if (player.id === selfId) continue;
      seen.add(player.id);
      let remote = this.remotes.get(player.id);
      if (!remote) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.3, 0.9, 6, 12),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(player.color), emissive: new THREE.Color(player.color).multiplyScalar(0.25), roughness: 0.6 }),
        );
        body.position.y = 0.95;
        group.add(body);
        const visor = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.16, 0.12),
          new THREE.MeshBasicMaterial({ color: 0xfff0b0 }),
        );
        visor.position.set(0, 1.5, 0.22);
        group.add(visor);
        const sprite = this.nameSprite(player.name, player.color);
        sprite.position.y = 2.25;
        group.add(sprite);
        this.remoteGroup.add(group);
        remote = { group, target: new THREE.Vector3(player.x, player.y, player.z), health: player.health };
        group.position.set(player.x, player.y, player.z);
        this.remotes.set(player.id, remote);
      }
      remote.target.set(player.x, player.y, player.z);
      remote.health = player.health;
      remote.group.rotation.y = player.yaw;
    }
    for (const [id, remote] of this.remotes) {
      if (!seen.has(id)) {
        this.remoteGroup.remove(remote.group);
        this.remotes.delete(id);
      }
    }
  }

  private nameSprite(name: string, color: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(8,12,16,0.72)";
      ctx.fillRect(0, 0, 256, 64);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 252, 60);
      ctx.fillStyle = "#f2e6d2";
      ctx.font = "600 30px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name.slice(0, 14), 128, 35);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.4, 0.6, 1);
    return sprite;
  }

  // ------------------------------------------------------------------ meshing
  private visibleChunks(): string[] {
    const pcx = Math.floor(this.pos.x / CHUNK);
    const pcy = Math.floor(this.pos.y / CHUNK);
    const pcz = Math.floor(this.pos.z / CHUNK);
    const R = 3;
    const out: string[] = [];
    for (let cy = Math.max(0, pcy - 2); cy <= Math.min(Math.ceil(WORLD_HEIGHT / CHUNK) - 1, pcy + 2); cy++) {
      for (let cz = pcz - R; cz <= pcz + R; cz++) {
        for (let cx = pcx - R; cx <= pcx + R; cx++) {
          if (cx < 0 || cz < 0 || cx >= WORLD_SIZE / CHUNK || cz >= WORLD_SIZE / CHUNK) continue;
          const key = chunkKey(cx, cy, cz);
          if (!this.meshes.has(key) && !this.queue.includes(key)) this.queue.push(key);
          out.push(key);
        }
      }
    }
    return out;
  }

  private buildMesh(cx: number, cy: number, cz: number) {
    const key = chunkKey(cx, cy, cz);
    if (this.meshes.has(key)) return;
    const data = this.getChunk(cx, cy, cz);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();

    for (let y = 0; y < CHUNK; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const block = data[x + z * CHUNK + y * CHUNK * CHUNK];
          if (block === 0) continue;
          const def = BLOCKS[block];
          if (!def) continue;
          const wx = cx * CHUNK + x;
          const wy = cy * CHUNK + y;
          const wz = cz * CHUNK + z;
          const tint = 0.86 + hash01(wx, wy, wz) * 0.28;
          color.set(def.color);
          if (def.ore) {
            const fleck = hash01(wx * 3 + 1, wy * 5 + 2, wz * 7 + 3);
            color.lerp(ORE_TINT, fleck > 0.7 ? 0.34 : 0.06);
          }
          if (def.glow) color.multiplyScalar(1.35);
          for (const face of FACES) {
            const nx = wx + face.dir[0];
            const ny = wy + face.dir[1];
            const nz = wz + face.dir[2];
            if (this.voxelAt(nx, ny, nz) !== 0) continue;
            const shade = face.shade * tint;
            const r = Math.min(1, color.r * shade);
            const g = Math.min(1, color.g * shade);
            const b = Math.min(1, color.b * shade);
            const c = face.corners;
            const quad = [c[0], c[1], c[2], c[0], c[2], c[3]];
            for (const corner of quad) {
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              normals.push(face.dir[0], face.dir[1], face.dir[2]);
              colors.push(r, g, b);
            }
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(cx * CHUNK, cy * CHUNK, cz * CHUNK);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    this.meshes.set(key, mesh);
  }

  private processQueue() {
    const needed = this.visibleChunks();
    const neededSet = new Set(needed);
    let built = 0;
    while (this.queue.length && built < 2) {
      const key = this.queue.shift()!;
      if (this.meshes.has(key)) continue;
      const [cx, cy, cz] = key.split(",").map(Number);
      this.buildMesh(cx, cy, cz);
      built++;
    }
    if (this.meshes.size > 90) {
      for (const [key, mesh] of this.meshes) {
        if (neededSet.has(key)) continue;
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(key);
      }
    }
  }

  // ------------------------------------------------------------------ physics
  private collides(px: number, py: number, pz: number): boolean {
    const minX = Math.floor(px - 0.3);
    const maxX = Math.floor(px + 0.3);
    const minY = Math.floor(py + 0.02);
    const maxY = Math.floor(py + 1.72);
    const minZ = Math.floor(pz - 0.3);
    const maxZ = Math.floor(pz + 0.3);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.solidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private movePlayer(dt: number) {
    const forward = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const strafe = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    this.sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    this.crouch = this.keys.has("ControlLeft") || this.keys.has("KeyC");
    const speed = this.crouch ? 2.3 : this.sprint ? 7.2 : 4.7;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let dx = (-sin * forward + cos * strafe) * speed;
    let dz = (-cos * forward - sin * strafe) * speed;
    const magnitude = Math.hypot(dx, dz);
    if (magnitude > speed) {
      dx = (dx / magnitude) * speed;
      dz = (dz / magnitude) * speed;
    }
    this.vel.x = dx;
    this.vel.z = dz;
    this.vel.y -= 24 * dt;
    if (this.grounded && this.keys.has("Space")) {
      this.vel.y = 8.1;
      this.grounded = false;
    }
    this.vel.y = Math.max(-42, this.vel.y);

    const stepUp = (fromY: number, nx: number, nz: number): boolean => {
      if (!this.grounded) return false;
      if (this.collides(nx, fromY + 1.05, nz)) return false;
      this.pos.y = fromY + 1.05;
      return true;
    };

    const nextX = this.pos.x + this.vel.x * dt;
    if (!this.collides(nextX, this.pos.y, this.pos.z)) this.pos.x = nextX;
    else if (stepUp(this.pos.y, nextX, this.pos.z)) this.pos.x = nextX;

    const nextZ = this.pos.z + this.vel.z * dt;
    if (!this.collides(this.pos.x, this.pos.y, nextZ)) this.pos.z = nextZ;
    else if (stepUp(this.pos.y, this.pos.x, nextZ)) this.pos.z = nextZ;

    const nextY = this.pos.y + this.vel.y * dt;
    if (!this.collides(this.pos.x, nextY, this.pos.z)) {
      this.pos.y = nextY;
      this.grounded = false;
    } else {
      if (this.vel.y < 0) this.grounded = true;
      this.vel.y = 0;
    }

    if (this.pos.y < -8) {
      this.pos.set(48.5, SURFACE_Y + 2, 48.5);
      this.vel.set(0, 0, 0);
    }
    this.pos.x = Math.max(1.4, Math.min(WORLD_SIZE - 1.4, this.pos.x));
    this.pos.z = Math.max(1.4, Math.min(WORLD_SIZE - 1.4, this.pos.z));

    this.camera.position.set(this.pos.x, this.pos.y + 1.58, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  // ------------------------------------------------------------------ targets
  private raycast(maxDist: number): Target | null {
    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.58, this.pos.z);
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);
    const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dir.x);
    const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dir.y);
    const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dir.z);
    let tMaxX = stepX === 0 ? Infinity : ((stepX > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX) / 1;
    let tMaxY = stepY === 0 ? Infinity : ((stepY > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY) / 1;
    let tMaxZ = stepZ === 0 ? Infinity : ((stepZ > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ) / 1;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let distance = 0;
    for (let i = 0; i < 200 && distance <= maxDist; i++) {
      const machineId = this.machineBlocks.get(blockKey(x, y, z));
      if (machineId && i > 0) return { x, y, z, nx, ny, nz, block: MACHINE_BLOCK, machineId };
      const block = this.voxelAt(x, y, z);
      if (block !== 0 && i > 0) return { x, y, z, nx, ny, nz, block };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        distance = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        distance = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
    return null;
  }

  private requiredSeconds(): number {
    if (!this.target) return Infinity;
    const def = BLOCKS[this.target.block];
    if (!def) return Infinity;
    if (this.toolTier < def.minTier) return Infinity;
    return def.hardness / Math.max(0.1, this.toolSpeed);
  }

  private beginMine() {
    if (!this.mouseDown) return;
    const tech = this.target;
    if (!tech || tech.machineId) {
      this.mineReadyAt = performance.now() + 300;
      return;
    }
    const def = BLOCKS[tech.block];
    if (!def || def.id === 0) return;
    if (this.toolTier < def.minTier) {
      this.blip(120, 0.06, 0.02);
      this.mineReadyAt = performance.now() + 500;
      return;
    }
    this.mining = true;
    this.mineStarted = performance.now();
    this.mineBlock = tech.block;
    this.cb.onMineStart(tech);
  }

  private stopMine() {
    this.mining = false;
  }

  private tryPlace() {
    if (!this.target || !this.buildArmed) return;
    const px = this.target.x + this.target.nx;
    const py = this.target.y + this.target.ny;
    const pz = this.target.z + this.target.nz;
    if (!inBounds(px, py, pz)) return;
    if (this.voxelAt(px, py, pz) !== 0) return;
    this.cb.onPlace({ x: px, y: py, z: pz });
    this.blip(520, 0.07, 0.03);
  }

  // --------------------------------------------------------------------- loop
  private tick() {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.frames++;
    if (now - this.lastHud >= 400) {
      this.fps = Math.round((this.frames * 1000) / Math.max(1, now - this.lastHud));
      this.frames = 0;
    }

    if (this.inputEnabled) {
      if (!this.locked) {
        const lookX = (this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("ArrowLeft") ? 1 : 0);
        const lookY = (this.keys.has("ArrowUp") ? 1 : 0) - (this.keys.has("ArrowDown") ? 1 : 0);
        this.yaw -= lookX * dt * 1.8;
        this.pitch = Math.max(-1.54, Math.min(1.54, this.pitch + lookY * dt * 1.4));
      }
      this.movePlayer(dt);
    } else {
      this.camera.position.set(this.pos.x, this.pos.y + 1.58, this.pos.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    }

    const depth = depthOf(Math.floor(this.pos.y));
    this.hemi.intensity = Math.max(0.1, 1.05 - depth / 9);
    this.sun.intensity = Math.max(0.03, 0.85 - depth / 8);
    const fogColor = new THREE.Color(0x0b141c).lerp(new THREE.Color(0x04060a), Math.min(1, depth / 24));
    (this.scene.fog as THREE.Fog).color = fogColor;
    (this.scene.background as THREE.Color).copy(fogColor);
    (this.scene.fog as THREE.Fog).near = Math.max(8, 20 - depth / 4);
    (this.scene.fog as THREE.Fog).far = Math.max(22, 56 - depth / 3);
    this.lamp.position.copy(this.camera.position);
    this.lampTarget.position.copy(this.camera.position).add(
      new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ")).multiplyScalar(10),
    );
    this.ambient.position.copy(this.camera.position);

    this.target = this.raycast(6.2);
    const t = this.target;
    if (t && !t.machineId) {
      this.highlight.visible = true;
      this.highlight.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
      (this.highlight.material as THREE.LineBasicMaterial).color.set(this.toolTier >= (BLOCKS[t.block]?.minTier ?? 99) ? 0xffc46b : 0xff5a5a);
    } else if (t?.machineId) {
      this.highlight.visible = true;
      this.highlight.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
      (this.highlight.material as THREE.LineBasicMaterial).color.set(0x7ff0d0);
    } else {
      this.highlight.visible = false;
    }

    if (this.buildArmed && t) {
      this.ghost.visible = true;
      this.ghost.position.set(t.x + t.nx + 0.5, t.y + t.ny + 0.5, t.z + t.nz + 0.5);
    } else {
      this.ghost.visible = false;
    }

    // Continuous mining
    if (this.mouseDown && !this.buildArmed && now > this.mineReadyAt) {
      if (!this.mining) this.beginMine();
      else if (this.target && !this.target.machineId) {
        if (this.target.block !== this.mineBlock) {
          this.cb.onMineStart(this.target);
          this.mineStarted = now;
          this.mineBlock = this.target.block;
        }
        const required = this.requiredSeconds();
        if (Number.isFinite(required) && (now - this.mineStarted) / 1000 >= required) {
          this.cb.onMineFinish(this.target);
          this.mining = false;
          this.mineReadyAt = now + 260;
          this.blip(320, 0.05, 0.02);
        }
      }
    }

    this.processQueue();

    // Remote player interpolation
    for (const remote of this.remotes.values()) {
      remote.group.position.lerp(remote.target, Math.min(1, dt * 6));
    }

    if (now - this.lastGeiger > 1200 && depth > 30) {
      this.lastGeiger = now;
      const nearby = this.gen.nearbyOres(this.pos.x, this.pos.y, this.pos.z, 5, 1)[0];
      const close = nearby && (nearby.key === "pitchblende" || nearby.key === "core_crystal") ? nearby.distance : 99;
      this.geiger = close < 6 ? Math.max(0, 1 - close / 6) : 0;
    } else if (now - this.lastGeiger > 1200) {
      this.lastGeiger = now;
      this.geiger = 0;
    }

    if (this.geiger > 0.12 && now > this.nextGeiger) {
      this.nextGeiger = now + 1200 - this.geiger * 1000;
      this.blip(1600 + Math.random() * 900, 0.012, 0.012);
    }

    if (now - this.lastMoveSent > 420) {
      this.lastMoveSent = now;
      this.cb.onMove({ x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, sprint: this.sprint, crouch: this.crouch });
    }

    if (now - this.lastHud > 200) {
      this.lastHud = now;
      const layer = layerAtDepth(depth);
      const def = this.target && !this.target.machineId ? BLOCKS[this.target.block] : null;
      const required = this.requiredSeconds();
      const machine = this.target?.machineId ? this.machines.get(this.target.machineId) : null;
      this.cb.onHud({
        depth,
        layer: layer.name,
        fps: this.fps,
        target: machine ? (MACHINE_BY_ID.get(machine.type)?.name ?? "Structure") : def?.name ?? null,
        requirement: def
          ? this.toolTier < def.minTier
            ? `Too hard — needs Tier ${def.minTier}`
            : `Tier ${def.minTier} · ${def.hardness}s`
          : machine
            ? "Right-click to operate"
            : null,
        canMine: Boolean(def && this.toolTier >= def.minTier),
        progress: this.mining ? Math.min(1, (now - this.mineStarted) / 1000 / Math.max(0.001, required)) : 0,
        geiger: this.geiger,
        x: Math.round(this.pos.x),
        y: Math.round(this.pos.y),
        z: Math.round(this.pos.z),
        grounded: this.grounded,
      });
    }

    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  }

  teleport(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.chunks.clear();
    this.queue = [];
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.clear();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onPointerUp);
    window.removeEventListener("resize", this.onResizeHandler);
    this.canvas.removeEventListener("mousedown", this.onPointerDown);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.renderer.dispose();
    if (this.audio) void this.audio.close();
  }
}
