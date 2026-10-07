// Street life: every pedestrian is a small simulated person (not an animation player). They roam, notice you,
// get shoved when you barge into them, fight back or run when hit, dive away from horns, get knocked flying by
// cars, scatter screaming at gunfire, and can be shot (they fall, bleed and stay down). Police officers on foot
// are people too (cop: true): they chase, arrest at one star and shoot back from two. The population follows you
// around the island. Purely a side game: nothing here touches XP, revenue or rewards.
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { bark, playSound } from "../audio.ts";
import { canStand, crowd, keys, lerpAngle, player, streetStand } from "./explore.ts";
import { carStrikes, cars, drivenCar } from "./drive.ts";
import { DISTRICTS, districtAt, openSpot } from "../world/layout.ts";
import { commitCrime, useWanted } from "./police.ts";
import { chargeAbility, rageOn } from "./abilities.ts";
import { emitFx, screenFx } from "./fx.ts";
import { lineClear } from "./sight.ts";
import { slowMo, normalTime } from "./time.ts";
import { bumpStat } from "./stats.ts";

export type PersonState = "roam" | "wave" | "stagger" | "air" | "down" | "getup" | "flee" | "fight" | "dead" | "cop";

export type Person = {
  id: string; charId: string; rival: boolean; anchored: boolean; // anchored: stays in its spot (a playable character you left)
  cop: boolean; // police officer on foot (police.ts spawns and removes them)
  x: number; z: number; yaw: number; speed: number;
  vx: number; vz: number; // shove / knock-back velocity
  y: number; vy: number; tumble: number; // airborne after a car hit
  fall: number; // 0 upright … 1 lying on the ground
  hp: number; state: PersonState; t: number;
  target: { x: number; z: number } | null; wait: number; phase: number; life: number;
  attackT: number; attackCd: number; punchSide: 1 | -1; bumpCd: number; home: { x: number; z: number };
  aiming: number; // 0..1 gun raised (cops)
  shootCd: number; flash: number; // cop fire cadence; muzzle flash timer (for the renderer)
  strafe: number; // cop sidestep direction
  bled: boolean; // blood pool left under the body
  // Gunshot reactions (read by the renderer): where the last hit came from and what it hit.
  hitT: number; // seconds since the last hit (a flinch plays for the first ~0.4 s)
  hitFront: number; // +1 shot from the front … -1 from behind
  hitSide: number; // +1 from their left … -1 from their right
  hitPart: "head" | "chest" | "belly" | "leg";
  wound: number; // 0..1 bleeding: they clutch it, limp if it's a leg, and leave a blood trail
  dripT: number;
  death: DeathStyle; // how they go down
  fallDir: number; // +1 falls backward, -1 forward
  fallSide: number; // sideways roll as they hit the ground (-1..1)
};

/** How someone goes down when shot: drop on the spot (head), stagger and fold (body), or thrown back (heavy hit). */
export type DeathStyle = "drop" | "fold" | "thrown";

export const people = new Map<string, Person>();
const bumpVersion = () => useGame.getState().set({ peopleVersion: useGame.getState().peopleVersion + 1 });

const SHOUT_BUMP = ["Hey!", "Watch it!", "Excuse you!", "Look where you're going!", "Seriously?"];
const SHOUT_HIT = ["Ow!", "What's your problem?", "You wanna go?", "Okay, let's do this!", "Big mistake!"];
const SHOUT_FLEE = ["Help!", "Somebody help!", "Leave me alone!", "Get away from me!"];
const SHOUT_CAR = ["Are you crazy?!", "Learn to drive!", "Aaah!", "Watch the road!"];
const SHOUT_GUN = ["He's got a gun!", "Run!", "Oh my god!", "Call the cops!", "Get down!"];
const SHOUT_COP = ["Police! Freeze!", "Hands where I can see them!", "Stop right there!", "Suspect is armed!", "Get on the ground!"];

export function addPerson(id: string, charId: string, x: number, z: number, rival = false, anchored = false, cop = false): Person {
  const p: Person = {
    id, charId, rival, anchored, cop, x, z, yaw: Math.random() * 6.28, speed: 0, vx: 0, vz: 0, y: 0, vy: 0, tumble: 0, fall: 0,
    hp: rival ? 140 : cop ? 120 : 100, state: cop ? "cop" : rival ? "fight" : "roam", t: 0, target: null, wait: Math.random() * 3, phase: 0, life: Math.random() * 10,
    attackT: 0, attackCd: 1.2, punchSide: 1, bumpCd: 0, home: { x, z }, aiming: 0, shootCd: 1 + Math.random(), flash: 0,
    strafe: Math.random() < 0.5 ? 1 : -1, bled: false,
    hitT: 99, hitFront: 1, hitSide: 0, hitPart: "chest", wound: 0, dripT: 0, death: "fold", fallDir: 1, fallSide: 0,
  };
  people.set(id, p);
  bumpVersion();
  return p;
}

export function removePerson(id: string): void {
  people.delete(id);
  crowd.delete(id);
  bumpVersion();
}

// ---------------------------------------------------------------- the player: health, armour, fists
export const fighter = { hp: 100, armor: 0, attackT: 0, side: 1 as 1 | -1, hurtT: 0, sinceHurt: 99, ko: false, struck: false };
export const PUNCH_TIME = 0.42;
export const MAX_HP = 100;

export function playerPunch(): void {
  const g = useGame.getState();
  if (!g.explore || g.driving || fighter.ko || fighter.attackT > 0 || player.sitting) return;
  fighter.attackT = PUNCH_TIME;
  fighter.side = fighter.side === 1 ? -1 : 1;
  fighter.struck = false;
  playSound("whoosh");
}

export type DamageKind = "melee" | "bullet" | "car" | "explosion";

/** Hurt the player. Armour soaks bullets and blasts first (like GTA); at zero health it's WASTED. */
/** The player's last hit (Avatar plays the same flinch NPCs get). */
export const playerHit = { t: 99, front: 1, side: 0 };

export function damagePlayer(dmg: number, fromX: number, fromZ: number, kind: DamageKind = "melee"): void {
  if (fighter.ko || useGame.getState().mode !== "idle" && !useGame.getState().explore) return;
  let d = dmg * (rageOn() ? 0.3 : 1);
  if (kind !== "melee" && fighter.armor > 0) {
    const soak = Math.min(fighter.armor, d * 0.8);
    fighter.armor -= soak;
    d -= soak;
  }
  fighter.hp -= d;
  if (kind !== "melee") {
    // Where it came from, relative to the way the player faces (for the flinch).
    const dx = player.pos.x - fromX, dz = player.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    Object.assign(playerHit, { t: 0, front: -((dx / l) * fx + (dz / l) * fz), side: (dx / l) * fz - (dz / l) * fx });
  }
  fighter.hurtT = kind === "bullet" ? 0.18 : 0.32;
  fighter.sinceHurt = 0;
  screenFx.hurt = Math.min(1, screenFx.hurt + 0.25 + d / 60);
  if (kind === "melee") playSound("punch");
  else if (kind === "bullet") playSound("bullet-hit");
  if (kind !== "bullet" && !useGame.getState().driving) {
    const dx = player.pos.x - fromX, dz = player.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
    const nx = player.pos.x + (dx / l) * 0.25, nz = player.pos.z + (dz / l) * 0.25;
    if (canStand(nx, nz)) player.pos.set(nx, player.pos.y, nz);
  }
  if (kind === "bullet" && !useGame.getState().driving && Math.random() < 0.35) {
    emitFx({ kind: "blood", at: { x: player.pos.x, y: 1.2, z: player.pos.z }, dir: { x: player.pos.x - fromX, y: 0.2, z: player.pos.z - fromZ }, amount: 6 });
  }
  if (fighter.hp <= 0) wasted();
}

/** WASTED: the screen drains of colour in slow motion, then you wake up outside the office (the "hospital"). */
export const koListeners = new Set<() => void>();
function wasted() {
  fighter.ko = true;
  fighter.hp = 0;
  bumpStat("wasted");
  playSound("wasted");
  slowMo(0.3, 0.3);
  useGame.getState().set({ ko: true, deathScreen: "wasted" });
  koListeners.forEach((f) => f());
  if (!useGame.getState().driving) emitFx({ kind: "pool", x: player.pos.x, z: player.pos.z, size: 1.4 });
  setTimeout(() => {
    useGame.getState().set({ fade: true });
    setTimeout(() => {
      normalTime();
      respawnPlayer();
      setTimeout(() => useGame.getState().set({ fade: false }), 350);
    }, 600);
  }, 4200);
}

/** Back on your feet at full health just outside the office (or the nearest district). */
export const respawnHooks = new Set<() => void>();
function respawnPlayer() {
  respawnHooks.forEach((f) => f()); // e.g. get out of a wrecked car, clear the wanted level
  const d = nearestDistrict(player.pos.x, player.pos.z);
  const spot = d.key === "downtown" || Math.hypot(player.pos.x, player.pos.z) < 600 ? { x: 6.5, z: 0.75 } : openSpot(d.ox, d.oz, canStand);
  player.pos.set(spot.x, 0, spot.z);
  player.vy = 0;
  player.snap = true;
  fighter.hp = MAX_HP;
  fighter.ko = false;
  for (const p of people.values()) if (p.state === "fight" && !p.rival) setState(p, "roam");
  useGame.getState().set({ ko: false, deathScreen: null });
}

export function nearestDistrict(x: number, z: number) {
  let best = DISTRICTS[0], bd = Infinity;
  for (const d of DISTRICTS) { const k = Math.hypot(d.ox - x, d.oz - z); if (k < bd) { bd = k; best = d; } }
  return best;
}

// ---------------------------------------------------------------- reactions
/** Body lean toward the ground over time for each way of dying: the knees go first, then the body hits the floor. */
export function deathFall(style: DeathStyle, t: number): number {
  const ease = (x: number) => x * x * (3 - 2 * x);
  const seg = (a: number, b: number) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
  if (style === "drop") return seg(0.18, 0.62); // legs fold at once, the body follows
  if (style === "thrown") return seg(0.02, 0.38); // knocked straight over
  return seg(0.7, 1.25); // a stagger, the knees buckle, then down
}

function setState(p: Person, s: PersonState) { p.state = s; p.t = 0; }
const alive = (p: Person) => p.state !== "dead";

function hitPerson(p: Person, dmg: number, dirX: number, dirZ: number, force: number) {
  p.hp -= dmg;
  p.vx += dirX * force; p.vz += dirZ * force;
  p.yaw = Math.atan2(-dirX, -dirZ); // face the attacker
  if (p.hp <= 0) { knockDown(p, dirX * force, dirZ * force, 2.2); return; }
  if (p.cop) { p.attackCd = 0.4; return; } // officers shrug it off and keep coming
  setState(p, "stagger");
  const fights = p.rival || Math.random() < 0.55;
  p.attackCd = 0.6;
  p.punchSide = fights ? 1 : -1; // remembered for after the stagger
  bark(fights ? SHOUT_HIT : SHOUT_FLEE, 0.9 + Math.random() * 0.3);
}

function knockDown(p: Person, vx: number, vz: number, vy: number) {
  p.vx = vx; p.vz = vz; p.vy = vy; p.y = 0.01;
  p.hp = Math.min(p.hp, 0);
  setState(p, "air");
}

/** A bullet (or blast) hit a person. Returns true if it killed them. */
export function shootPerson(p: Person, dmg: number, dirX: number, dirZ: number, hitY: number, byPlayer: boolean, power = 1): boolean {
  if (!alive(p)) { emitFx({ kind: "blood", at: { x: p.x, y: 0.2, z: p.z }, dir: { x: dirX, y: 0.5, z: dirZ }, amount: 4 }); p.hitT = 0; return false; }
  const l = Math.hypot(dirX, dirZ) || 1;
  const head = hitY > (p.fall > 0.5 ? 9 : 1.48);
  // Where it hit, relative to how they're standing (the renderer turns this into a flinch / a fall direction).
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  p.hitFront = -((dirX / l) * fx + (dirZ / l) * fz);
  p.hitSide = (dirX / l) * fz - (dirZ / l) * fx;
  p.hitPart = head ? "head" : hitY > 1.15 ? "chest" : hitY > 0.85 ? "belly" : "leg";
  p.hitT = 0;
  p.wound = Math.min(1, p.wound + (head ? 1 : 0.45));
  const d = dmg * (head ? 3 : 1);
  p.hp -= d;
  emitFx({ kind: "blood", at: { x: p.x - (dirX / l) * 0.2, y: Math.min(hitY, 1.7), z: p.z - (dirZ / l) * 0.2 }, dir: { x: dirX / l, y: 0.25, z: dirZ / l }, amount: head ? 18 : 10 });
  if (byPlayer) { screenFx.hitMarker = 1; chargeAbility(0.01); }
  if (p.hp <= 0) {
    // Down for good. A headshot drops them where they stand; a heavy round at close range throws them back; most
    // body shots stagger them a step or two, the knees go, and they fold to the ground.
    const close = Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 9;
    p.death = head ? "drop" : power > 1.3 && close ? "thrown" : "fold";
    const push = p.death === "thrown" ? 3.4 : p.death === "fold" ? 1.1 : 0.3;
    p.vx = (dirX / l) * push; p.vz = (dirZ / l) * push; p.vy = p.death === "thrown" ? 1.6 : 0; p.y = 0;
    // Fall away from the shot when it came from in front; forward (onto their face) when shot from behind, or
    // when the legs just give way.
    p.fallDir = p.death === "drop" ? (Math.random() < 0.5 ? 1 : -1) : p.hitFront > -0.2 ? 1 : -1;
    p.fallSide = THREE.MathUtils.clamp(p.hitSide * 0.8 + (Math.random() - 0.5) * 0.6, -1, 1);
    setState(p, "dead");
    if (byPlayer) bumpStat("kills");
    p.speed = 0; p.aiming = 0;
    crowd.delete(p.id);
    if (byPlayer) {
      screenFx.kill = 1;
      if (p.cop) commitCrime("cop-kill");
      else if (!p.rival) commitCrime("murder");
    }
    panicAround(p.x, p.z, 40);
    return true;
  }
  if (byPlayer && p.cop) commitCrime("assault-cop");
  else if (byPlayer && !p.rival) commitCrime("shooting");
  if (!p.cop && !p.rival) { setState(p, "flee"); bark(SHOUT_GUN, 1.2); }
  // The impact shoves them half a step.
  p.vx += (dirX / l) * 0.8 * power; p.vz += (dirZ / l) * 0.8 * power;
  return false;
}

/** Gunfire nearby: everyone who isn't police scatters. */
export function panicAround(x: number, z: number, r: number): void {
  let shouted = false;
  for (const p of people.values()) {
    if (p.cop || p.rival || !alive(p) || p.state === "air" || p.state === "down") continue;
    if (Math.hypot(p.x - x, p.z - z) > r) continue;
    if (p.state !== "flee") { setState(p, "flee"); p.speed = Math.max(p.speed, 2); }
    if (!shouted) { bark(SHOUT_GUN, 1.15 + Math.random() * 0.2); shouted = true; }
  }
}

/** An explosion: people nearby are thrown and hurt. */
export function blastPeople(x: number, z: number, r: number, dmg: number, byPlayer: boolean): void {
  for (const p of people.values()) {
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
    if (d > r || !alive(p)) continue;
    const k = 1 - d / r;
    const killed = shootPerson(p, dmg * k, dx || 0.1, dz, 1.0, byPlayer);
    if (!killed) knockDown(p, (dx / (d || 1)) * 7 * k, (dz / (d || 1)) * 7 * k, 3 + 5 * k);
    else { p.vx = (dx / (d || 1)) * 7 * k; p.vz = (dz / (d || 1)) * 7 * k; p.vy = 3 + 5 * k; p.death = "thrown"; p.fallDir = 1; }
  }
}

// Cars knock people down; a fast hit sends them flying, a very fast one kills.
carStrikes.test = (x, z, vx, vz, r) => {
  let struck = false;
  for (const p of people.values()) {
    if (p.state === "air" || p.state === "down" || p.state === "getup" || p.state === "dead") continue;
    if (Math.hypot(p.x - x, p.z - z) > r + 0.35) continue;
    const v = Math.hypot(vx, vz);
    if (v > 22) {
      p.hp = 0; setState(p, "dead"); p.death = "thrown"; p.fallDir = 1; p.fallSide = (Math.random() - 0.5) * 1.4; p.vx = vx * 0.6; p.vz = vz * 0.6; p.vy = Math.min(9, 2 + v * 0.15); p.y = 0.01; crowd.delete(p.id);
      emitFx({ kind: "blood", at: { x: p.x, y: 1, z: p.z }, dir: { x: vx / v, y: 0.5, z: vz / v }, amount: 12 });
      commitCrime(p.cop ? "cop-kill" : "murder");
    } else {
      knockDown(p, vx * 0.75, vz * 0.75, Math.min(9, 1.5 + v * 0.18));
      commitCrime(p.cop ? "assault-cop" : "hit-and-run");
    }
    playSound("thud");
    bark(SHOUT_CAR, 1.2);
    struck = true;
  }
  return struck;
};

// ---------------------------------------------------------------- movement helpers
function pathClear(ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(len / 0.6));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!streetStand(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

function pickTarget(p: Person): { x: number; z: number } | null {
  const ROAM = 45;
  for (let tries = 0; tries < 10; tries++) {
    const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 14;
    let tx = p.x + Math.cos(a) * d, tz = p.z + Math.sin(a) * d;
    if (Math.hypot(tx - p.home.x, tz - p.home.z) > ROAM) { tx = p.home.x + (tx - p.home.x) * 0.5; tz = p.home.z + (tz - p.home.z) * 0.5; }
    if (streetStand(tx, tz) && pathClear(p.x, p.z, tx, tz)) return { x: tx, z: tz };
  }
  return null;
}

/** Walk/run toward a heading; blocked moves just stop (people slide off walls like the player does). */
function moveTo(p: Person, dirX: number, dirZ: number, speed: number, dt: number) {
  const nx = p.x + dirX * speed * dt, nz = p.z + dirZ * speed * dt;
  const ok = p.cop ? (x: number, z: number) => canStand(x, z) : streetStand;
  if (ok(nx, nz)) { p.x = nx; p.z = nz; return true; }
  if (ok(nx, p.z)) { p.x = nx; return true; }
  if (ok(p.x, nz)) { p.z = nz; return true; }
  return false;
}

/** Population follows the player: anyone left far behind reappears on a street near them (out of sight). */
function respawnNear(p: Person) {
  const d = districtAt(player.pos.x, player.pos.z, 250);
  if (!d) return; // open countryside: nobody to place
  for (let i = 0; i < 25; i++) {
    const a = Math.random() * Math.PI * 2, r = 35 + Math.random() * 70;
    const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
    if (!districtAt(x, z)) continue;
    if (!streetStand(x, z)) continue;
    Object.assign(p, { x, z, y: 0, vx: 0, vz: 0, vy: 0, fall: 0, tumble: 0, hp: 100, target: null, home: { x: d.ox, z: d.oz }, bled: false, wound: 0, hitT: 99 });
    setState(p, "roam");
    return;
  }
}

// ---------------------------------------------------------------- police officer on foot
/** Shots at the player (cops, armed rivals): misses fly past, hits hurt (the car soaks them while driving). */
export const enemyFire = { shoot: (_fromX: number, _fromY: number, _fromZ: number, _accuracy: number, _dmg: number) => undefined as void };

function stepCop(p: Person, dt: number, pdx: number, pdz: number, pd: number) {
  const stars = useWanted.getState().stars;
  const g = useGame.getState();
  const car = drivenCar();
  p.yaw = lerpAngle(p.yaw, Math.atan2(pdx, pdz), 1 - Math.exp(-dt * 9));
  const sees = pd < 60 && lineClear(p.x, 1.5, p.z, player.pos.x, 1.3, player.pos.z);
  const armed = stars >= 2 || (stars >= 1 && (!!car || pd > 16));
  if (!stars || fighter.ko) { p.aiming = Math.max(0, p.aiming - dt * 3); p.speed = THREE.MathUtils.lerp(p.speed, 0, 1 - Math.exp(-dt * 6)); return; }
  if (armed) {
    // Keep a firing distance: close in when far or blind, back off when too close, sidestep while shooting.
    const want = !sees ? 0 : pd > 22 ? 1 : pd < 7 ? -1 : 0;
    p.aiming = Math.min(1, p.aiming + dt * (sees ? 4 : -2));
    const speed = want === 1 ? (pd > 40 ? 5.2 : 3.6) : want === -1 ? 2 : 1.1;
    p.speed = THREE.MathUtils.lerp(p.speed, want === 0 && !sees ? 0 : speed, 1 - Math.exp(-dt * 6));
    const fx = (pdx / (pd || 1)) * want, fz = (pdz / (pd || 1)) * want;
    const sx = (-pdz / (pd || 1)) * p.strafe * (want === 0 ? 1 : 0.4), sz = (pdx / (pd || 1)) * p.strafe * (want === 0 ? 1 : 0.4);
    if (!sees) { if (!moveTo(p, pdx / (pd || 1), pdz / (pd || 1), 4.2, dt)) p.strafe *= -1; }
    else if (!moveTo(p, fx + sx, fz + sz, p.speed, dt)) p.strafe *= -1;
    if (Math.random() < dt * 0.25) p.strafe *= -1;
    p.shootCd -= dt;
    if (sees && p.aiming > 0.9 && p.shootCd <= 0 && pd < 55) {
      p.shootCd = 0.55 + Math.random() * 0.7 - stars * 0.06;
      p.flash = 0.06;
      const moving = car ? Math.min(Math.abs(car.speed) / 25, 1) : Math.min(player.speed / 6, 1);
      const accuracy = THREE.MathUtils.clamp(0.75 - pd / 90 - moving * 0.35 + stars * 0.04, 0.08, 0.85);
      enemyFire.shoot(p.x, 1.45, p.z, accuracy, 7 + stars * 1.5);
      if (Math.random() < 0.08) bark(SHOUT_COP, 0.8);
    }
  } else {
    // One star: run you down and cuff you (police.ts counts an officer within reach as an arrest).
    p.aiming = Math.max(0, p.aiming - dt * 3);
    const want = pd > 1.1 ? (pd > 5 ? 5.4 : 2.4) : 0;
    p.speed = THREE.MathUtils.lerp(p.speed, want, 1 - Math.exp(-dt * 8));
    if (p.speed > 0.05 && pd > 0.9) moveTo(p, pdx / pd, pdz / pd, p.speed, dt);
    if (p.attackT > 0) {
      const before = p.attackT; p.attackT -= dt;
      if (before > 0.22 && p.attackT <= 0.22 && pd < 1.3 && !g.driving) damagePlayer(6, p.x, p.z, "melee");
    } else if (pd < 1.2 && p.attackCd <= 0 && fighter.sinceHurt < 6) {
      // Only throws punches back if you've been fighting.
      p.attackT = 0.42; p.attackCd = 1.1 + Math.random() * 0.6; p.punchSide = p.punchSide === 1 ? -1 : 1;
      playSound("whoosh");
    }
    if (pd < 9 && Math.random() < dt * 0.3) bark(SHOUT_COP, 0.85);
  }
}

// ---------------------------------------------------------------- per-frame update
export function stepPerson(p: Person, dt: number): void {
  p.t += dt; p.life += dt;
  p.bumpCd = Math.max(0, p.bumpCd - dt);
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.flash = Math.max(0, p.flash - dt);
  p.hitT += dt;
  // Bleeding: drips and a trail of spots behind them while they run, slowly clotting.
  if (p.wound > 0 && p.state !== "dead") {
    p.dripT -= dt;
    if (p.dripT <= 0) {
      p.dripT = 0.35 + Math.random() * 0.3;
      emitFx({ kind: "blood", at: { x: p.x, y: p.hitPart === "leg" ? 0.6 : 1.0, z: p.z }, dir: { x: 0, y: -1, z: 0 }, amount: 1 });
      if (Math.random() < 0.5) emitFx({ kind: "splat", x: p.x + (Math.random() - 0.5) * 0.3, z: p.z + (Math.random() - 0.5) * 0.3, size: 0.18 + p.wound * 0.25 });
    }
    p.wound = Math.max(0, p.wound - dt * 0.012);
  }
  const g = useGame.getState();
  const car = drivenCar();
  const px = player.pos.x - p.x, pz = player.pos.z - p.z;
  const pd = Math.hypot(px, pz);
  const onFoot = g.explore && !g.driving && !fighter.ko;

  if (pd > 320 && !p.rival && !p.anchored && !p.cop && p.state !== "fight") respawnNear(p);
  // Hard guarantee: the office is the player's space. Anyone who ends up inside is put back on the street.
  if (Math.abs(p.x) < 4.2 && Math.abs(p.z) < 4.2 && !streetStand(p.x, p.z)) {
    const out = openSpot(p.home.x, p.home.z, streetStand, 0.4);
    p.x = out.x; p.z = out.z; p.vx = 0; p.vz = 0; p.target = null;
    if (p.state === "fight" && !p.rival) setState(p, "roam");
  }

  // Shove / knock-back velocity decays with friction.
  if (p.state !== "air" && p.y <= 0) {
    if (Math.abs(p.vx) + Math.abs(p.vz) > 0.01) {
      moveTo(p, p.vx, p.vz, 1, dt);
      const k = Math.exp(-dt * 6);
      p.vx *= k; p.vz *= k;
    }
  }

  switch (p.state) {
    case "dead": {
      // Falls where shot, bleeds out, and is quietly replaced once out of sight.
      // Momentum from the hit carries them (a stagger step, or thrown back), friction stops them.
      if (p.y > 0 || p.vy > 0) { p.vy -= 18 * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y <= 0) p.vy = 0; }
      if (Math.hypot(p.vx, p.vz) > 0.05) {
        moveTo(p, p.vx, p.vz, 1, dt);
        const f = Math.exp(-dt * (p.death === "fold" ? 2.2 : 4));
        p.vx *= f; p.vz *= f;
      }
      // How far over they are (0 standing … 1 lying), on the style's timeline (the pose does the rest).
      p.fall = deathFall(p.death, p.t);
      if (!p.bled && p.fall >= 1 && p.y <= 0) { p.bled = true; emitFx({ kind: "pool", x: p.x, z: p.z, size: 1 + Math.random() * 0.6 }); playSound("thud"); }
      if (p.t > 30 && pd > 60 && !p.cop && !p.rival && !p.anchored) respawnNear(p);
      if (p.t > 30 && pd > 60 && p.anchored) { Object.assign(p, { hp: 100, fall: 0, bled: false, wound: 0, hitT: 99, x: p.home.x, z: p.home.z }); setState(p, "roam"); }
      break;
    }
    case "cop":
      stepCop(p, dt, px, pz, pd);
      break;
    case "air": {
      p.vy -= 18 * dt;
      p.y += p.vy * dt;
      moveTo(p, p.vx, p.vz, 1, dt);
      p.tumble += dt * 7;
      p.fall = Math.min(1, p.fall + dt * 4);
      if (p.y <= 0 && p.vy < 0) {
        p.y = 0; p.vy = 0; p.tumble = 0;
        p.vx *= 0.3; p.vz *= 0.3;
        playSound("thud");
        setState(p, "down");
      }
      break;
    }
    case "down":
      p.fall = Math.min(1, p.fall + dt * 5);
      if (p.t > (p.hp <= 0 ? 5.5 : 2.5)) setState(p, "getup");
      break;
    case "getup":
      p.fall = Math.max(0, p.fall - dt * 1.3);
      if (p.fall <= 0) {
        p.hp = Math.max(p.hp, 40);
        setState(p, p.cop ? "cop" : p.rival ? "fight" : "flee");
        if (!p.rival && !p.cop) bark(SHOUT_FLEE, 1.1);
      }
      break;
    case "stagger":
      if (p.t > 0.4) setState(p, p.punchSide === 1 ? "fight" : "flee");
      break;
    case "flee": {
      // Run directly away from the player (or the car), then calm down.
      let ax = -px, az = -pz;
      if (car && Math.hypot(car.x - p.x, car.z - p.z) < 25) { ax = p.x - car.x; az = p.z - car.z; }
      const l = Math.hypot(ax, az) || 1;
      p.yaw = lerpAngle(p.yaw, Math.atan2(ax / l, az / l), 1 - Math.exp(-dt * 8));
      p.speed = THREE.MathUtils.lerp(p.speed, 5.2, 1 - Math.exp(-dt * 5));
      if (!moveTo(p, Math.sin(p.yaw), Math.cos(p.yaw), p.speed, dt)) p.yaw += 1.4;
      if (p.t > 9 && pd > 30) { setState(p, "roam"); p.target = null; }
      break;
    }
    case "fight": {
      // Square up: close the distance, keep a guard, throw punches on a cooldown.
      if (!onFoot) { if (p.t > 4 && !p.rival) setState(p, "roam"); p.speed = 0; break; }
      p.yaw = lerpAngle(p.yaw, Math.atan2(px, pz), 1 - Math.exp(-dt * 10));
      const want = pd > 1.0 ? (pd > 4 ? 3.8 : 2.2) : 0;
      p.speed = THREE.MathUtils.lerp(p.speed, want, 1 - Math.exp(-dt * 8));
      if (p.speed > 0.05 && pd > 0.85) moveTo(p, px / pd, pz / pd, p.speed, dt);
      if (p.attackT > 0) {
        const before = p.attackT;
        p.attackT -= dt;
        // The blow lands at the end of the wind-up if the player is still in reach.
        if (before > 0.22 && p.attackT <= 0.22 && pd < 1.25) damagePlayer(p.rival ? 11 : 8, p.x, p.z, "melee");
      } else if (pd < 1.2 && p.attackCd <= 0) {
        p.attackT = 0.42; p.attackCd = 0.9 + Math.random() * 0.7; p.punchSide = p.punchSide === 1 ? -1 : 1;
        playSound("whoosh");
      }
      if (pd > 40 && !p.rival) setState(p, "roam");
      break;
    }
    case "wave":
    case "roam": {
      if (!p.target) {
        p.wait -= dt;
        if (p.wait <= 0) { p.target = pickTarget(p); p.wait = 1 + Math.random() * 4; }
      }
      let want = 0, waiting = false;
      if (p.target) {
        const dx = p.target.x - p.x, dz = p.target.z - p.z, dist = Math.hypot(dx, dz);
        if (dist < 0.3) p.target = null;
        else {
          const fx = dx / dist, fz = dz / dist;
          const pAhead = px * fx + pz * fz, pSide = Math.abs(-px * fz + pz * fx);
          waiting = onFoot && pAhead > 0 && pAhead < 1.3 && pSide < 0.7;
          if (!waiting) { want = 1.25; p.yaw = lerpAngle(p.yaw, Math.atan2(fx, fz), 1 - Math.exp(-dt * 6)); }
          else p.yaw = lerpAngle(p.yaw, Math.atan2(px, pz), 1 - Math.exp(-dt * 6));
        }
      }
      // Moving cars nearby: step away (and a horn in their face makes them jump).
      for (const c of cars.values()) {
        if (c.parked || Math.abs(c.speed) < 2) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        const honk = car === c && keys.has("h") && d < 18;
        if (d < 5 || honk) {
          const ax = p.x - c.x, az = p.z - c.z, l = Math.hypot(ax, az) || 1;
          p.vx += (ax / l) * (honk ? 3 : 1.5) * dt * 4; p.vz += (az / l) * (honk ? 3 : 1.5) * dt * 4;
          if (honk && p.bumpCd <= 0) { p.bumpCd = 3; bark(SHOUT_CAR, 1.1); setState(p, "flee"); }
          p.target = null;
        }
      }
      p.speed = THREE.MathUtils.lerp(p.speed, want, 1 - Math.exp(-dt * 5));
      if (p.speed > 0.05 && !moveTo(p, Math.sin(p.yaw), Math.cos(p.yaw), p.speed, dt)) p.target = null;
      p.state = waiting ? "wave" : "roam";
      break;
    }
  }

  // Barging into someone on foot shoves them (running hard can start a fight).
  if (onFoot && !p.cop && p.state !== "air" && p.state !== "down" && p.state !== "getup" && p.state !== "dead" && pd < 0.62 && player.speed > 0.8 && p.bumpCd <= 0) {
    p.bumpCd = 1.6;
    const l = pd || 1;
    const force = player.speed > 3 ? 3.2 : 1.6;
    p.vx -= (px / l) * force; p.vz -= (pz / l) * force;
    if (p.state === "roam" || p.state === "wave") {
      setState(p, "stagger");
      p.punchSide = player.speed > 3 && Math.random() < 0.3 ? 1 : -1;
      if (p.punchSide === -1) p.state = "roam";
      bark(SHOUT_BUMP, 0.95 + Math.random() * 0.3);
    }
  }

  // Upright people block the player and traffic; lying ones don't.
  if (p.fall < 0.3 && p.state !== "air" && p.state !== "dead") crowd.set(p.id, { x: p.x, z: p.z });
  else crowd.delete(p.id);
}

/** Player side of the fight: the punch connects with whoever is in front, within reach. */
export function stepFighter(dt: number): void {
  playerHit.t += dt;
  if (fighter.attackT > 0) {
    const before = fighter.attackT;
    fighter.attackT -= dt;
    if (!fighter.struck && before > PUNCH_TIME - 0.14 && fighter.attackT <= PUNCH_TIME - 0.14) {
      fighter.struck = true;
      const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
      let best: Person | null = null, bd = 1.35;
      for (const p of people.values()) {
        if (p.state === "air" || p.state === "down" || p.state === "getup" || p.state === "dead") continue;
        const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.45) { best = p; bd = d; }
      }
      if (best) {
        playSound("punch");
        hitPerson(best, (26 + Math.random() * 10) * (rageOn() ? 3 : 1), fx, fz, rageOn() ? 4.5 : 2.4);
        chargeAbility(0.04);
        // Starting fights in the street is a crime (a mission rival is fair game).
        if (best.cop) commitCrime("assault-cop");
        else if (!best.rival) commitCrime(best.hp <= 0 ? "knockout" : "assault");
      }
    }
  }
  fighter.hurtT = Math.max(0, fighter.hurtT - dt);
  fighter.sinceHurt += dt;
  // GTA V: health only regenerates on its own up to half; health packs do the rest.
  if (!fighter.ko && fighter.sinceHurt > 5 && fighter.hp < MAX_HP * 0.5) fighter.hp = Math.min(MAX_HP * 0.5, fighter.hp + dt * 6);
  screenFx.hurt = Math.max(0, screenFx.hurt - dt * 1.6);
  // Auto-face the nearest opponent while trading blows so punches land without precise aiming.
  if (fighter.attackT > PUNCH_TIME - 0.1) {
    for (const p of people.values()) {
      if (p.state !== "fight" && p.state !== "stagger" && p.state !== "cop") continue;
      const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
      if (Math.hypot(dx, dz) < 2.2) { player.yaw = lerpAngle(player.yaw, Math.atan2(dx, dz), 0.6); break; }
    }
  }
}

// Dev-only handle for scripted browser checks.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__people = { people, fighter, playerPunch, damagePlayer, shootPerson };
