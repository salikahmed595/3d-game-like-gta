// Wanted level + police (GTA V style). Crimes raise the wanted stars; police cars spawn around the player and
// chase. When you're on foot a cruiser pulls up short of you (never through you), the officers jump out and
// come after you on foot: at one star they try to cuff you, from two stars they shoot. While you drive they ram,
// box you in and, from three stars, shoot at your car. Stay out of their sight long enough and the stars clear;
// get caught and it's BUSTED. Purely a side game: it never touches XP, revenue or rewards.
import { bumpStat, maxStat } from "./stats.ts";
import * as THREE from "three";
import { create } from "zustand";
import { useGame } from "../state/store.ts";
import { playSound, setSiren } from "../audio.ts";
import { canDrive, player, stopPath } from "./explore.ts";
import { drivenCar, exitCar, trafficBoxes } from "./drive.ts";
import { ROADS, onRoad, roadLength, roadPoint, staticHit } from "../world/layout.ts";
import { planRoute } from "./nav.ts";
import { addPerson, damagePlayer, enemyFire, fighter, people, removePerson } from "./people.ts";
import { lineClear } from "./sight.ts";

export type CrimeKind = "assault" | "knockout" | "hit-and-run" | "carjack" | "assault-cop" | "shooting" | "murder" | "cop-kill";
const HEAT: Record<CrimeKind, number> = {
  assault: 0.55, knockout: 0.7, "hit-and-run": 0.9, carjack: 0.8, "assault-cop": 1.2, shooting: 1.0, murder: 1.6, "cop-kill": 2.2,
};

type WantedStore = { stars: number; seen: boolean; set: (p: Partial<WantedStore>) => void };
export const useWanted = create<WantedStore>((set) => ({ stars: 0, seen: false, set: (p) => set(p) }));

export type Cop = {
  id: string; x: number; z: number; yaw: number; speed: number; reverseT: number; hitCd: number; nearT: number; stuckT: number;
  lastX: number; lastZ: number; route: { x: number; z: number }[] | null; planT: number;
  deployed: boolean; // officers are out on foot; the car stays parked
  hp: number; shootCd: number; wreck: boolean;
  blocks: number; // recent times it got stuck (decays); too many and it's replaced
};
export const cops: Cop[] = [];
const state = { heat: 0, unseenT: 0, bustT: 0, busting: false, crimeCd: 0 };
export const bustListeners = new Set<(stars: number) => void>();
/** Set by weapons.ts: blow up a cruiser (explosions live there). */
export const copEvents = { explode: (_x: number, _z: number) => undefined as void };

const COP_LEN = 4.4, COP_W = 1.97;
const STOP_SHORT = 11; // a cruiser pulls up this far from a player on foot
const evadeTime = (stars: number) => 6 + stars * 3;
const copTop = (stars: number) => 26 + stars * 4; // m/s: 1★ ≈ 108 km/h … 5★ ≈ 166 km/h
const officers = () => [...people.values()].filter((p) => p.cop);

/** A crime was committed near the player: raise the heat (and the stars). */
export function commitCrime(kind: CrimeKind): void {
  if (state.busting || !useGame.getState().explore) return;
  const big = kind === "assault-cop" || kind === "murder" || kind === "cop-kill";
  if (state.crimeCd > 0 && !big) return; // one flurry of punches / one burst of fire is one crime
  state.crimeCd = 1.2;
  state.heat = Math.min(5, state.heat + HEAT[kind]);
  state.unseenT = 0;
  const stars = Math.min(5, Math.max(1, Math.ceil(state.heat)));
  if (stars !== useWanted.getState().stars) {
    useWanted.getState().set({ stars, seen: true });
    maxStat("maxWanted", stars);
    playSound("checkpoint");
  }
}

/** Set the wanted level directly (cheats). 0 clears it; otherwise the police come as if for real crimes. */
export function setWanted(stars: number): void {
  if (stars <= 0) { clearWanted(); return; }
  state.heat = Math.min(5, stars); state.unseenT = 0;
  useWanted.getState().set({ stars: Math.min(5, stars), seen: true });
  maxStat("maxWanted", Math.min(5, stars));
}
export const wantedLevel = () => useWanted.getState().stars;

export function clearWanted(): void {
  state.heat = 0; state.unseenT = 0; state.bustT = 0;
  cops.length = 0;
  for (const k of [...trafficBoxes.keys()]) if (k.startsWith("cop-")) trafficBoxes.delete(k);
  for (const p of officers()) removePerson(p.id);
  setSiren(0);
  useWanted.getState().set({ stars: 0, seen: false });
  useGame.getState().set({ copsVersion: useGame.getState().copsVersion + 1 });
}

/** Bullets and blasts against a cruiser. */
export function damageCopCar(id: string, dmg: number): void {
  const c = cops.find((k) => k.id === id);
  if (!c || c.wreck) return;
  c.hp -= dmg;
  commitCrime("assault-cop");
  if (c.hp <= 0) {
    c.wreck = true; c.speed = 0;
    copEvents.explode(c.x, c.z);
    useGame.getState().set({ copsVersion: useGame.getState().copsVersion + 1 });
  }
}

// ---------------------------------------------------------------- spawning
let copSeq = 0, officerSeq = 0;
function spawnCop(): void {
  const px = player.pos.x, pz = player.pos.z;
  for (let tries = 0; tries < 40; tries++) {
    let x: number, z: number;
    if (tries < 25) {
      const road = ROADS[Math.floor(Math.random() * ROADS.length)];
      const p = roadPoint(road, Math.random() * roadLength.get(road.id)!);
      x = p.x; z = p.z;
    } else {
      const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 120;
      x = px + Math.cos(a) * r; z = pz + Math.sin(a) * r;
    }
    const d = Math.hypot(x - px, z - pz);
    if (d < 110 || d > 380) continue;
    if (!canDrive(x, z, 1.5) || staticHit(x, z, 2)) continue;
    cops.push({
      id: `cop-${++copSeq}`, x, z, yaw: Math.atan2(px - x, pz - z), speed: 10, reverseT: 0, hitCd: 0, nearT: 0, stuckT: 0,
      lastX: x, lastZ: z, route: null, planT: Math.random(), deployed: false, hp: 900, shootCd: 2, wreck: false, blocks: 0,
    });
    useGame.getState().set({ copsVersion: useGame.getState().copsVersion + 1 });
    return;
  }
}

/** The cruiser stops: two officers jump out of the doors and take over on foot. */
function deploy(c: Cop): void {
  c.deployed = true; c.speed = 0;
  const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
  for (const side of [1, -1]) {
    const x = c.x + co * side * (COP_W / 2 + 0.7), z = c.z - s * side * (COP_W / 2 + 0.7);
    const p = addPerson(`officer-${++officerSeq}`, "cop", x, z, false, false, true);
    p.yaw = c.yaw;
  }
  playSound("door");
}

const free = (x: number, z: number) => canDrive(x, z, 0.6) && !staticHit(x, z, 0.8);
function clearLine(ax: number, az: number, bx: number, bz: number) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
  for (let i = 1; i < n; i++) if (!free(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n)) return false;
  return true;
}

// ---------------------------------------------------------------- per frame
export function stepPolice(dtRaw: number): void {
  const dt = Math.min(dtRaw, 0.05);
  state.crimeCd = Math.max(0, state.crimeCd - dt);
  const stars = useWanted.getState().stars;
  if (!stars) { if (cops.length || officers().length) clearWanted(); return; }
  const g = useGame.getState();
  if (!g.explore) { clearWanted(); return; }

  const mine = drivenCar();
  const onFoot = !mine;
  const feet = officers();
  const want = Math.min(6, stars * 2);
  const active = cops.filter((c) => !c.deployed && !c.wreck).length;
  if (active + Math.floor(feet.length / 2) < want && Math.random() < dt * 1.2) spawnCop();

  const tx = mine ? mine.x + mine.vx * 0.6 : player.pos.x;
  const tz = mine ? mine.z + mine.vz * 0.6 : player.pos.z;
  let seen = false, nearest = Infinity;

  for (let i = cops.length - 1; i >= 0; i--) {
    const c = cops[i];
    const dx = tx - c.x, dz = tz - c.z, dist = Math.hypot(dx, dz);
    if (!c.wreck) nearest = Math.min(nearest, dist);
    if (dist < 140 && !c.deployed && !c.wreck) seen = true;
    if (dist > 800 || (c.deployed && dist > 300)) { // lost the trail: a new one spawns closer
      cops.splice(i, 1); trafficBoxes.delete(c.id);
      useGame.getState().set({ copsVersion: useGame.getState().copsVersion + 1 });
      continue;
    }
    c.hitCd = Math.max(0, c.hitCd - dt);
    const ref = c;
    const box = () => trafficBoxes.set(c.id, {
      x: c.x, z: c.z, yaw: c.yaw, hl: COP_LEN / 2, hw: COP_W / 2,
      hit: () => { if (ref.hitCd > 0) return; ref.hitCd = 1; ref.speed *= 0.2; commitCrime("assault-cop"); },
    });
    if (c.deployed || c.wreck) {
      // Parked with its doors open (or burnt out): just an obstacle. Officers back in the area re-board if you drive off.
      c.speed = 0;
      if (c.deployed && !c.wreck && mine && dist > 45 && !feet.some((p) => Math.hypot(p.x - c.x, p.z - c.z) > 6 && p.state === "cop")) c.deployed = false;
      box();
      continue;
    }
    // Stuck (wedged against something while trying to move): back out and plan a fresh route.
    c.stuckT += dt;
    c.blocks = Math.max(0, c.blocks - dt * 0.12);
    if (c.stuckT > 2) {
      if (Math.hypot(c.x - c.lastX, c.z - c.lastZ) < 2 && dist > 14) { c.reverseT = 1.1; c.route = null; c.planT = 0; c.blocks += 1; }
      c.stuckT = 0; c.lastX = c.x; c.lastZ = c.z;
    }
    // Hopelessly wedged and out of your sight: quietly replaced by a fresh unit (GTA does the same off-screen).
    if (c.blocks > 3.5 && dist > 45) {
      cops.splice(i, 1); trafficBoxes.delete(c.id);
      useGame.getState().set({ copsVersion: useGame.getState().copsVersion + 1 });
      continue;
    }

    if (c.reverseT > 0) {
      // Backing out of a wall, turning as it goes.
      c.reverseT -= dt;
      c.speed = -6;
      c.yaw += 1.4 * dt;
    } else {
      // Route: straight at the player when the way is clear, otherwise follow an A* path (replanned regularly).
      c.planT -= dt;
      const direct = dist < 12 || clearLine(c.x, c.z, tx, tz);
      if (!direct && (c.planT <= 0 || !c.route?.length)) {
        c.route = planRoute(c.x, c.z, tx, tz);
        c.planT = 1.5 + Math.random() * 0.5;
      }
      let aimX = tx, aimZ = tz;
      if (!direct && c.route?.length) {
        while (c.route.length > 1 && Math.hypot(c.route[0].x - c.x, c.route[0].z - c.z) < 7) c.route.shift();
        aimX = c.route[0].x; aimZ = c.route[0].z;
      }
      // Steer for the aim point, picking the clearest of a fan of headings when something is in the way.
      const desired = Math.atan2(aimX - c.x, aimZ - c.z);
      const look = 5 + Math.abs(c.speed) * 0.45;
      let best = desired, found = false;
      for (const off of [0, 0.35, -0.35, 0.75, -0.75, 1.2, -1.2]) {
        const h = desired + off;
        if (free(c.x + Math.sin(h) * look, c.z + Math.cos(h) * look)) { best = h; found = true; break; }
      }
      const diff = Math.atan2(Math.sin(best - c.yaw), Math.cos(best - c.yaw));
      c.yaw += THREE.MathUtils.clamp(diff, -2.1 * dt, 2.1 * dt);
      const roadBonus = onRoad(c.x, c.z) ? 1 : 0.75;
      let target = copTop(stars) * roadBonus * (1 - Math.min(Math.abs(diff), 1.2) * 0.45);
      if (onFoot) {
        // Pull up short of a pedestrian and brake hard: never drive through them.
        const room = dist - STOP_SHORT;
        target = Math.min(target, Math.max(0, room * 1.4));
        if (room < 1.5 && Math.abs(c.speed) < 2 && !fighter.ko) deploy(c);
      } else if (dist < 25) target = Math.min(target, 6 + dist * 0.9); // close in without overshooting
      if (!found) target = Math.min(target, 8);
      c.speed += THREE.MathUtils.clamp(target - c.speed, -24 * dt, 9 * dt);
    }
    const nx = c.x + Math.sin(c.yaw) * c.speed * dt, nz = c.z + Math.cos(c.yaw) * c.speed * dt;
    const fx = nx + Math.sin(c.yaw) * COP_LEN * 0.5 * Math.sign(c.speed || 1), fz = nz + Math.cos(c.yaw) * COP_LEN * 0.5 * Math.sign(c.speed || 1);
    // Hard guard: a cruiser never moves into a player on foot (or an officer).
    const intoPlayer = onFoot && Math.hypot(nx - player.pos.x, nz - player.pos.z) < COP_LEN * 0.5 + 1.2 && Math.hypot(nx - player.pos.x, nz - player.pos.z) < Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
    if (intoPlayer) { c.speed = 0; if (!c.deployed && !fighter.ko) deploy(c); }
    else if (c.reverseT > 0 || free(fx, fz)) { c.x = nx; c.z = nz; }
    else if (c.reverseT <= 0) { c.reverseT = 0.9; c.speed = 0; c.blocks += 0.6; }

    if (mine) {
      // Ramming the player's car.
      if (c.hitCd <= 0 && Math.hypot(mine.x - c.x, mine.z - c.z) < (COP_LEN + mine.length) * 0.42) {
        const ax = mine.x - c.x, az = mine.z - c.z, l = Math.hypot(ax, az) || 1;
        mine.vx += (ax / l) * 5; mine.vz += (az / l) * 5;
        mine.shake = Math.min(1, mine.shake + 0.5);
        c.speed *= 0.3; c.hitCd = 1.2;
        playSound("crash");
      }
      // Three stars and up: the passenger leans out and shoots at your car.
      c.shootCd -= dt;
      if (stars >= 3 && dist < 38 && c.shootCd <= 0 && lineClear(c.x, 1.4, c.z, mine.x, 1, mine.z)) {
        c.shootCd = 0.35 + Math.random() * 0.5;
        const acc = THREE.MathUtils.clamp(0.55 - dist / 80 - Math.min(Math.abs(mine.speed) / 60, 0.3), 0.08, 0.6);
        enemyFire.shoot(c.x + Math.cos(c.yaw) * 0.9, 1.4, c.z - Math.sin(c.yaw) * 0.9, acc, 6 + stars);
      }
    } else if (Math.abs(c.speed) > 6 && Math.hypot(player.pos.x - c.x, player.pos.z - c.z) < COP_LEN * 0.5 + 0.6 && c.hitCd <= 0) {
      // Clipped a pedestrian player at speed (rare: they brake well before).
      c.hitCd = 1.5;
      damagePlayer(Math.abs(c.speed) * 2, c.x, c.z, "car");
      playSound("thud");
    }
    box();
  }

  // Officers on foot: the trail is kept while any of them can see you; far-away ones are recalled.
  for (const p of feet) {
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (p.state !== "dead") {
      nearest = Math.min(nearest, d);
      if (d < 60 && lineClear(p.x, 1.6, p.z, player.pos.x, 1.4, player.pos.z)) seen = true;
    }
    if (d > 260 || (p.state === "dead" && d > 90)) removePerson(p.id);
  }

  // Busted: an officer on foot gets hands on you (wanted ≤ 2, or you've stopped running), or you're pinned in a car.
  const slow = mine ? Math.abs(mine.speed) < 3 : player.speed < 1.5;
  const cuffing = !mine && feet.some((p) => p.state === "cop" && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 1.6) && (stars <= 2 || slow);
  const pinned = !!mine && slow && cops.some((c) => !c.wreck && Math.hypot(c.x - mine.x, c.z - mine.z) < 8);
  state.bustT = cuffing || pinned ? state.bustT + dt : Math.max(0, state.bustT - dt * 2);
  if (state.bustT > (mine ? 3 : 1.8) && !state.busting && !fighter.ko) void bust(stars);

  // Evading: out of sight long enough and the heat dies down.
  state.unseenT = seen ? 0 : state.unseenT + dt;
  if (seen !== useWanted.getState().seen) useWanted.getState().set({ seen });
  if (state.unseenT > evadeTime(stars)) { clearWanted(); playSound("cash"); }
  setSiren(nearest < 260 ? 1 - nearest / 260 : 0);
}

async function bust(stars: number) {
  state.busting = true;
  bumpStat("busted");
  stopPath();
  playSound("mission-failed");
  bustListeners.forEach((f) => f(stars));
  useGame.getState().set({ deathScreen: "busted" });
  await new Promise((r) => setTimeout(r, 3200));
  useGame.getState().set({ fade: true });
  await new Promise((r) => setTimeout(r, 600));
  if (useGame.getState().driving) exitCar();
  clearWanted();
  player.pos.set(6.5, 0, 0.75); // released just outside the office door
  player.snap = true;
  state.busting = false;
  useGame.getState().set({ deathScreen: null });
  setTimeout(() => useGame.getState().set({ fade: false }), 300);
}

export const wantedState = () => state;

// Dev-only handle for scripted browser checks.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__police = { cops, commitCrime, clearWanted, useWanted, state, planRoute, free, clearLine, damageCopCar };
