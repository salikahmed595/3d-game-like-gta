// The user's vehicles: drivable cars (office lot, one at every district entrance, mission cars, cars taken from
// traffic), highway traffic that lives around the player wherever they are on the island, and street traffic in
// each loaded district. Traffic follows lanes, keeps its distance, yields to the player and people, and can be
// hit (it spins out and stops) or taken over: walk up to a slow car and press E. Nothing here touches game data.
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { canDrive, crowd, player, registerInteractables } from "../systems/explore.ts";
import { bikeLean, cars, drivenCar, enterCar, registerCars, removeCar, spawnCar, trafficBoxes } from "../systems/drive.ts";
import type { CarSpec, CarState } from "../systems/drive.ts";
import { playSound } from "../audio.ts";
import { time } from "../systems/time.ts";
import { useGarage } from "../systems/garage.ts";
import { commitCrime } from "../systems/police.ts";
import { DRACO_PATH } from "./CityMap.tsx";
import { PARKED, VEHICLES, carSpec, clearSpot, detectRoads, vehicleModel, vehicleUrl } from "./city.ts";
import type { MapDef, Road } from "./city.ts";
import { DISTRICTS, ROADS, roadLength, roadPoint } from "./layout.ts";
import type { RoadPath } from "./layout.ts";
import { Shadow } from "./Shadow.tsx";
import { gfx } from "../settings.ts";

function useCarModel(id: string) {
  const { scene } = useGLTF(vehicleUrl(id), DRACO_PATH);
  const flip = vehicleModel(id).flip;
  return useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
    const holder = new THREE.Group();
    if (flip) o.rotation.y = Math.PI; // a few source models face backwards
    holder.add(o);
    return holder;
  }, [scene, flip]);
}

// ---------------------------------------------------------------- drivable cars
/** Empire Customs respray: tint the car's main body material (the largest one that isn't glass/wheels/lights). */
function usePaint(model: THREE.Group, carModel: string) {
  const paint = useGarage((s) => s.tunes[carModel]?.paint ?? null);
  const body = useMemo(() => {
    // Idempotent (React may run this twice): the swapped-in material lives on the model itself.
    if (model.userData.paint) return model.userData.paint as { mat: THREE.MeshStandardMaterial; base: THREE.Color };
    const counts = new Map<THREE.Material, number>();
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      if (/glass|window|wheel|tire|tyre|rubber|chrome|light|optic|interior|engine|number|lack/i.test(m.material.name)) return;
      counts.set(m.material, (counts.get(m.material) ?? 0) + (m.geometry.getAttribute("position")?.count ?? 0));
    });
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as THREE.MeshStandardMaterial | undefined;
    if (!best) return null;
    // Own copy, so painting one car doesn't repaint every car sharing the model.
    const mine = best.clone();
    model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material === best) m.material = mine; });
    model.userData.paint = { mat: mine, base: mine.color.clone() };
    return model.userData.paint as { mat: THREE.MeshStandardMaterial; base: THREE.Color };
  }, [model]);
  useEffect(() => {
    if (!body) return;
    if (paint) body.mat.color.set(paint); else body.mat.color.copy(body.base);
  }, [body, paint]);
}

function DrivableCar({ id }: { id: string }) {
  const car = cars.get(id)!;
  const model = useCarModel(car.model);
  usePaint(model, car.model);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = useGame.getState().driving === id || Math.hypot(car.x - player.pos.x, car.z - player.pos.z) < 520;
    if (!g.visible) return;
    g.position.set(car.x, car.y, car.z);
    g.rotation.order = "YXZ";
    g.rotation.y = car.yaw;
    g.rotation.x = -car.pitch; // nose up on ramps and in the air
    // Body roll into corners sells the handling; motorbikes lean right over.
    // Weight transfer on the suspension: body rolls out of corners (lateral g), the nose dives under braking and
    // squats under hard acceleration (longitudinal g).
    const bike = vehicleModel(car.model).bike;
    const roll = bike ? bikeLean(car) : THREE.MathUtils.clamp(car.gLat * 0.045, -0.09, 0.09);
    model.rotation.z = THREE.MathUtils.lerp(model.rotation.z, roll, 0.15);
    model.rotation.x = THREE.MathUtils.lerp(model.rotation.x, bike ? 0 : THREE.MathUtils.clamp(-car.gLong * 0.03, -0.06, 0.07), 0.15);
    // Wrecked: burnt black.
    const paint = model.userData.paint as { mat: THREE.MeshStandardMaterial } | undefined;
    if (car.wreck && paint && !model.userData.burnt) { model.userData.burnt = true; paint.mat.color.set("#141414"); }
  });
  return (
    <group ref={ref}
      onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); if (useGame.getState().explore && !useGame.getState().driving) enterCar(id); }}
      onPointerOver={() => { if (!useGame.getState().driving) document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}>
      <primitive object={model} />
      <Shadow size={car.width + 0.6} length={car.length + 0.8} />
    </group>
  );
}

/** Where drivable cars wait: the office lot, plus one at the entrance of every district. */
function parkingSpots(): CarSpec[] {
  const out: CarSpec[] = PARKED.map((p, i) => {
    const m = vehicleModel(p.model);
    // The whole footprint must be clear (a corner inside a wall would wedge the car).
    const fits = (x: number, z: number) => {
      const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      for (const f of [-1, -0.5, 0, 0.5, 1]) for (const l of [-1, 0, 1]) {
        const ff = f * (m.length / 2 + 0.3), ll = l * (m.width / 2 + 0.3);
        if (!canDrive(x + s * ff + c * ll, z + c * ff - s * ll, 0)) return false;
      }
      return true;
    };
    const spot = clearSpot(p.x, p.z, 0.5, fits);
    return carSpec(`car-${i}`, p.model, spot.x, spot.z, p.yaw);
  });
  const lineup = ["pack_8", "future", "concept", "vintage", "pack_7", "classic", "pack_5"];
  DISTRICTS.forEach((d, i) => {
    const road = ROADS.find((r) => r.id === `to-${d.key}`);
    if (!road) return;
    const [ax, az] = road.pts[0], [bx, bz] = road.pts[1];
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    // On the shoulder a little way out of the district, pointing toward the highway.
    const x = ax + dx * 14 - dz * 7.5, z = az + dz * 14 + dx * 7.5;
    out.push(carSpec(`park-${d.key}`, lineup[i % lineup.length], x, z, Math.atan2(dx, dz)));
  });
  return out;
}

const MAX_EXTRA_CARS = 8;

function nearestParked(): CarState | null {
  if (useGame.getState().driving) return null;
  let best: CarState | null = null, bd = Infinity;
  for (const c of cars.values()) {
    if (!c.parked) continue;
    const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z) - c.length / 2;
    if (d < 1.8 && d < bd) { best = c; bd = d; }
  }
  return best;
}

export function DrivableCars() {
  const version = useGame((s) => s.carsVersion);
  useEffect(() => { registerCars(parkingSpots()); }, []);
  // Cars taken from traffic pile up; quietly tidy the farthest abandoned ones.
  useEffect(() => {
    const extra = [...cars.values()].filter((c) => c.id.startsWith("jack-") && c.id !== useGame.getState().driving);
    if (extra.length <= MAX_EXTRA_CARS) return;
    extra.sort((a, b) => Math.hypot(b.x - player.pos.x, b.z - player.pos.z) - Math.hypot(a.x - player.pos.x, a.z - player.pos.z));
    extra.slice(0, extra.length - MAX_EXTRA_CARS).forEach((c) => removeCar(c.id));
  }, [version]);
  const ids = useMemo(() => [...cars.keys()], [version]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Drive <name>" prompt when standing next to any parked car.
  useEffect(() => registerInteractables([{
    id: "drive-nearest", radius: 6,
    label: () => { const c = nearestParked(); return c ? `Drive the ${c.name}` : null; },
    at: () => { const c = nearestParked(); return c ? { x: c.x, z: c.z } : { x: 1e9, z: 1e9 }; },
    run: () => { const c = nearestParked(); if (c) enterCar(c.id); },
  }]), []);
  return <group>{ids.map((id) => <Safe key={id}><DrivableCar id={id} /></Safe>)}</group>;
}

// ---------------------------------------------------------------- shared traffic bits
type Jackable = { x: number; z: number; speed: number; name: string; take: () => void };
const jackable = new Map<string, Jackable>();

function nearestJackable(): Jackable | null {
  if (useGame.getState().driving) return null;
  let best: Jackable | null = null, bd = 3.6;
  for (const j of jackable.values()) {
    const d = Math.hypot(j.x - player.pos.x, j.z - player.pos.z);
    if (d < bd && j.speed < 7) { best = j; bd = d; }
  }
  return best;
}

function useCarjackPrompt() {
  useEffect(() => registerInteractables([{
    id: "carjack", radius: 6,
    label: () => { const j = nearestJackable(); return j ? `Take the ${j.name}` : null; },
    at: () => { const j = nearestJackable(); return j ? { x: j.x, z: j.z } : { x: 1e9, z: 1e9 }; },
    run: () => nearestJackable()?.take(),
  }]), []);
}

let jackCount = 0;
function takeOver(model: string, x: number, z: number, yaw: number) {
  const spec = carSpec(`jack-${++jackCount}`, model, x, z, yaw);
  spawnCar(spec);
  playSound("door");
  enterCar(spec.id);
  commitCrime("carjack");
}

const trafficPool = () => VEHICLES.filter((v) => v.traffic);

// ---------------------------------------------------------------- highway traffic (follows the player)
type HCar = {
  key: string; model: string; len: number; width: number;
  road: RoadPath; lane: number; dir: 1 | -1; s: number; speed: number; want: number;
  stun: number; offX: number; offZ: number; spin: number;
  x: number; z: number; yaw: number;
};
const HIGHWAY_CARS = 18;

const laneOffset = (road: RoadPath, lane: number) => (road.width / 2 / road.lanes) * (lane + 0.5);

function place(c: HCar) {
  const p = roadPoint(c.road, c.s);
  const dx = p.dx * c.dir, dz = p.dz * c.dir;
  const off = laneOffset(c.road, c.lane);
  c.x = p.x - dz * off + c.offX;
  c.z = p.z + dx * off + c.offZ;
  c.yaw = Math.atan2(dx, dz) + c.spin;
}

function respawn(c: HCar, near: boolean) {
  for (let tries = 0; tries < 40; tries++) {
    const road = ROADS[Math.floor(Math.random() * ROADS.length)];
    const s = Math.random() * roadLength.get(road.id)!;
    const p = roadPoint(road, s);
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (near ? d < 60 || d > 650 : d < 250 || d > 800) continue;
    c.road = road; c.s = s; c.dir = Math.random() < 0.5 ? 1 : -1; c.lane = Math.floor(Math.random() * road.lanes);
    c.want = road.speed * (0.8 + Math.random() * 0.35) * (c.lane === 0 ? 0.9 : 1.08);
    c.speed = c.want; c.stun = 0; c.offX = 0; c.offZ = 0; c.spin = 0;
    place(c);
    return;
  }
  c.x = 1e6; c.z = 1e6; // nothing in range right now; try again next frame
}

function HighwayCarView({ c }: { c: HCar }) {
  const model = useCarModel(c.model);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 600;
    g.position.set(c.x, 0, c.z);
    g.rotation.y = c.yaw;
  });
  return <group ref={ref}><primitive object={model} /><Shadow size={c.width + 0.6} length={c.len + 0.8} /></group>;
}

export function HighwayTraffic() {
  useCarjackPrompt();
  const fleet = useMemo<HCar[]>(() => {
    const pool = trafficPool();
    return Array.from({ length: gfx().traffic ?? HIGHWAY_CARS }, (_, i) => {
      const m = pool[i % pool.length];
      const c: HCar = { key: `hw-${i}`, model: m.id, len: m.length, width: m.width, road: ROADS[0], lane: 0, dir: 1, s: 0, speed: 0, want: 20, stun: 0, offX: 0, offZ: 0, spin: 0, x: 1e6, z: 1e6, yaw: 0 };
      respawn(c, true);
      return c;
    });
  }, []);

  useEffect(() => () => fleet.forEach((c) => { trafficBoxes.delete(c.key); jackable.delete(c.key); }), [fleet]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05) * time.world;
    const mine = drivenCar();
    for (const c of fleet) {
      if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 950) { respawn(c, false); continue; }
      const total = roadLength.get(c.road.id)!;
      if (c.stun > 0) {
        // Spun out after a hit: slide to a stop, then pull away again.
        c.stun -= dt;
        c.speed = Math.max(0, c.speed - 14 * dt);
        if (c.stun <= 0) { c.offX *= 0.3; c.offZ *= 0.3; c.spin = 0; }
      } else {
        // Keep distance: nearest car ahead in my lane, the player's car, or a person on the road.
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        const ahead = (x: number, z: number, wide = 1.9) => {
          const dx = x - c.x, dz = z - c.z;
          const f = dx * fx + dz * fz, l = Math.abs(-dx * fz + dz * fx);
          return f > 0 && l < wide ? f : Infinity;
        };
        let gap = Infinity;
        for (const o of fleet) if (o !== c && o.road === c.road) gap = Math.min(gap, ahead(o.x, o.z) - (o.len + c.len) / 2);
        if (mine) gap = Math.min(gap, ahead(mine.x, mine.z, 2.2) - (mine.length + c.len) / 2);
        else gap = Math.min(gap, ahead(player.pos.x, player.pos.z) - c.len / 2 - 1);
        for (const p of crowd.values()) gap = Math.min(gap, ahead(p.x, p.z) - c.len / 2 - 1);
        const brakeDist = 6 + c.speed * 1.1;
        const target = gap < 3 ? 0 : gap < brakeDist ? c.want * ((gap - 3) / (brakeDist - 3)) : c.want;
        c.speed += THREE.MathUtils.clamp(target - c.speed, -12 * dt, 3.5 * dt);
        c.offX *= Math.exp(-dt * 0.8); c.offZ *= Math.exp(-dt * 0.8);
      }
      c.s += c.speed * c.dir * dt;
      if (!c.road.loop && (c.s < 0 || c.s > total)) { respawn(c, false); continue; }
      place(c);
      const ref = c;
      trafficBoxes.set(c.key, {
        x: c.x, z: c.z, yaw: c.yaw, hl: c.len / 2, hw: c.width / 2,
        hit: (impulse, dx, dz) => {
          ref.stun = 3; ref.spin += (Math.random() - 0.5) * Math.min(1.4, impulse / 15);
          ref.offX += dx * Math.min(4, impulse / 6); ref.offZ += dz * Math.min(4, impulse / 6);
          ref.speed *= 0.3;
        },
      });
      jackable.set(c.key, { x: c.x, z: c.z, speed: c.speed, name: vehicleModel(c.model).name, take: () => { takeOver(ref.model, ref.x, ref.z, ref.yaw); respawn(ref, false); } });
    }
  });

  return <group>{fleet.map((c) => <Safe key={c.key}><HighwayCarView c={c} /></Safe>)}</group>;
}

// ---------------------------------------------------------------- street traffic inside a district
type TrafficCar = { key: string; model: string; road: number; dir: 1 | -1; s: number; speed: number; want: number; len: number; width: number; x: number; z: number; yaw: number; stun: number };
const LANE_OFFSET = 1.7;

function TrafficCarView({ t }: { t: TrafficCar }) {
  const model = useCarModel(t.model);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.position.set(t.x, 0, t.z);
    g.rotation.y = t.yaw;
  });
  return <group ref={ref}><primitive object={model} /><Shadow size={t.width + 0.6} length={t.len + 0.8} /></group>;
}

export function Traffic({ map, maxRoads = 4 }: { map: MapDef & { key?: string }; maxRoads?: number }) {
  const roads = useMemo(() => detectRoads(map, (x, z) => !canDrive(x, z, 0), maxRoads), [map, maxRoads]);
  const fleet = useMemo<TrafficCar[]>(() => {
    const pool = trafficPool();
    const out: TrafficCar[] = [];
    let k = 0;
    roads.forEach((r, ri) => {
      const perLane = Math.max(1, Math.min(2, Math.floor(r.len / 50)));
      for (const dir of [1, -1] as const) {
        for (let i = 0; i < perLane; i++) {
          const m = pool[k++ % pool.length];
          const want = 7 + ((k * 37) % 40) / 10;
          out.push({ key: `${map.key ?? map.id}-t${k}`, model: m.id, road: ri, dir, s: (i / perLane) * r.len + ((k * 13) % 10), speed: want, want, len: m.length, width: m.width, x: 0, z: 0, yaw: 0, stun: 0 });
        }
      }
    });
    return out;
  }, [roads, map]);

  useEffect(() => () => fleet.forEach((t) => { trafficBoxes.delete(t.key); jackable.delete(t.key); }), [fleet]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05) * time.world;
    const mine = drivenCar();
    for (const t of fleet) {
      const r: Road = roads[t.road];
      const fx = r.dx * t.dir, fz = r.dz * t.dir;
      const ahead = (x: number, z: number) => {
        const dx = x - t.x, dz = z - t.z;
        const f = dx * fx + dz * fz, l = Math.abs(-dx * fz + dz * fx);
        return f > 0 && l < 1.8 ? f : Infinity;
      };
      let gap = Infinity;
      for (const o of fleet) {
        if (o === t || o.road !== t.road || o.dir !== t.dir) continue;
        const d = o.s - t.s;
        if (d > 0) gap = Math.min(gap, d - (o.len + t.len) / 2);
      }
      if (mine) gap = Math.min(gap, ahead(mine.x, mine.z) - (mine.length + t.len) / 2);
      else gap = Math.min(gap, ahead(player.pos.x, player.pos.z) - t.len / 2 - 0.6);
      for (const p of crowd.values()) gap = Math.min(gap, ahead(p.x, p.z) - t.len / 2 - 0.6);
      t.stun = Math.max(0, t.stun - dt);
      const target = t.stun > 0 ? 0 : gap < 2 ? 0 : gap < 10 ? t.want * ((gap - 2) / 8) : t.want;
      t.speed += THREE.MathUtils.clamp(target - t.speed, -9 * dt, 3 * dt);
      t.s += t.speed * dt;
      if (t.s > r.len) t.s = 0;
      const along = t.dir > 0 ? t.s : r.len - t.s;
      t.x = r.ax + r.dx * along - fz * LANE_OFFSET;
      t.z = r.az + r.dz * along + fx * LANE_OFFSET;
      t.yaw = Math.atan2(fx, fz);
      const ref = t;
      trafficBoxes.set(t.key, { x: t.x, z: t.z, yaw: t.yaw, hl: t.len / 2, hw: t.width / 2, hit: () => { ref.stun = 3; ref.speed *= 0.2; } });
      jackable.set(t.key, { x: t.x, z: t.z, speed: t.speed, name: vehicleModel(t.model).name, take: () => { takeOver(ref.model, ref.x, ref.z, ref.yaw); ref.s = (ref.s + r.len / 2) % r.len; } });
    }
  });

  useEffect(() => {
    if (import.meta.env.DEV) console.info(`[traffic] ${map.key ?? map.id}: ${roads.length} roads, ${fleet.length} cars`);
  }, [roads, fleet, map]);

  return <group>{fleet.map((t) => <Safe key={t.key}><TrafficCarView t={t} /></Safe>)}</group>;
}

/** One bad vehicle file must not take the rest of the city with it (rules §61). */
class SafeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error("[assets] vehicle failed to load", err instanceof Error ? err.message : err); }
  render() { return this.state.failed ? null : this.props.children; }
}
const Safe = ({ children }: { children: ReactNode }) => <SafeBoundary><Suspense fallback={null}>{children}</Suspense></SafeBoundary>;
