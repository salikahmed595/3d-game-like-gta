// Free-roam: player-driven movement around the office and the street outside.
// Plain mutable state (read every frame by Avatar / CameraRig / Companion) + a small interactable registry.
// Business state is never touched here; interactions only open views of server-authoritative data.
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { playSound } from "../audio.ts";
import { gridBlocked } from "../world/grid.ts";

export const SEAT = new THREE.Vector3(0, 0, 0);
export const RADIUS = 0.25;
const WALK = 2.1;
const RUN = 6.2; // a proper sprint: the island is big
const PATH_SPEED = 3.0;

type Waypoint = { x: number; z: number };
export const player = {
  pos: new THREE.Vector3(),
  yaw: 0,
  speed: 0,
  // Seated on a bench: `stand` is the free spot to step back to (the seat itself is inside the bench collider).
  sitting: null as null | { yaw: number; stand: Waypoint },
  vy: 0, // vertical speed while jumping (pos.y is the height above ground)
  snap: false, // Avatar should jump to `pos` this frame (cinematic cut)
  path: [] as Waypoint[],
  onArrive: null as null | (() => void),
  stuckT: 0,
  /** Aiming a gun: the body faces this heading and moves by strafing (set by weapons.ts). */
  aimYaw: null as number | null,
};

/** Preferred camera heading (look direction) for click-to-walk and interactions; null = leave it to the user. */
export const camHint = { yaw: null as number | null };

// ---------------------------------------------------------------- world layout (shared with World.tsx)
export const OFFICE = { minX: -2.75, maxX: 2.7, minZ: -2.55, maxZ: 2.5 };
export const DOOR = { z0: 0.0, z1: 1.5 }; // gap in the right-hand glass wall (x = OFFICE.maxX)
/** Outer limits of the island (world/layout.ts WORLD_HALF; the ocean lies beyond). */
export const WORLD = { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 };

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
const r = RADIUS;
const INTERIOR: Rect = { minX: OFFICE.minX + 0.05 + r, maxX: OFFICE.maxX - 0.05 - r, minZ: OFFICE.minZ + 0.05 + r, maxZ: OFFICE.maxZ - 0.05 - r };
const DOORWAY: Rect = { minX: OFFICE.maxX - 0.6, maxX: OFFICE.maxX + 0.6, minZ: DOOR.z0 + r, maxZ: DOOR.z1 - r };
const OFFICE_SHELL: Rect = { minX: OFFICE.minX - 0.15, maxX: OFFICE.maxX + 0.1, minZ: OFFICE.minZ - 0.15, maxZ: OFFICE.maxZ + 0.1 };

const box = (cx: number, cz: number, hw: number, hd: number): Rect => ({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });

/** Obstacles depend on the current office tier / wall state, so they are computed on demand. */
let obsCache: { key: string; list: Rect[] } | null = null;
function obstacles(): Rect[] {
  const g = useGame.getState();
  const t = g.displayTier;
  const key = `${t}${g.wallBroken}`;
  if (obsCache?.key === key) return obsCache.list;
  obsCache = { key, list: buildObstacles(t, g.wallBroken) };
  return obsCache.list;
}

function buildObstacles(t: 1 | 2 | 3, wallBroken: boolean): Rect[] {
  const w = t === 1 ? 1.3 : t === 2 ? 1.6 : 2.0;
  const d = t === 1 ? 0.65 : 0.8;
  const out: Rect[] = [
    box(0, 0.95, w / 2, d / 2), // desk
    box(-2.55, -1.5, 0.2, 0.78), // trophy shelf
  ];
  if (!wallBroken) out.push(box(-0.2, -2.05, 1.2, 0.12));
  if (t >= 2) out.push(box(2.0, -1.6, 0.2, 0.2)); // plant
  if (t === 3) out.push(box(-2.1, 1.9, 0.17, 0.17)); // floor lamp
  return out;
}

function inside(rc: Rect, x: number, z: number, pad = 0) {
  return x >= rc.minX - pad && x <= rc.maxX + pad && z >= rc.minZ - pad && z <= rc.maxZ + pad;
}

/** NPC positions by id, refreshed every frame by Crowd.tsx; they block the player like small pillars. */
export const crowd = new Map<string, { x: number; z: number }>();
const PERSON_R = 0.28;

const inWorld = (x: number, z: number, pad: number) =>
  x >= WORLD.minX + pad && x <= WORLD.maxX - pad && z >= WORLD.minZ + pad && z <= WORLD.maxZ - pad;

export function canStand(x: number, z: number, obs = obstacles(), vehicles = true): boolean {
  if (inside(INTERIOR, x, z) || inside(DOORWAY, x, z)) return !obs.some((rc) => inside(rc, x, z, r));
  // Outside: anywhere in the city that the baked map grid doesn't block (and not through the office walls).
  return inWorld(x, z, r) && !inside(OFFICE_SHELL, x, z, r) && !gridBlocked(x, z, r) && !parkedCarAt(x, z, r) && !(vehicles && vehicleAt(x, z, r));
}

/** Moving traffic and police cruisers are solid too (drive.ts hands over its live box map). Walking into one used
 *  to put the camera inside the car body, which looked like the player turning see-through. */
export const vehicleBlockers = { boxes: null as Map<string, { x: number; z: number; yaw: number; hl: number; hw: number }> | null };
function vehicleAt(x: number, z: number, pad: number): boolean {
  const boxes = vehicleBlockers.boxes;
  if (!boxes) return false;
  for (const b of boxes.values()) {
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
    const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
    if (Math.abs(dx * s + dz * c) < b.hl + pad && Math.abs(dx * c - dz * s) < b.hw + pad) return true;
  }
  return false;
}

/** Pedestrians stay out of the office (it's the player's space) and off its doorstep. */
export function streetStand(x: number, z: number): boolean {
  return canStand(x, z) && !inside(OFFICE_SHELL, x, z, 1.2);
}

/** Drivable: inside the city, clear of buildings/props and the office (pad = extra clearance in metres). */
export function canDrive(x: number, z: number, pad: number, exceptCar?: string): boolean {
  return inWorld(x, z, pad + 0.5) && !inside(OFFICE_SHELL, x, z, pad + 0.3) && !gridBlocked(x, z, pad) && !parkedCarAt(x, z, pad, exceptCar);
}

/** Parked cars are solid for people on foot (set by drive.ts so this module needn't import it). */
export const parkedFootprints = new Map<string, { x: number; z: number; yaw: number; hl: number; hw: number }>();
function parkedCarAt(x: number, z: number, pad: number, except?: string): boolean {
  for (const [id, c] of parkedFootprints) {
    if (id === except) continue;
    const dx = x - c.x, dz = z - c.z;
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
    const f = dx * s + dz * co, l = dx * co - dz * s;
    if (Math.abs(f) < c.hl + pad && Math.abs(l) < c.hw + pad) return true;
  }
  return false;
}

/** People block only moves that go further into them, so someone bumping into you never pins you in place. */
function crowdBlocks(fx: number, fz: number, tx: number, tz: number): boolean {
  for (const p of crowd.values()) {
    const after = Math.hypot(p.x - tx, p.z - tz);
    if (after < PERSON_R + r && after < Math.hypot(p.x - fx, p.z - fz)) return true;
  }
  return false;
}

/** Move with wall sliding: try the full step, then each axis on its own. Returns distance actually moved. */
function moveBy(dx: number, dz: number): number {
  const p = player.pos;
  const obs = obstacles();
  // If a car has slid into you, you can always step out of it.
  const free = !vehicleAt(p.x, p.z, r);
  const ok = (x: number, z: number) => canStand(x, z, obs, free) && !crowdBlocks(p.x, p.z, x, z);
  if (ok(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; return Math.hypot(dx, dz); }
  if (ok(p.x + dx, p.z)) { p.x += dx; return Math.abs(dx); }
  if (ok(p.x, p.z + dz)) { p.z += dz; return Math.abs(dz); }
  return 0;
}

const isInside = (x: number, z: number) => x < OFFICE.maxX && x > OFFICE.minX && z < OFFICE.maxZ && z > OFFICE.minZ;
const DOOR_MID = (DOOR.z0 + DOOR.z1) / 2;

/** Walk to a point, routing through the door when crossing the office boundary. */
function standUp(): void {
  if (!player.sitting) return;
  player.pos.set(player.sitting.stand.x, 0, player.sitting.stand.z);
  player.sitting = null;
}

export function sitAt(seat: Waypoint, yaw: number): void {
  const stand = { x: player.pos.x, z: player.pos.z };
  player.pos.set(seat.x, 0, seat.z);
  player.sitting = { yaw, stand };
}

export function walkTo(x: number, z: number, onArrive: (() => void) | null = null): void {
  standUp();
  const from = player.pos;
  const route: Waypoint[] = [];
  if (isInside(from.x, from.z) !== isInside(x, z)) {
    const outside = { x: OFFICE.maxX + 0.7, z: DOOR_MID };
    const insideP = { x: OFFICE.maxX - 0.7, z: DOOR_MID };
    route.push(...(isInside(from.x, from.z) ? [insideP, outside] : [outside, insideP]));
  }
  route.push({ x, z });
  player.path = route;
  player.onArrive = onArrive;
  player.stuckT = 0;
}

export function stopPath(): void { player.path = []; player.onArrive = null; }

// ---------------------------------------------------------------- mode changes
export function startExplore(): void {
  const g = useGame.getState();
  if (g.explore || g.mode !== "idle") return;
  player.pos.copy(SEAT);
  player.yaw = 0;
  player.speed = 0;
  player.sitting = null;
  stopPath();
  camHint.yaw = null;
  g.set({ explore: true, seated: false, anim: "idle", emote: null });
}

/** Walk back and sit down (user initiated); from across the island it's a quick cut instead. */
export function returnToDesk(): void {
  const g = useGame.getState();
  if (!g.explore) return;
  if (g.driving || Math.hypot(player.pos.x, player.pos.z) > 60) { void cutToDesk(); return; }
  walkTo(0.15, 0.05, () => {
    useGame.getState().set({ explore: false, seated: true, anim: "typing", prompt: null });
  });
}

/** Fast travel across the island (fade, then appear at a clear spot near the destination). */
export async function travelTo(x: number, z: number, place: (x: number, z: number) => { x: number; z: number }): Promise<void> {
  const g = useGame.getState();
  if (g.driving || g.mode !== "idle") return;
  if (!g.explore) startExplore();
  stopPath();
  useGame.getState().set({ fade: true, panel: "none" });
  await new Promise((res) => setTimeout(res, 400));
  const spot = place(x, z);
  player.pos.set(spot.x, 0, spot.z);
  player.yaw = 0;
  player.snap = true;
  setTimeout(() => useGame.getState().set({ fade: false }), 250);
}

/** Things to tidy up when a cinematic pulls the player back to the office (e.g. an active mission). */
export const onCutToDesk = new Set<() => void>();
const exitHooks = { exitCar: null as null | (() => void) };
export const setExitCarHook = (f: () => void) => { exitHooks.exitCar = f; };

/** Instant cut back to the desk: used before cinematics that are staged in the office. */
export async function cutToDesk(): Promise<void> {
  const g = useGame.getState();
  if (!g.explore) return;
  onCutToDesk.forEach((f) => f());
  g.set({ fade: true });
  await new Promise((res) => setTimeout(res, 380));
  if (useGame.getState().driving) exitHooks.exitCar?.();
  stopPath();
  player.sitting = null;
  player.pos.copy(SEAT);
  player.snap = true;
  useGame.getState().set({ explore: false, seated: true, anim: "typing", prompt: null, emote: null });
  await new Promise((res) => setTimeout(res, 150));
  useGame.getState().set({ fade: false });
}

/** Click/tap on a floor: get up if needed and walk there. Drags (camera orbit) are ignored. */
export function floorClick(e: { delta: number; point: THREE.Vector3; stopPropagation: () => void; nativeEvent?: { pointerType?: string } }): void {
  if (e.delta > 6) return;
  e.stopPropagation();
  const g = useGame.getState();
  // Roaming with a mouse is WASD + mouse look (a click captures the mouse); tap-to-walk stays for touch.
  if (g.explore && e.nativeEvent?.pointerType === "mouse") return;
  if (g.mode !== "idle" || g.panel !== "none") return;
  if (!g.explore) startExplore();
  walkTo(e.point.x, e.point.z);
}

// ---------------------------------------------------------------- interactables
export type Interactable = {
  id: string;
  /** null = not available right now (e.g. plant before tier 2). */
  label: () => string | null;
  at: () => Waypoint;
  radius: number;
  fallback?: boolean;
  run: () => void;
};
const registry = new Map<string, Interactable>();

export function registerInteractables(list: Interactable[]): () => void {
  list.forEach((i) => registry.set(i.id, i));
  return () => list.forEach((i) => registry.delete(i.id));
}

export function nearestInteractable(): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const i of registry.values()) {
    if (!i.label()) continue;
    const p = i.at();
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    // `fallback` items (the companion follows you everywhere) only win when nothing else is in range.
    const score = d + (i.fallback ? 100 : 0);
    if (d <= i.radius && score < bestD) { best = i; bestD = score; }
  }
  return best;
}

// Dev-only handle for scripted browser checks.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__explore = { player, crowd: () => [...crowd.values()], canStand, obstacles, walkTo: (x: number, z: number) => walkTo(x, z), interact: (id: string) => interact(id) };

/** Click or key: if the player is roaming and too far away, walk over first. */
export function interact(id: string): void {
  const item = registry.get(id);
  if (!item || !item.label()) return;
  const g = useGame.getState();
  if (g.mode !== "idle") return; // a reaction is playing; don't fight the director
  playSound("ui");
  if (g.explore) {
    const p = item.at();
    if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) > item.radius) {
      walkTo(p.x, p.z, () => item.run());
      return;
    }
  }
  item.run();
}

/** A short user-triggered body action; ignored while a reaction is playing. */
let emoteTimer: ReturnType<typeof setTimeout> | null = null;
export function emote(anim: "drink" | "wave", ms: number): void {
  const g = useGame.getState();
  if (g.mode !== "idle") return;
  if (emoteTimer) clearTimeout(emoteTimer);
  g.set({ emote: anim });
  emoteTimer = setTimeout(() => useGame.getState().set({ emote: null }), ms);
}

// ---------------------------------------------------------------- per-frame integration
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
export const keys = new Set<string>();

export function stepExplore(dt: number, camera: THREE.Camera): void {
  const g = useGame.getState();
  if (!g.explore) { player.speed = 0; return; }
  if (player.snap) return;

  let dx = 0, dz = 0, target = 0;
  const busy = g.mode !== "idle"; // reactions play in place
  const kx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const kz = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);

  if (!busy && (kx || kz)) {
    stopPath();
    standUp();
    camHint.yaw = null; // keyboard steering is camera-relative; don't swing the camera under the player
    camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    right.set(-fwd.z, 0, fwd.x);
    dx = fwd.x * kz + right.x * kx;
    dz = fwd.z * kz + right.z * kx;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    target = keys.has("shift") && player.aimYaw === null ? RUN : WALK;
  } else if (!busy && player.path.length) {
    const wp = player.path[0];
    const ex = wp.x - player.pos.x, ez = wp.z - player.pos.z;
    const dist = Math.hypot(ex, ez);
    if (dist < 0.12) {
      player.path.shift();
      if (!player.path.length) {
        const done = player.onArrive;
        player.onArrive = null;
        done?.();
      }
    } else {
      dx = ex / dist; dz = ez / dist;
      target = Math.min(PATH_SPEED, dist * 4 + 0.6);
    }
  }

  // Jump (Space): a quick hop; movement keeps its momentum in the air.
  if (keys.has(" ") && !busy && player.pos.y <= 0 && !player.sitting) { player.vy = 4.8; keys.delete(" "); }
  if (player.pos.y > 0 || player.vy > 0) {
    player.vy -= 15 * dt;
    player.pos.y = Math.max(0, player.pos.y + player.vy * dt);
    if (player.pos.y === 0) player.vy = 0;
  }
  player.speed = THREE.MathUtils.lerp(player.speed, target, 1 - Math.exp(-dt * (player.pos.y > 0 ? 1.5 : 10)));
  if (player.speed > 0.02 && (dx || dz)) {
    const want = player.speed * dt;
    const moved = moveBy(dx * want, dz * want);
    player.yaw = lerpAngle(player.yaw, Math.atan2(dx, dz), 1 - Math.exp(-dt * 12));
    if (player.path.length) camHint.yaw = player.yaw;
    // Path blocked (e.g. walked into a wall): give up instead of moonwalking forever.
    if (player.path.length && moved < want * 0.2) {
      player.stuckT += dt;
      if (player.stuckT > 0.6) stopPath();
    } else player.stuckT = 0;
  } else if (player.sitting) {
    player.yaw = lerpAngle(player.yaw, player.sitting.yaw, 1 - Math.exp(-dt * 8));
  }
  // Aiming overrides the facing: walk/strafe while the body points where the crosshair is.
  if (player.aimYaw !== null && !player.sitting) player.yaw = lerpAngle(player.yaw, player.aimYaw, 1 - Math.exp(-dt * 22));
}

export function lerpAngle(a: number, b: number, k: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}
