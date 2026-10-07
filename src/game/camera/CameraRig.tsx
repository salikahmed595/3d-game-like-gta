import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useGame } from "../state/store.ts";
import { OFFICE, camHint, lerpAngle, player } from "../systems/explore.ts";
import { cars, drivenCar, trafficBoxes } from "../systems/drive.ts";
import { attachOrbitInput, orbit } from "./orbit.ts";
import { switchCam } from "../systems/switcher.ts";
import { gridBlocked } from "../world/grid.ts";
import { currentWeapon, gun } from "../systems/weapons.ts";
import { screenFx } from "../systems/fx.ts";
import { getCharacter } from "../../../shared/characters.ts";
import type { CameraShot } from "../../types/game.ts";

const DEFAULT_POS = new THREE.Vector3(3.9, 2.1, 3.9);
const DEFAULT_LOOK = new THREE.Vector3(-0.1, 1.0, -0.1);

type ShotDef = { pos: THREE.Vector3; look: THREE.Vector3; speed: number };
const SHOTS: Record<Exclude<CameraShot, "default" | "orbit">, ShotDef> = {
  sale: { pos: new THREE.Vector3(1.6, 1.55, 2.4), look: new THREE.Vector3(0, 1.1, 0), speed: 3 },
  upgrade: { pos: new THREE.Vector3(1.6, 1.9, 3.0), look: new THREE.Vector3(-0.2, 1.0, 0.4), speed: 2.2 },
  boss: { pos: new THREE.Vector3(2.4, 1.5, 0.4), look: new THREE.Vector3(-0.2, 1.1, -1.8), speed: 2.4 },
  building: { pos: new THREE.Vector3(7.5, 5.2, 10.5), look: new THREE.Vector3(0, 1.4, -0.5), speed: 0.9 },
};

// Solid structures the roaming camera must not end up behind (glass and holograms are see-through).
const BLOCKERS = [
  new THREE.Box3(new THREE.Vector3(OFFICE.minX - 0.1, 0, OFFICE.minZ - 0.1), new THREE.Vector3(OFFICE.maxX, 3, OFFICE.minZ + 0.05)), // back wall
  new THREE.Box3(new THREE.Vector3(OFFICE.minX - 0.1, 0, OFFICE.minZ), new THREE.Vector3(OFFICE.minX + 0.05, 3, OFFICE.maxZ)), // left wall
].map((b) => b.expandByScalar(0.2));
const probe = new THREE.Vector3();
const chase = { yaw: null as number | null };
const follow = new THREE.Vector3();
const switchStart = new THREE.Vector3();
/** Where the camera looks (radians, same convention as yaw): the radar rotates with it. */
export const view = { heading: 0 };
const viewDir = new THREE.Vector3();
let aimBlend = 0;

/** Explosion shake (fx.ts screenFx.shake, decays quickly). */
function blastShake(camera: THREE.Camera, dt: number) {
  if (screenFx.shake <= 0.001) return;
  const s = screenFx.shake * 0.35;
  camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s;
  screenFx.shake = Math.max(0, screenFx.shake - dt * 2.2);
}

// City buildings come from the map's collision grid (solid footprints); treated as solid up to roof-ish height.
const inCityBlock = (p: THREE.Vector3) => p.y < 9 && gridBlocked(p.x, p.z, 0);
// Vehicles too: a camera inside a car body shows its insides (the "I turn see-through" look).
const inVehicle = (p: THREE.Vector3) => {
  if (p.y > 1.9) return false;
  const inBox = (x: number, z: number, yaw: number, hl: number, hw: number) => {
    const dx = p.x - x, dz = p.z - z, s = Math.sin(yaw), c = Math.cos(yaw);
    return Math.abs(dx * s + dz * c) < hl + 0.3 && Math.abs(dx * c - dz * s) < hw + 0.3;
  };
  for (const b of trafficBoxes.values()) if (Math.abs(b.x - p.x) < 6 && Math.abs(b.z - p.z) < 6 && inBox(b.x, b.z, b.yaw, b.hl, b.hw)) return true;
  const mine = drivenCar();
  for (const c of cars.values()) if (c !== mine && Math.abs(c.x - p.x) < 6 && Math.abs(c.z - p.z) < 6 && inBox(c.x, c.z, c.yaw, c.length / 2, c.width / 2)) return true;
  return false;
};

/** Pull the camera in front of the first blocker between the player and the camera. */
function avoidOcclusion(target: THREE.Vector3, camera: THREE.Camera): void {
  const dir = probe.copy(camera.position).sub(target);
  const dist = dir.length();
  if (dist < 0.01) return;
  dir.divideScalar(dist);
  const p = new THREE.Vector3();
  for (let d = 0.4; d <= dist; d += 0.15) {
    p.copy(target).addScaledVector(dir, d);
    if (BLOCKERS.some((b) => b.containsPoint(p)) || inCityBlock(p) || inVehicle(p)) {
      camera.position.copy(target).addScaledVector(dir, Math.max(d - 0.35, 1.0));
      return;
    }
  }
}

// The camera is part of the reward: short, smooth shots, then control returns to the user.
// While roaming it follows the player (drag to orbit, scroll to zoom).
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, scene, gl } = useThree();
  const explore = useGame((s) => s.explore);
  const look = useRef(DEFAULT_LOOK.clone());
  const returning = useRef(false);
  const lastShot = useRef<CameraShot>("default");
  const lastExplore = useRef(false);
  const orbitT = useRef(0);
  const tmp = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), want: new THREE.Vector3(), delta: new THREE.Vector3() });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = useGame.getState();
    const shot = g.shot;
    const c = controls.current;
    const t = tmp.current;

    if (g.explore !== lastExplore.current) {
      lastExplore.current = g.explore;
      if (c) look.current.copy(c.target);
      if (!g.explore) returning.current = true; // glide back to the desk framing
    }
    if (shot !== lastShot.current) {
      if (shot === "default") {
        if (g.explore && c) { c.target.copy(look.current); c.update(); } // hand control back where the shot ended
        else returning.current = true;
      }
      if (shot === "orbit") orbitT.current = 0;
      lastShot.current = shot;
    }

    camera.getWorldDirection(viewDir);
    view.heading = Math.atan2(viewDir.x, viewDir.z);
    const car = drivenCar();
    const cam = camera as THREE.PerspectiveCamera;
    if (switchCam.phase !== "idle") {
      // Character switch: rise into the sky over the old character, then drop onto the new one (GTA V).
      if (c) c.enabled = false;
      const first = switchCam.t === 0;
      switchCam.t += dt;
      const k = Math.min(switchCam.t / 1.25, 1);
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const high = (p: THREE.Vector3) => t.pos.set(p.x, 260, p.z + 70);
      if (switchCam.phase === "up") {
        if (first) switchStart.copy(camera.position);
        camera.position.lerpVectors(switchStart, high(switchCam.from), ease);
        t.look.set(switchCam.from.x, 0, switchCam.from.z);
      } else {
        high(switchCam.to);
        t.want.set(switchCam.to.x, 3.2, switchCam.to.z + 5);
        camera.position.lerpVectors(t.pos, t.want, ease);
        t.look.set(switchCam.to.x, 1.4 * ease, switchCam.to.z);
        orbit.init = false; // the follow camera picks up from here when the switch ends
      }
      camera.lookAt(t.look);
      look.current.copy(t.look);
      cam.fov = THREE.MathUtils.lerp(cam.fov, 50, 0.1);
      cam.updateProjectionMatrix();
      return;
    }
    if (car) {
      // Chase camera: locked to the car (no positional lag at 300 km/h); only the heading is smoothed, so the
      // camera swings round in turns and drifts. Pulls back, widens the lens and shakes with speed / impacts.
      if (c) c.enabled = false;
      const v = Math.abs(car.speed);
      const heading = car.speed < -1 ? car.yaw + Math.PI : car.yaw;
      chase.yaw = lerpAngle(chase.yaw ?? heading, heading, 1 - Math.exp(-dt * (3 + v * 0.04)));
      // Mouse look-around while driving springs back behind the car after a moment.
      if (performance.now() - orbit.lastInput > 1200) orbit.lookOff *= Math.exp(-dt * 3);
      // V cycles the view: near chase, far chase, hood cam (orbit.carMode).
      const far = orbit.carMode === 1, hood = orbit.carMode === 2;
      const back = (far ? 11 : 6.6) + Math.min(v, 83) * 0.055;
      const fx = Math.sin(chase.yaw + orbit.lookOff), fz = Math.cos(chase.yaw + orbit.lookOff);
      const jitter = car.shake * 0.35 + (v > 50 ? (v - 50) * 0.0012 : 0);
      const cy = car.y;
      if (hood) {
        // Bonnet camera: just above the front of the car, looking down the road.
        const hx = Math.sin(car.yaw + orbit.lookOff), hz = Math.cos(car.yaw + orbit.lookOff);
        t.pos.set(car.x + Math.sin(car.yaw) * (car.length * 0.18), cy + 1.25 + (Math.random() - 0.5) * jitter * 0.4, car.z + Math.cos(car.yaw) * (car.length * 0.18));
        t.look.set(t.pos.x + hx * 30, cy + 1.0, t.pos.z + hz * 30);
        camera.position.copy(t.pos);
      } else {
        t.pos.set(car.x - fx * back + (Math.random() - 0.5) * jitter, cy + (far ? 3.6 : 2.35) + v * 0.012 + (Math.random() - 0.5) * jitter, car.z - fz * back + (Math.random() - 0.5) * jitter);
        t.look.set(car.x + fx * (4 + v * 0.12), cy + 1.0, car.z + fz * (4 + v * 0.12));
        camera.position.copy(t.pos);
        t.want.set(car.x, cy + 1.2, car.z);
        avoidOcclusion(t.want, camera);
      }
      look.current.copy(t.look);
      blastShake(camera, dt);
      camera.lookAt(look.current);
      const fov = 55 + Math.min(v / 83, 1) * 20 + (car.boosting ? 6 : 0);
      cam.fov = THREE.MathUtils.lerp(cam.fov, fov, 1 - Math.exp(-dt * 3));
      cam.updateProjectionMatrix();
      if (c) c.target.copy(look.current);
      return;
    }
    chase.yaw = null;
    if (!g.explore && Math.abs(cam.fov - 42) > 0.05) { cam.fov = THREE.MathUtils.lerp(cam.fov, 42, 1 - Math.exp(-dt * 4)); cam.updateProjectionMatrix(); }
    if (g.explore && shot === "default") {
      // GTA-style third person: our own orbit (mouse / drag / wheel in orbit.ts) around a shoulder-height target.
      if (c) c.enabled = false;
      const height = 1.45 * Math.min(1.05, getCharacter(g.player?.avatarId).height / 1.75);
      if (!orbit.init) {
        // Start from wherever the camera is now (e.g. the desk shot), so stepping out is a smooth hand-over.
        t.pos.copy(camera.position).sub(t.want.set(player.pos.x, height, player.pos.z));
        orbit.dist = THREE.MathUtils.clamp(t.pos.length(), 3.2, 6);
        orbit.az = Math.atan2(t.pos.x, t.pos.z);
        orbit.pol = THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(t.pos.y / (t.pos.length() || 1), -1, 1)), 0.9, 1.4);
        orbit.init = true;
        follow.copy(t.want);
      }
      const idle = performance.now() - orbit.lastInput > 1600;
      if (camHint.yaw !== null) {
        // Swing round behind the player so what they walk toward / use is in frame.
        orbit.az = lerpAngle(orbit.az, camHint.yaw + Math.PI, 1 - Math.exp(-dt * 2.5));
      } else if (idle && player.speed > 1.2) {
        // Running with the keyboard and not touching the mouse: ease in behind the player (GTA does this).
        orbit.az = lerpAngle(orbit.az, player.yaw + Math.PI, 1 - Math.exp(-dt * 0.9 * Math.min(player.speed / 4, 1.6)));
      }
      t.want.set(player.pos.x, height + player.pos.y * 0.6, player.pos.z);
      follow.lerp(t.want, 1 - Math.exp(-dt * 14));
      // Aiming (right mouse): pull in tight over the right shoulder and narrow the lens (scope for the sniper).
      const aimingNow = gun.held && (gun.aiming || gun.trigger);
      aimBlend = THREE.MathUtils.lerp(aimBlend, gun.held && gun.aiming ? 1 : aimingNow ? 0.45 : 0, 1 - Math.exp(-dt * 12));
      // Over-the-shoulder: nudge the look point to the camera's right.
      const rx = Math.cos(orbit.az), rz = -Math.sin(orbit.az);
      const side = 0.35 + aimBlend * 0.3;
      t.look.set(follow.x + rx * side, follow.y + aimBlend * 0.12, follow.z + rz * side);
      const sp = Math.sin(orbit.pol);
      const dist = THREE.MathUtils.lerp(orbit.dist, 1.75, aimBlend);
      camera.position.set(t.look.x + Math.sin(orbit.az) * sp * dist, t.look.y + Math.cos(orbit.pol) * dist, t.look.z + Math.cos(orbit.az) * sp * dist);
      if (camera.position.y < 0.35) camera.position.y = 0.35;
      avoidOcclusion(t.look, camera);
      // Never inside a car body: if pulled in close against one, rise over its roof instead.
      if (inVehicle(camera.position)) camera.position.y = 2.0;
      blastShake(camera, dt);
      camera.lookAt(t.look);
      look.current.copy(t.look);
      if (c) c.target.copy(t.look);
      const fov = THREE.MathUtils.lerp(55 + Math.min(player.speed / 6, 1) * 4, currentWeapon().zoom, aimBlend);
      cam.fov = THREE.MathUtils.lerp(cam.fov, fov, 1 - Math.exp(-dt * 3));
      cam.updateProjectionMatrix();
      return;
    }
    if (shot === "default" && !returning.current) {
      if (c) c.enabled = true;
      return; // user is in control
    }
    if (c) c.enabled = false;

    // Shots are authored around the desk; while roaming they are re-centred on the player.
    const ox = g.explore ? player.pos.x : 0;
    const oz = g.explore ? player.pos.z : 0;
    let speed = 2.4;
    if (shot === "orbit") {
      orbitT.current += dt;
      const a = 0.9 + orbitT.current * 0.55; // gentle ~ quarter-turn sweep
      t.pos.set(ox + Math.sin(a) * 3.1, 1.7, oz + Math.cos(a) * 3.1);
      t.look.set(ox, 1.1, oz);
      speed = 4;
    } else if (shot !== "default") {
      const def = SHOTS[shot];
      t.pos.copy(def.pos).add(new THREE.Vector3(ox, 0, oz));
      t.look.copy(def.look).add(new THREE.Vector3(ox, 0, oz));
      speed = def.speed;
    } else {
      t.pos.copy(DEFAULT_POS);
      t.look.copy(DEFAULT_LOOK);
    }
    const k = 1 - Math.exp(-dt * speed);
    camera.position.lerp(t.pos, k);
    look.current.lerp(t.look, k);
    camera.lookAt(look.current);

    if (shot === "default" && camera.position.distanceTo(DEFAULT_POS) < 0.05) {
      returning.current = false;
      if (c) { c.target.copy(DEFAULT_LOOK); c.update(); }
    }
  });

  useEffect(() => attachOrbitInput(gl.domElement), [gl]);

  // Set the orbit target once: passing it as a prop would snap it back to the desk on every re-render.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__camera = { camera, controls: c, scene, gl, orbit };
    c.target.copy(DEFAULT_LOOK);
    c.update();
    const userTakesOver = () => { camHint.yaw = null; };
    c.addEventListener("start", userTakesOver);
    return () => c.removeEventListener("start", userTakesOver);
  }, []);

  return (
    <OrbitControls ref={controls} enablePan={false} enableDamping
      minDistance={explore ? 1.8 : 2.2} maxDistance={explore ? 11 : 9}
      minPolarAngle={explore ? 0.25 : 0.5} maxPolarAngle={1.48}
      minAzimuthAngle={explore ? -Infinity : -0.2} maxAzimuthAngle={explore ? Infinity : 1.7} />
  );
}

export const DEFAULT_CAMERA_POSITION = DEFAULT_POS.toArray() as [number, number, number];
