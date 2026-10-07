// The open world around the office: a 10 km island (Terrain) with the user's own city maps placed as districts.
// Districts stream in when the player gets close (model + collision grid + street traffic) and unload behind
// them. Drivable cars, highway traffic, pedestrians and mission markers live island-wide.
import { Component, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CityMap, useMapGrid } from "./CityMap.tsx";
import { mapGroup, wantMaps, warmer } from "./streaming.ts";
import { Companion } from "./Companion.tsx";
import { Crowd } from "./Crowd.tsx";
import { DrivableCars, HighwayTraffic, Traffic } from "./Vehicles.tsx";
import { MissionMarkers } from "./MissionMarkers.tsx";
import { Police } from "./Police.tsx";
import { CarFx } from "./CarFx.tsx";
import { NightLights } from "./NightLights.tsx";
import { Garage } from "./Garage.tsx";
import { PoliceStation } from "./PoliceStation.tsx";
import { Combat } from "./Combat.tsx";
import { Ambience } from "./Ambience.tsx";
import { Terrain } from "./Terrain.tsx";
import { DISTRICTS } from "./layout.ts";
import type { District } from "./layout.ts";
import { player } from "../systems/explore.ts";
import { drivenCar } from "../systems/drive.ts";
import { useGame } from "../state/store.ts";
import { gridCount } from "./grid.ts";
import { gfx } from "../settings.ts";
import type * as THREE from "three";

class WorldBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error("[assets] world part failed to load", err instanceof Error ? err.message : err); }
  render() { return this.state.failed ? null : this.props.children; }
}

// Streaming radii (metres from a district's edge). Maps are fetched and prepared well before they're needed —
// further ahead of a fast car — appear inside the haze, and are dropped well behind the player.
const PREFETCH_AT = 1900;
const LOAD_AT = 1150;
const UNLOAD_AT = 1450;
const LOOKAHEAD_S = 7; // seconds of travel to look ahead when deciding what to fetch

function edgeDistance(d: District, x: number, z: number) {
  const b = d.bounds;
  const dx = Math.max(d.ox + b.minX - x, 0, x - (d.ox + b.maxX));
  const dz = Math.max(d.oz + b.minZ - z, 0, z - (d.oz + b.maxZ));
  return Math.hypot(dx, dz);
}

function DistrictView({ d }: { d: District }) {
  const ready = useMapGrid(d, d.key);
  const [near, setNear] = useState(false);
  const group = useRef<THREE.Group>(null);
  // Street traffic only where the player can see it; the district itself only within the view distance.
  useFrame(() => {
    const e = edgeDistance(d, player.pos.x, player.pos.z);
    const n = e < 260;
    if (n !== near) setNear(n);
    if (group.current) group.current.visible = e < gfx().viewDistance + 150;
  });
  return (
    <group ref={group}>
      <WorldBoundary><CityMap map={d} /></WorldBoundary>
      {ready && near && <WorldBoundary><Traffic map={d} maxRoads={d.key === "downtown" ? 6 : 4} /></WorldBoundary>}
    </group>
  );
}

/** Where the player will be in a few seconds (driving fast, that's far ahead). */
function lookahead(prev: { x: number; z: number; t: number }) {
  const now = performance.now() / 1000;
  const car = drivenCar();
  const x = player.pos.x, z = player.pos.z;
  let vx = 0, vz = 0;
  if (car) { vx = Math.sin(car.yaw) * car.speed; vz = Math.cos(car.yaw) * car.speed; }
  else if (prev.t > 0 && now > prev.t) { vx = (x - prev.x) / (now - prev.t); vz = (z - prev.z) / (now - prev.t); }
  prev.x = x; prev.z = z; prev.t = now;
  const k = Math.min(LOOKAHEAD_S, 600 / Math.max(1, Math.hypot(vx, vz))); // never more than ~600 m ahead
  return { x: x + vx * k, z: z + vz * k };
}

function Districts() {
  const [active, setActive] = useState<string[]>([]);
  const tick = useRef({ t: 0, prev: { x: 0, z: 0, t: 0 } }).current;
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    // Shaders for a streamed map compile off the main thread where the driver supports it (KHR_parallel_shader_compile).
    warmer.compile = (g) => gl.compileAsync(g, camera, scene);
    return () => { warmer.compile = null; };
  }, [gl, camera, scene]);
  useFrame(() => {
    // Texture uploads on a time budget: a few milliseconds a frame while playing (no visible hitch), more while
    // the game is still starting up at the desk.
    const budget = useGame.getState().explore ? 3 : 12;
    const t0 = performance.now();
    while (warmer.textures.length && performance.now() - t0 < budget) gl.initTexture(warmer.textures.shift()!);
  });
  useFrame((_, dt) => {
    tick.t -= dt;
    if (tick.t > 0) return;
    tick.t = 0.4;
    const ahead = lookahead(tick.prev);
    const wanted = new Map<string, number>();
    const next: string[] = [];
    for (const d of DISTRICTS) {
      const here = edgeDistance(d, player.pos.x, player.pos.z);
      const soon = Math.min(here, edgeDistance(d, ahead.x, ahead.z));
      if (d.key === "downtown" || soon < PREFETCH_AT) wanted.set(d.id, Math.min(wanted.get(d.id) ?? Infinity, d.key === "downtown" ? -1 : soon));
      // On screen once it's close AND fully prepared — a district never pops in half-loaded or stalls a frame.
      const close = d.key === "downtown" || here < (active.includes(d.key) ? UNLOAD_AT : LOAD_AT);
      if (close && (active.includes(d.key) || mapGroup(d.id))) next.push(d.key);
    }
    wantMaps(wanted);
    if (next.join() !== active.join()) setActive(next);
  });
  return <group>{DISTRICTS.filter((d) => active.includes(d.key)).map((d) => <DistrictView key={d.key} d={d} />)}</group>;
}

/** Cars and people are placed on clear ground, so they wait for Downtown's collision grid. */
function useGroundReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => { if (gridCount() > 0) setReady(true); }, 200);
    return () => clearInterval(id);
  }, [ready]);
  return ready;
}

export function World() {
  const ground = useGroundReady();
  return (
    <group>
      <WorldBoundary><Terrain /></WorldBoundary>
      <Districts />
      {ground && (
        <>
          <WorldBoundary><DrivableCars /></WorldBoundary>
          <WorldBoundary><HighwayTraffic /></WorldBoundary>
          <WorldBoundary><Crowd /></WorldBoundary>
          <WorldBoundary><Police /></WorldBoundary>
        </>
      )}
      <WorldBoundary><MissionMarkers /></WorldBoundary>
      <CarFx />
      <NightLights />
      <Garage />
      <WorldBoundary><Suspense fallback={null}><PoliceStation /></Suspense></WorldBoundary>
      {ground && <WorldBoundary><Combat /></WorldBoundary>}
      <Ambience />
      <Companion />
    </group>
  );
}
