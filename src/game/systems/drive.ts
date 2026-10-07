// Player driving. Walk up to a car and press E (or click it) to get in; W/S throttle & brake, A/D steer,
// Space handbrake (drift), Shift nitro, H horn, E to get out. An arcade "racing" model: real top speeds (up to the
// 300 km/h cap), speed-sensitive steering, lateral grip with handbrake drifts, slower off-road, sub-stepped
// collisions against district buildings, roadside props, parked cars and traffic. Nothing here touches sales data.
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { playSound, setEngine, setHorn } from "../audio.ts";
import { canDrive, keys, parkedFootprints, player, setExitCarHook, stopPath, vehicleBlockers } from "./explore.ts";
import { RAMPS, districtAt, onRoad, rampAt, staticHit } from "../world/layout.ts";
import { nitroDrain, tuned } from "./garage.ts";
import { normalTime, slowMo, time } from "./time.ts";
import { emitStunt } from "./stunts.ts";
import { chargeAbility } from "./abilities.ts";
import { G, bodyOf, downforce, dragAcc, powerPerKg, rolling } from "./aero.ts";

export type CarSpec = {
  id: string; model: string; name: string; x: number; z: number; yaw: number; length: number; width: number;
  top: number; accel: number; // km/h, m/s²
};

export type CarState = CarSpec & {
  speed: number; // forward speed (m/s, negative = reversing)
  vx: number; vz: number; yawRate: number; steer: number; wheelSpin: number; parked: boolean;
  rpm: number; gear: number; nitro: number; slip: number; offroad: boolean; boosting: boolean;
  shake: number; // camera shake from the last impact (decays)
  // Vertical: ramps lift the car; off the top it flies (air) until it lands.
  y: number; vy: number; pitch: number; air: boolean; airT: number;
  ramp: { id: string; slope: number } | null; airFrom: { x: number; z: number; id: string } | null;
  // Damage (GTA): crashes and bullets wear it down; below 30% it smokes, at zero it burns and then explodes.
  hp: number; burnT: number; wreck: boolean; smokeT: number;
  // Physics read-outs: smoothed g-forces (body pitch / roll, HUD) and whether it's in another car's slipstream.
  gLong: number; gLat: number; drafting: boolean;
};

export const CAR_HP = 1000;

/** Drivable cars (parked around the island, spawned by missions, or taken from traffic). */
export const cars = new Map<string, CarState>();
const bump = () => useGame.getState().set({ carsVersion: useGame.getState().carsVersion + 1 });

function toState(spec: CarSpec): CarState {
  const s = tuned(spec); // Empire Customs upgrades
  return { ...s, hp: CAR_HP, burnT: 0, wreck: false, smokeT: 0, gLong: 0, gLat: 0, drafting: false, y: 0, vy: 0, pitch: 0, air: false, airT: 0, ramp: null, airFrom: null, speed: 0, vx: 0, vz: 0, yawRate: 0, steer: 0, wheelSpin: 0, parked: true, rpm: 900, gear: 1, nitro: 1, slip: 0, offroad: false, boosting: false, shake: 0 };
}

export function registerCars(specs: CarSpec[]): void {
  for (const s of specs) {
    if (!cars.has(s.id)) cars.set(s.id, toState(s));
    park(cars.get(s.id)!);
  }
  bump();
}

export function spawnCar(spec: CarSpec): CarState {
  removeCar(spec.id);
  const c = toState(spec);
  cars.set(spec.id, c);
  park(c);
  bump();
  return c;
}

export function removeCar(id: string): void {
  if (!cars.has(id)) return;
  if (useGame.getState().driving === id) exitCar();
  cars.delete(id);
  parkedFootprints.delete(id);
  bump();
}

/** Parked cars are solid for people on foot and for other cars. */
function park(c: CarState) {
  parkedFootprints.set(c.id, { x: c.x, z: c.z, yaw: c.yaw, hl: c.length / 2, hw: c.width / 2 });
}

/** Brakes: deceleration in g per unit of tyre grip (μ), growing with downforce load — ~1.9 g for a road car at
 *  town speeds, up to ~4 g for a supercar braking from 300 km/h (arcade-generous, but physically shaped). */
const BRAKE_G = 1.9;
/** Typical traffic car mass (kg) for crash momentum. */
const TRAFFIC_MASS = 1450;

/** Slipstream: another car 3–25 m straight ahead, heading the same way, within a lane's width. */
function draftingBehind(c: CarState): boolean {
  if (Math.abs(c.speed) < 15) return false;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  for (const b of trafficBoxes.values()) {
    const dx = b.x - c.x, dz = b.z - c.z;
    const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
    if (ahead > 3 && ahead < 25 && side < 1.6 && Math.cos(b.yaw - c.yaw) > 0.85) return true;
  }
  return false;
}
const REVERSE_TOP = 14;
const WHEELBASE = 2.6;
const MAX_STEER = 0.6;
const GEARS = 6;

/** Moving traffic, published every frame by the traffic system so the player's car can hit it. */
export type TrafficBox = { x: number; z: number; yaw: number; hl: number; hw: number; hit: (impulse: number, dirX: number, dirZ: number) => void };
export const trafficBoxes = new Map<string, TrafficBox>();
vehicleBlockers.boxes = trafficBoxes; // people on foot can't walk into moving cars or police cruisers

/** People the car can hit, published by the people system: returns true if someone was struck at (x, z). */
export const carStrikes = { test: (_x: number, _z: number, _vx: number, _vz: number, _r: number) => false };

/** Motorbikes lean into corners (radians about the forward axis; + yawRate = turning left → lean left). */
export const bikeLean = (c: CarState) => THREE.MathUtils.clamp(-c.yawRate * Math.min(Math.abs(c.speed), 30) * 0.035, -0.6, 0.6);

export function drivenCar(): CarState | null {
  const id = useGame.getState().driving;
  return id ? cars.get(id) ?? null : null;
}

export function enterCar(id: string): void {
  const g = useGame.getState();
  const car = cars.get(id);
  if (!car || !g.explore || g.driving || car.wreck) return;
  stopPath();
  car.parked = false;
  parkedFootprints.delete(car.id);
  player.sitting = null;
  playSound("door");
  g.set({ driving: id, prompt: null, emote: null });
}

setExitCarHook(() => exitCar());

// Dev-only handle for scripted browser checks (hold keys, enter cars).
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__drive = { keys, cars, enterCar, exitCar, drivenCar, trafficBoxes, staticHit, canDrive, RAMPS, rampAt, damageCar: (id: string, d: number) => damageCar(id, d, true) };

export function exitCar(): void {
  const g = useGame.getState();
  const car = drivenCar();
  if (!car) return;
  car.speed = 0; car.vx = 0; car.vz = 0; car.yawRate = 0;
  car.y = 0; car.vy = 0; car.pitch = 0; car.air = false; car.ramp = null;
  normalTime();
  car.parked = true;
  park(car);
  setEngine(null);
  setHorn(false);
  playSound("door");
  // Step out on the driver's side, falling back to the other side or behind if blocked.
  const left = { x: Math.cos(car.yaw), z: -Math.sin(car.yaw) };
  const fwd = { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
  const spots = [1, -1].map((s) => ({ x: car.x + left.x * s * (car.width / 2 + 0.6), z: car.z + left.z * s * (car.width / 2 + 0.6) }))
    .concat([{ x: car.x - fwd.x * (car.length / 2 + 0.8), z: car.z - fwd.z * (car.length / 2 + 0.8) }]);
  const spot = spots.find((p) => canDrive(p.x, p.z, 0.3) && !staticHit(p.x, p.z, 0.3)) ?? spots[0];
  player.pos.set(spot.x, 0, spot.z);
  player.yaw = car.yaw;
  player.snap = true;
  g.set({ driving: null });
}

/** Footprint sample points: corners, plus mid-points along each side so thin posts can't slip between corners. */
const samples = (c: CarState, x: number, z: number, yaw: number) => {
  const s = Math.sin(yaw), co = Math.cos(yaw);
  const hl = c.length / 2 - 0.1, hw = c.width / 2 - 0.08;
  const pts: [number, number][] = [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw], [hl * 0.5, hw], [hl * 0.5, -hw], [-hl * 0.5, hw], [-hl * 0.5, -hw]];
  return pts.map(([f, l]) => ({ x: x + s * f + co * l, z: z + co * f - s * l }));
};

type Hit = { kind: "wall" } | { kind: "traffic"; box: TrafficBox } | null;

const wallAt = (c: CarState, x: number, z: number) => !canDrive(x, z, 0, c.id) || !!staticHit(x, z, 0.05);
/** How many footprint samples are inside walls/props (a car already wedged may move if this doesn't grow). */
function overlap(c: CarState, x: number, z: number, yaw: number): number {
  let n = 0;
  for (const p of samples(c, x, z, yaw)) if (wallAt(c, p.x, p.z)) n++;
  return n;
}

function collide(c: CarState, x: number, z: number, yaw: number): Hit {
  const now = overlap(c, c.x, c.z, c.yaw);
  if (now > 0) {
    // Wedged (spawned against a wall, or shoved into one): allow any move that doesn't dig in deeper.
    if (overlap(c, x, z, yaw) > now) return { kind: "wall" };
  }
  for (const p of samples(c, x, z, yaw)) {
    if (now === 0 && wallAt(c, p.x, p.z)) return { kind: "wall" };
    for (const b of trafficBoxes.values()) {
      const dx = p.x - b.x, dz = p.z - b.z;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      const s = Math.sin(b.yaw), co = Math.cos(b.yaw);
      if (Math.abs(dx * s + dz * co) < b.hl && Math.abs(dx * co - dz * s) < b.hw) return { kind: "traffic", box: b };
    }
  }
  return null;
}

function impact(c: CarState, lost: number) {
  if (lost > 8) damageCar(c.id, (lost - 8) * 9, false);
  if (lost > 22) playSound("crash-big");
  else if (lost > 5) playSound("crash");
  c.shake = Math.min(1, c.shake + lost / 25);
}

// ---------------------------------------------------------------- damage, fire, explosions
/** Set by weapons.ts (explosions live there; importing it here would make a module cycle). */
export const carEvents = { explode: (_x: number, _z: number, _byPlayer: boolean) => undefined as void, playerInBlast: () => undefined as void, smoke: (_x: number, _y: number, _z: number, _dark: boolean) => undefined as void };
const blamePlayer = new Set<string>();

export function damageCar(id: string, dmg: number, byPlayer: boolean): void {
  const c = cars.get(id);
  if (!c || c.wreck) return;
  if (byPlayer) blamePlayer.add(id);
  c.hp = Math.max(-1, c.hp - dmg);
  if (c.hp <= 0 && c.burnT <= 0) c.burnT = 0.01; // catches fire: a few seconds to get out
}

function blowUp(c: CarState) {
  c.wreck = true; c.hp = -1; c.speed = 0; c.vx = 0; c.vz = 0;
  const driving = useGame.getState().driving === c.id;
  if (driving) { exitCar(); carEvents.playerInBlast(); }
  carEvents.explode(c.x, c.z, blamePlayer.has(c.id));
  c.parked = true; park(c);
  bump();
  // The burnt-out shell is cleared away after a while.
  setTimeout(() => { if (cars.get(c.id)?.wreck && useGame.getState().driving !== c.id) removeCar(c.id); }, 45000);
}

/** Smoke from damaged cars, flames, and the explosion when a burning one goes up. */
export function stepCarDamage(dt: number): void {
  for (const c of cars.values()) {
    if (c.hp > CAR_HP * 0.3 && !c.wreck) continue;
    c.smokeT -= dt;
    if (c.smokeT <= 0) {
      c.smokeT = c.wreck ? 0.35 : c.burnT > 0 ? 0.06 : 0.18;
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      carEvents.smoke(c.x + s * c.length * 0.35, c.y + 1.1, c.z + co * c.length * 0.35, c.burnT > 0 || c.wreck);
    }
    if (c.burnT > 0 && !c.wreck) { c.burnT += dt; if (c.burnT > 4.5) blowUp(c); }
  }
}

let hornOn = false;

const GRAVITY = 12.5; // real g plus a little: jumps hang like GTA's, then land with weight

/** On the ground: ride ramp surfaces; leaving the top of one at speed launches the car. */
function followGround(c: CarState, vf: number) {
  const r = rampAt(c.x, c.z);
  if (r.ramp) {
    c.y = r.h;
    c.pitch = THREE.MathUtils.lerp(c.pitch, r.slope, 0.5);
    c.ramp = { id: r.ramp.id, slope: r.slope };
    return;
  }
  if (c.ramp && vf > 8) {
    // Off the lip: launch along the slope.
    c.air = true;
    c.vy = vf * Math.sin(c.ramp.slope) * 1.1;
    c.airT = 0;
    c.airFrom = { x: c.x, z: c.z, id: c.ramp.id };
    if (vf > 22) slowMo(0.35, 0.35); // the stunt-jump moment
  } else {
    c.y = 0;
    c.pitch = THREE.MathUtils.lerp(c.pitch, 0, 0.3);
  }
  c.ramp = null;
}

/** Airborne: ballistic flight, nose following the arc; tall walls still stop the car. */
function stepAir(c: CarState, h: number) {
  c.airT += h;
  c.vy -= GRAVITY * h;
  c.y += c.vy * h;
  // Air drag keeps working in flight (it's the same air): horizontal speed bleeds off with v².
  const vh = Math.hypot(c.vx, c.vz);
  if (vh > 0.1) { const k = Math.max(0, 1 - (dragAcc(bodyOf(c.model), vh) * h) / vh); c.vx *= k; c.vz *= k; }
  c.pitch = THREE.MathUtils.lerp(c.pitch, THREE.MathUtils.clamp(c.vy * 0.025, -0.4, 0.4), 1 - Math.exp(-h * 3));
  const nx = c.x + c.vx * h, nz = c.z + c.vz * h;
  if (c.y < 1.6 && collide(c, nx, nz, c.yaw)) { impact(c, Math.hypot(c.vx, c.vz)); c.vx *= -0.2; c.vz *= -0.2; }
  else { c.x = nx; c.z = nz; }
  const ground = rampAt(c.x, c.z).h;
  if (c.y <= ground && c.vy < 0) {
    c.air = false;
    c.y = ground;
    c.pitch = 0;
    impact(c, Math.abs(c.vy) * 1.1);
    c.vx *= 0.92; c.vz *= 0.92;
    normalTime();
    if (c.airFrom && c.airT > 0.6) emitStunt({ rampId: c.airFrom.id, distance: Math.hypot(c.x - c.airFrom.x, c.z - c.airFrom.z), airtime: c.airT });
    c.airFrom = null;
  }
}

export function stepDrive(dtRaw: number): void {
  const car = drivenCar();
  if (!car) return;
  const dt = Math.min(dtRaw, 0.05) * time.self; // slow motion during a stunt jump
  const up = keys.has("w") || keys.has("arrowup");
  const down_ = keys.has("s") || keys.has("arrowdown");
  const steerIn = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
  const hand = keys.has(" ");
  const wantBoost = keys.has("shift") && up && car.nitro > 0.02;
  const h = keys.has("h");
  if (h !== hornOn) { hornOn = h; setHorn(h); }

  car.offroad = !onRoad(car.x, car.z) && !districtAt(car.x, car.z);
  const top = (car.top / 3.6) * (car.offroad ? 0.5 : 1);
  if (wantBoost && !car.boosting) playSound("nitro");
  car.boosting = wantBoost;
  car.nitro = THREE.MathUtils.clamp(car.nitro + (wantBoost ? -nitroDrain(car.model) : 0.05) * dt, 0, 1);

  // Steering eases in and loses lock with speed (stays controllable at 300 km/h).
  const lock = MAX_STEER / (1 + Math.abs(car.speed) / 16);
  car.steer = THREE.MathUtils.lerp(car.steer, steerIn * lock, 1 - Math.exp(-dt * 7));

  // Aerodynamics (aero.ts): drag ∝ v², downforce ∝ v², engine power fixed → thrust ∝ 1/v. Slipstream behind traffic.
  const body = bodyOf(car.model);
  const power = powerPerKg(car.model, car.top) * (wantBoost ? 1.6 : 1); // W/kg (nitro = extra power)
  car.drafting = draftingBehind(car);

  const steps = THREE.MathUtils.clamp(Math.ceil((Math.hypot(car.vx, car.vz) * dt) / 0.35), 1, 10);
  const hstep = dt / steps;
  const vfBefore = car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
  for (let i = 0; i < steps; i++) {
    if (car.air) { stepAir(car, hstep); continue; }
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
    let vf = car.vx * fx + car.vz * fz;
    let vl = car.vx * rx + car.vz * rz;
    const v = Math.abs(vf);
    const down = downforce(body, v); // extra tyre load, fraction of weight
    const load = 1 + down;

    // Longitudinal: traction-limited launch, then power-limited (P / v); brakes scale with tyre load.
    if (up) {
      if (vf < -0.5) vf += BRAKE_G * G * body.mu * load * hstep;
      else {
        const traction = car.accel * Math.min(1.35, 1 + down * 0.5) * (wantBoost ? 1.4 : 1);
        vf += Math.min(traction, power / Math.max(v, 1)) * hstep;
      }
    } else if (down_) {
      if (vf > 0.5) vf = Math.max(0, vf - BRAKE_G * G * body.mu * Math.min(load, 2.2) * hstep);
      else vf = Math.max(-REVERSE_TOP, vf - 6 * hstep);
    }
    // Resistances: air (less in a slipstream), rolling, engine braking off-throttle, rough ground.
    const resist = dragAcc(body, v) * (car.drafting ? 0.55 : 1) + rolling() + (up ? 0 : 0.7) + (car.offroad ? 2.5 + v * 0.04 : 0);
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), resist * hstep);
    if (hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * hstep);
    if (vf > top) vf -= (vf - top) * 1.5 * hstep; // rev limiter at the car's (tuned) top speed
    vf = Math.min(vf, 300 / 3.6); // the hard cap

    // Lateral grip: tyres kill sideways motion (more grip with downforce); the handbrake lets the rear step out.
    const grip = (hand ? 1.4 : car.offroad ? 4.5 : 11) * Math.min(1.6, Math.sqrt(load));
    vl *= Math.exp(-grip * hstep);
    car.slip = Math.abs(vl) + (hand && Math.abs(vf) > 8 ? 4 : 0);

    // Yaw: kinematic bicycle model, limited by the lateral acceleration the tyres (and downforce) can hold.
    const aLat = (hand ? 34 : car.offroad ? 13 : 24) * body.mu * Math.min(1.7, load);
    let yawTarget = (vf / WHEELBASE) * Math.tan(car.steer);
    const maxYaw = aLat / Math.max(Math.abs(vf), 1);
    yawTarget = THREE.MathUtils.clamp(yawTarget, -maxYaw, maxYaw) * (hand ? 1.35 : 1);
    car.yawRate = THREE.MathUtils.lerp(car.yawRate, yawTarget, 1 - Math.exp(-hstep * 9));

    car.vx = fx * vf + rx * vl;
    car.vz = fz * vf + rz * vl;
    const nyaw = car.yaw + car.yawRate * hstep;
    const nx = car.x + car.vx * hstep, nz = car.z + car.vz * hstep;

    const hit = collide(car, nx, nz, nyaw);
    if (!hit) { car.x = nx; car.z = nz; car.yaw = nyaw; followGround(car, vf); }
    else if (hit.kind === "traffic") {
      // Car vs car: momentum is shared (a near-inelastic crash). A heavy car barely slows ramming a light one;
      // a bike loses almost everything hitting a van. The other car is shoved by what you lost.
      const v = Math.hypot(car.vx, car.vz);
      const keep = body.mass / (body.mass + TRAFFIC_MASS) * 0.9;
      car.vx *= keep; car.vz *= keep; car.yawRate *= 0.4;
      impact(car, v * (1 - keep));
      hit.box.hit(v * (1 - keep) * (body.mass / TRAFFIC_MASS), car.vx / (v || 1), car.vz / (v || 1));
      break;
    } else {
      const v = Math.hypot(car.vx, car.vz);
      // Slide along walls: keep whichever axis is still free.
      if (!collide(car, nx, car.z, car.yaw)) { impact(car, Math.abs(car.vz)); car.x = nx; car.vz *= -0.15; }
      else if (!collide(car, car.x, nz, car.yaw)) { impact(car, Math.abs(car.vx)); car.z = nz; car.vx *= -0.15; }
      else { impact(car, v); car.vx *= -0.22; car.vz *= -0.22; car.yawRate *= 0.3; }
      break;
    }
    // Pedestrians in the way get knocked down (the people system decides how).
    if (Math.abs(vf) > 1.5 && car.y < 1 && carStrikes.test(car.x + fx * car.length * 0.45, car.z + fz * car.length * 0.45, car.vx, car.vz, car.width / 2 + 0.2)) {
      car.vx *= 0.9; car.vz *= 0.9;
      car.shake = Math.min(1, car.shake + 0.25);
    }
  }
  car.speed = car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
  // G-forces (for the body's pitch / roll on its suspension and the HUD): longitudinal from the speed change,
  // lateral = v·ω (centripetal).
  if (dt > 0) {
    const gl = (car.speed - vfBefore) / dt / G, gt = (car.speed * car.yawRate) / G;
    const k = 1 - Math.exp(-dt * 6);
    car.gLong += (THREE.MathUtils.clamp(gl, -3, 3) - car.gLong) * k;
    car.gLat += (THREE.MathUtils.clamp(gt, -3, 3) - car.gLat) * k;
  }
  car.shake = Math.max(0, car.shake - dt * 2.5);
  if (car.slip > 6 && Math.abs(car.speed) > 15) chargeAbility(0.02 * dt); // drifting fills the special meter

  // Gearbox for the sound and the dial: six gears spread over the car's top speed.
  const ratio = Math.min(Math.abs(car.speed) / (car.top / 3.6), 1) * GEARS;
  const gear = car.speed < -0.5 ? 0 : Math.min(GEARS, Math.floor(ratio) + 1);
  const inGear = car.speed < -0.5 ? Math.abs(car.speed) / REVERSE_TOP : ratio - (gear - 1);
  const targetRpm = 900 + inGear * 6200 + (up && Math.abs(car.speed) < 2 ? 1800 : 0);
  const shifted = gear !== car.gear; // (was compared after assigning, so the shift drop never happened)
  car.gear = gear;
  car.rpm = THREE.MathUtils.lerp(car.rpm, targetRpm, 1 - Math.exp(-dt * (shifted ? 3 : 10)));
  setEngine({ rpm: car.rpm, throttle: up ? 1 : 0, speed: Math.abs(car.speed), slip: car.slip, boost: car.boosting });

  car.wheelSpin += (car.speed * dt) / 0.34;
  player.pos.set(car.x, 0, car.z); // NPCs, prompts, the radar and the camera follow the car
  player.yaw = car.yaw;
  player.speed = 0;
}

