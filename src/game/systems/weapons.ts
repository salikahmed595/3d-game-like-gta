// Guns (GTA-style): the user's weapon models, a weapon wheel (hold Tab, or keys 1-8), aim with the right mouse
// button (over-the-shoulder zoom + crosshair), fire with the left, R reloads. Bullets are hitscan from the camera
// through the crosshair, so what you aim at is what you hit; tracers fly from the muzzle. People bleed and fall,
// cars take damage and can blow up, crowds panic and the police come. Purely a side game: never touches sales data.
import * as THREE from "three";
import { create } from "zustand";
import { useGame } from "../state/store.ts";
import { playSound } from "../audio.ts";
import { player } from "./explore.ts";
import { carEvents, cars, damageCar, drivenCar, trafficBoxes } from "./drive.ts";
import { blastPeople, damagePlayer, enemyFire, fighter, panicAround, people, playerPunch, shootPerson } from "./people.ts";
import type { Person } from "./people.ts";
import { commitCrime, copEvents, damageCopCar } from "./police.ts";
import { emitFx, screenFx } from "./fx.ts";
import { bumpStat } from "./stats.ts";
import { traceWorld } from "./sight.ts";
import { orbit } from "../camera/orbit.ts";

export type WeaponId = "fists" | "pistol" | "smg" | "rifle" | "carbine" | "sniper" | "plasma" | "incinerator";
export type WeaponDef = {
  id: WeaponId; name: string; hold: "none" | "pistol" | "rifle";
  damage: number; rate: number; auto: boolean; spread: number; range: number;
  clip: number; maxAmmo: number; reload: number; zoom: number; // aiming FOV
  sound: "pistol" | "smg" | "rifle" | "sniper" | "plasma" | "heavy" | "none";
  tracer: string; muzzle: number; // metres from the grip to the muzzle
  pellets?: number; blast?: number; // incinerator: explosive rounds
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: { id: "fists", name: "Fists", hold: "none", damage: 0, rate: 2.4, auto: false, spread: 0, range: 0, clip: 0, maxAmmo: 0, reload: 0, zoom: 55, sound: "none", tracer: "", muzzle: 0 },
  pistol: { id: "pistol", name: "Pistol", hold: "pistol", damage: 26, rate: 4.5, auto: false, spread: 0.012, range: 120, clip: 12, maxAmmo: 180, reload: 1.3, zoom: 44, sound: "pistol", tracer: "#ffe9a8", muzzle: 0.16 },
  smg: { id: "smg", name: "Gusenberg SMG", hold: "rifle", damage: 18, rate: 11, auto: true, spread: 0.03, range: 90, clip: 50, maxAmmo: 400, reload: 2.1, zoom: 44, sound: "smg", tracer: "#ffd27a", muzzle: 0.54 },
  rifle: { id: "rifle", name: "Assault Rifle", hold: "rifle", damage: 30, rate: 8.5, auto: true, spread: 0.018, range: 160, clip: 30, maxAmmo: 360, reload: 1.9, zoom: 38, sound: "rifle", tracer: "#ffe08a", muzzle: 0.5 },
  carbine: { id: "carbine", name: "Carbine Rifle", hold: "rifle", damage: 34, rate: 7, auto: true, spread: 0.012, range: 180, clip: 30, maxAmmo: 360, reload: 2, zoom: 32, sound: "rifle", tracer: "#fff0b0", muzzle: 0.53 },
  sniper: { id: "sniper", name: "Sniper Rifle", hold: "rifle", damage: 140, rate: 0.9, auto: false, spread: 0.001, range: 600, clip: 5, maxAmmo: 60, reload: 2.8, zoom: 12, sound: "sniper", tracer: "#ffffff", muzzle: 0.84 },
  plasma: { id: "plasma", name: "Plasma Pistol", hold: "pistol", damage: 45, rate: 3, auto: false, spread: 0.006, range: 140, clip: 15, maxAmmo: 150, reload: 1.5, zoom: 42, sound: "plasma", tracer: "#53ff9a", muzzle: 0.23 },
  incinerator: { id: "incinerator", name: "Incinerator", hold: "rifle", damage: 90, rate: 1.1, auto: false, spread: 0.01, range: 150, clip: 6, maxAmmo: 48, reload: 3, zoom: 40, sound: "heavy", tracer: "#ff7a2a", muzzle: 0.56, blast: 5 },
};
export const WHEEL: WeaponId[] = ["fists", "pistol", "smg", "rifle", "carbine", "sniper", "plasma", "incinerator"];
export const weaponModelUrl = (id: WeaponId) => `/models/weapons/${id}.glb`;

type Ammo = { clip: number; reserve: number };
type ArsenalStore = {
  current: WeaponId;
  owned: Partial<Record<WeaponId, Ammo>>;
  wheel: boolean;
  set: (p: Partial<ArsenalStore>) => void;
};
const KEY = "se-arsenal";
function load(): Pick<ArsenalStore, "current" | "owned"> {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Pick<ArsenalStore, "current" | "owned"> | null;
    if (s?.owned) return { current: s.current in WEAPONS ? s.current : "fists", owned: { ...s.owned, fists: { clip: 0, reserve: 0 } } };
  } catch { /* storage blocked */ }
  // Everyone starts with a pistol (and their fists); the rest are pickups around the city.
  return { current: "fists", owned: { fists: { clip: 0, reserve: 0 }, pistol: { clip: 12, reserve: 60 } } };
}
export const useArsenal = create<ArsenalStore>((set) => ({ ...load(), wheel: false, set: (p) => set(p) }));
let saveT: ReturnType<typeof setTimeout> | null = null;
useArsenal.subscribe((s) => {
  if (saveT) clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ current: s.current, owned: s.owned })); } catch { /* ignore */ } }, 400);
});

/** Live gun state read by the camera, avatar and HUD every frame. */
export const gun = {
  trigger: false, aiming: false, cooldown: 0, reloadT: 0, recoil: 0, flash: 0, held: false,
  pitch: 0, // camera pitch while aiming (radians, + up), for the arm pose
  target: null as Person | null, // person under the crosshair (crosshair turns red)
  sinceShot: 99, // seconds since the last shot: the gun stays up a moment after hip-fire, like GTA
  kick: 0, // 0..1 this shot's recoil impulse (arms / shoulders snap back, then settle)
};
/** 0..1 through the current reload (0 when not reloading), for the reload animation. */
export const reloadProgress = (): number => (gun.reloadT > 0 ? 1 - gun.reloadT / currentWeapon().reload : 0);

export const currentWeapon = (): WeaponDef => WEAPONS[useArsenal.getState().current];

export function selectWeapon(id: WeaponId): void {
  const s = useArsenal.getState();
  if (!s.owned[id] || s.current === id) return;
  gun.reloadT = 0;
  s.set({ current: id });
  playSound(id === "fists" ? "ui" : "equip");
}

export function cycleWeapon(dir: 1 | -1): void {
  const s = useArsenal.getState();
  const owned = WHEEL.filter((w) => s.owned[w]);
  const i = owned.indexOf(s.current);
  selectWeapon(owned[(i + dir + owned.length) % owned.length]);
}

/** Pickups and the gun shop: add a weapon (or ammo for one you have). */
export function giveWeapon(id: WeaponId, rounds: number): void {
  const s = useArsenal.getState();
  const def = WEAPONS[id];
  const have = s.owned[id];
  const owned = { ...s.owned };
  if (have) owned[id] = { clip: have.clip, reserve: Math.min(def.maxAmmo, have.reserve + rounds) };
  else owned[id] = { clip: Math.min(def.clip, rounds), reserve: Math.max(0, Math.min(def.maxAmmo, rounds - def.clip)) };
  s.set({ owned, current: have ? s.current : id });
}

export function reload(): void {
  const s = useArsenal.getState();
  const def = currentWeapon();
  const a = s.owned[def.id];
  if (!a || def.hold === "none" || gun.reloadT > 0 || a.clip >= def.clip || a.reserve <= 0) return;
  gun.reloadT = def.reload;
  playSound("reload");
}

function finishReload() {
  const s = useArsenal.getState();
  const def = currentWeapon();
  const a = s.owned[def.id];
  if (!a) return;
  const take = Math.min(def.clip - a.clip, a.reserve);
  s.set({ owned: { ...s.owned, [def.id]: { clip: a.clip + take, reserve: a.reserve - take } } });
}

// ---------------------------------------------------------------- hit tests
type Hit = { d: number; kind: "world" | "person" | "car"; person?: Person; carId?: string; y: number };
const CAR_TOP = 1.55;

/** Ray (normalised dir) vs an upright person (vertical cylinder) or a lying one (low slab). */
function hitPerson(p: Person, o: THREE.Vector3, dir: THREE.Vector3, max: number): number | null {
  const lying = p.fall > 0.5 || p.state === "dead";
  const r = lying ? 0.55 : 0.32, top = lying ? 0.45 : 1.82;
  const ox = o.x - p.x, oz = o.z - p.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-6) return null;
  const b = 2 * (ox * dir.x + oz * dir.z), c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > max) return null;
  const y = o.y + dir.y * t;
  return y >= p.y && y <= p.y + top ? t : null;
}

/** Ray vs an oriented car box (x/z footprint, 0..CAR_TOP high). */
function hitBox(cx: number, cz: number, yaw: number, hl: number, hw: number, o: THREE.Vector3, dir: THREE.Vector3, max: number): number | null {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const lx = (o.x - cx) * c - (o.z - cz) * s, lz = (o.x - cx) * s + (o.z - cz) * c; // lateral, forward
  const dx = dir.x * c - dir.z * s, dz = dir.x * s + dir.z * c;
  let t0 = 0, t1 = max;
  for (const [p, d, h] of [[lx, dx, hw], [lz, dz, hl], [o.y - CAR_TOP / 2, dir.y, CAR_TOP / 2]] as const) {
    if (Math.abs(d) < 1e-6) { if (Math.abs(p) > h) return null; continue; }
    let a = (-h - p) / d, b = (h - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

function trace(o: THREE.Vector3, dir: THREE.Vector3, range: number, ignoreCar: string | null): Hit {
  let best: Hit = { d: traceWorld(o.x, o.y, o.z, dir.x, dir.y, dir.z, range), kind: "world", y: 0 };
  for (const p of people.values()) {
    const t = hitPerson(p, o, dir, best.d);
    if (t !== null && t < best.d) best = { d: t, kind: "person", person: p, y: o.y + dir.y * t - p.y };
  }
  for (const c of cars.values()) {
    if (c.id === ignoreCar) continue;
    const t = hitBox(c.x, c.z, c.yaw, c.length / 2, c.width / 2, o, dir, best.d);
    if (t !== null && t < best.d) best = { d: t, kind: "car", carId: c.id, y: 0 };
  }
  for (const [id, b] of trafficBoxes) {
    if (id === ignoreCar) continue;
    const t = hitBox(b.x, b.z, b.yaw, b.hl, b.hw, o, dir, best.d);
    if (t !== null && t < best.d) best = { d: t, kind: "car", carId: id, y: 0 };
  }
  return best;
}

// ---------------------------------------------------------------- firing
const camDir = new THREE.Vector3(), camPos = new THREE.Vector3(), shotDir = new THREE.Vector3(), muzzle = new THREE.Vector3(), tmp = new THREE.Vector3();

/** Where the player's muzzle is (the renderer keeps it updated from the hand bone). */
export const muzzleAt = new THREE.Vector3();

function fire(camera: THREE.Camera, def: WeaponDef) {
  const s = useArsenal.getState();
  const a = s.owned[def.id]!;
  if (a.clip <= 0) {
    if (a.reserve > 0) reload(); else { playSound("dry-fire"); gun.cooldown = 0.3; }
    return;
  }
  s.set({ owned: { ...s.owned, [def.id]: { ...a, clip: a.clip - 1 } } });
  bumpStat("shots");
  gun.cooldown = 1 / def.rate;
  gun.flash = 0.05;
  gun.sinceShot = 0;
  const heavy = def.id === "sniper" || def.id === "incinerator";
  gun.recoil = Math.min(1, gun.recoil + (heavy ? 1 : def.hold === "rifle" ? 0.3 : 0.45));
  gun.kick = heavy ? 1 : def.hold === "rifle" ? 0.55 : 0.75;
  screenFx.shake = Math.min(1, screenFx.shake + (heavy ? 0.35 : def.hold === "rifle" ? 0.06 : 0.04));
  playSound(`shot-${def.sound}` as never);
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(camDir);
  // Start the ray level with the player (so nothing between the camera and your back gets hit).
  const back = tmp.copy(player.pos).setY(1.4).sub(camPos).dot(camDir);
  const origin = camPos.addScaledVector(camDir, Math.max(0, back));
  const spread = def.spread * (gun.aiming ? 1 : 2.4) * (1 + Math.min(player.speed / 6, 1));
  shotDir.copy(camDir).add(tmp.set((Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread)).normalize();
  // Recoil kicks the view up a little.
  orbit.pol = Math.max(0.45, orbit.pol - (def.id === "sniper" ? 0.03 : 0.006));
  const hit = trace(origin, shotDir, def.range, useGame.getState().driving);
  const end = tmp.copy(origin).addScaledVector(shotDir, hit.d);
  muzzle.copy(muzzleAt);
  emitFx({ kind: "flash", at: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, color: def.tracer, size: def.hold === "rifle" ? 0.55 : 0.4 });
  emitFx({ kind: "tracer", from: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, to: { x: end.x, y: end.y, z: end.z }, color: def.tracer, width: def.id === "incinerator" ? 3 : 1 });
  // The spent case flicks out to the right of the gun.
  if (!def.blast && def.id !== "plasma") emitFx({ kind: "casing", at: { x: muzzle.x - shotDir.x * 0.18, y: muzzle.y + 0.04, z: muzzle.z - shotDir.z * 0.18 }, dir: { x: -shotDir.z, y: 0.9, z: shotDir.x } });
  if (def.blast) {
    explode(end.x, Math.max(0.3, end.y), end.z, def.blast, def.damage, true);
  } else if (hit.kind === "person" && hit.person) {
    const victim = hit.person;
    shootPerson(victim, def.damage * (0.85 + Math.random() * 0.3), shotDir.x, shotDir.z, hit.y, true, def.hold === "rifle" || def.id === "sniper" ? 1.6 : 1);
    // Exit wound: a spray carried on through, spattering the ground behind them.
    const back = 1.2 + Math.random() * 1.6;
    emitFx({ kind: "blood", at: { x: end.x + shotDir.x * 0.3, y: end.y, z: end.z + shotDir.z * 0.3 }, dir: { x: shotDir.x, y: 0.1, z: shotDir.z }, amount: def.hold === "rifle" ? 12 : 7 });
    emitFx({ kind: "splat", x: victim.x + shotDir.x * back, z: victim.z + shotDir.z * back, size: 0.5 + Math.random() * 0.5 });
  } else if (hit.kind === "car" && hit.carId) {
    emitFx({ kind: "spark", at: { x: end.x, y: end.y, z: end.z } });
    hitCar(hit.carId, def.damage);
  } else if (hit.d < def.range) {
    emitFx({ kind: "spark", at: { x: end.x, y: end.y, z: end.z }, color: end.y < 0.1 ? "#b9a88a" : undefined });
  }
  panicAround(player.pos.x, player.pos.z, 45);
  if (nearWitness()) commitCrime("shooting");
}

function nearWitness(): boolean {
  for (const p of people.values()) if (p.state !== "dead" && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 40) return true;
  return false;
}

function hitCar(id: string, dmg: number) {
  if (id.startsWith("cop-")) { damageCopCar(id, dmg); return; }
  if (cars.has(id)) damageCar(id, dmg, true);
  else trafficBoxes.get(id)?.hit(dmg * 0.05, 0, 0); // traffic: the driver panics and stops
}

/** A big bang: fireball, people thrown, cars wrecked, the player hurt if close. */
export function explode(x: number, y: number, z: number, r: number, dmg: number, byPlayer: boolean): void {
  emitFx({ kind: "explosion", at: { x, y, z }, size: r });
  playSound("explosion");
  // The blast wave shakes the camera, falling off with distance.
  screenFx.shake = Math.min(1, screenFx.shake + Math.max(0, 1 - Math.hypot(player.pos.x - x, player.pos.z - z) / (r * 8)));
  blastPeople(x, z, r * 1.4, dmg, byPlayer);
  for (const c of cars.values()) { const d = Math.hypot(c.x - x, c.z - z); if (d < r * 1.5) damageCar(c.id, 600 * (1 - d / (r * 1.5)), byPlayer); }
  const pd = Math.hypot(player.pos.x - x, player.pos.z - z);
  if (pd < r * 1.4 && !useGame.getState().driving) damagePlayer(70 * (1 - pd / (r * 1.4)), x, z, "explosion");
  panicAround(x, z, 60);
  if (byPlayer) commitCrime("shooting");
}

// Police and rivals shoot back through this (people.ts calls it; it lives here so people.ts needs no three.js).
enemyFire.shoot = (fx, fy, fz, accuracy, dmg) => {
  const car = drivenCar();
  const tx = player.pos.x, ty = car ? 1 : 1.25, tz = player.pos.z;
  const hits = Math.random() < accuracy;
  const miss = hits ? 0 : 0.8 + Math.random() * 1.6;
  const a = Math.random() * Math.PI * 2;
  const to = { x: tx + Math.cos(a) * miss, y: ty + (Math.random() - 0.3) * (hits ? 0.3 : 1.2), z: tz + Math.sin(a) * miss };
  emitFx({ kind: "flash", at: { x: fx, y: fy, z: fz }, color: "#ffe9a8", size: 0.35 });
  emitFx({ kind: "tracer", from: { x: fx, y: fy, z: fz }, to, color: "#ffe9a8" });
  playSound("shot-distant");
  if (!hits) { if (Math.random() < 0.3) playSound("ricochet"); return; }
  if (car) damageCar(car.id, dmg * 2.2, false);
  else damagePlayer(dmg, fx, fz, "bullet");
};

// Burning cars go up through the same explosion (drive.ts can't import this module: it would be a cycle).
carEvents.explode = (x, z, byPlayer) => explode(x, 1, z, 6, 220, byPlayer);
carEvents.playerInBlast = () => damagePlayer(999, player.pos.x, player.pos.z, "explosion");
copEvents.explode = (x, z) => explode(x, 1, z, 6, 220, true);
carEvents.smoke = (x, y, z, dark) => emitFx({ kind: "smoke", at: { x, y, z }, dark });

// ---------------------------------------------------------------- per frame
export function stepWeapons(dt: number, camera: THREE.Camera): void {
  const g = useGame.getState();
  const def = currentWeapon();
  gun.cooldown = Math.max(0, gun.cooldown - dt);
  gun.flash = Math.max(0, gun.flash - dt);
  gun.recoil = Math.max(0, gun.recoil - dt * 5);
  gun.kick = Math.max(0, gun.kick - dt * 9);
  gun.sinceShot += dt;
  gun.held = g.explore && !g.driving && def.hold !== "none" && !fighter.ko && !player.sitting;
  if (!gun.held) { gun.aiming = false; gun.target = null; }
  // Aim direction from the camera: the body turns to it (explore.ts) and the arms pitch with it (Avatar).
  camera.getWorldDirection(camDir);
  gun.pitch = Math.asin(THREE.MathUtils.clamp(camDir.y, -1, 1)) + 0.12;
  player.aimYaw = gun.held && (gun.aiming || gun.trigger) ? Math.atan2(camDir.x, camDir.z) : null;
  if (gun.reloadT > 0) { gun.reloadT -= dt; if (gun.reloadT <= 0) { gun.reloadT = 0; finishReload(); } }
  // Crosshair target (turns red on a person, like GTA's lock indicator).
  if (gun.held && (gun.aiming || gun.trigger)) {
    camera.getWorldPosition(camPos); camera.getWorldDirection(camDir);
    const back = tmp.copy(player.pos).setY(1.4).sub(camPos).dot(camDir);
    const h = trace(camPos.addScaledVector(camDir, Math.max(0, back)), camDir, def.range, null);
    gun.target = h.kind === "person" && h.person && h.person.state !== "dead" ? h.person : null;
  } else gun.target = null;
  if (!gun.held || !gun.trigger || gun.reloadT > 0 || gun.cooldown > 0) {
    if (gun.trigger && def.hold === "none" && g.explore && !g.driving) { playerPunch(); gun.trigger = false; }
    return;
  }
  fire(camera, def);
  if (!def.auto) gun.trigger = false; // semi-auto: one shot per click
  // GTA reloads by itself when the clip runs dry (if there's ammo left).
  const left = useArsenal.getState().owned[def.id];
  if (left && left.clip <= 0 && left.reserve > 0) reload();
}

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__weapons = { useArsenal, gun, giveWeapon, selectWeapon, WEAPONS, explode, trace };
