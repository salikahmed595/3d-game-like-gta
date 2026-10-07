// Combat visuals: the gun in the player's hand (the user's weapon models), tracers, muzzle flashes, blood spray and
// pools (the user's 3D blood models), sparks, smoke from damaged cars and explosions, plus pickups (weapons,
// health, body armour) around the city. Everything is pooled: a fixed handful of draw calls however busy it gets.
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { fxQueue } from "../systems/fx.ts";
import type { FxEvent } from "../systems/fx.ts";
import { WEAPONS, currentWeapon, giveWeapon, gun, muzzleAt, reloadProgress, useArsenal, weaponModelUrl } from "../systems/weapons.ts";
import type { WeaponId } from "../systems/weapons.ts";
import { playerRig } from "../character/Avatar.tsx";
import type { CharacterModel } from "../character/rig.ts";
import { twoBoneIK } from "../character/ik.ts";
import { canStand, player } from "../systems/explore.ts";
import { fighter, MAX_HP } from "../systems/people.ts";
import { playSound } from "../audio.ts";
import { DRACO_PATH } from "./CityMap.tsx";
import { openSpot } from "./layout.ts";
import { gfx } from "../settings.ts";
import { time } from "../systems/time.ts";
import { bumpStat } from "../systems/stats.ts";
import { showBanner } from "../systems/missions.ts";

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), e1 = new THREE.Euler(0, 0, 0, "YXZ");

function glow(inner: string, outer: string, size = 64): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/** A weapon model, cloned per holder (materials shared). */
export function useWeaponModel(id: WeaponId) {
  const { scene } = useGLTF(weaponModelUrl(id), DRACO_PATH);
  return useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
    return o;
  }, [scene]);
}

/** Puts a held gun at a hand: grip in the palm, barrel along (yaw, pitch). Returns the muzzle point. */
export function placeInHand(obj: THREE.Object3D, hand: THREE.Object3D, yaw: number, pitch: number, muzzle: number, out?: THREE.Vector3): void {
  hand.updateWorldMatrix(true, false);
  hand.getWorldPosition(v1);
  e1.set(-pitch, yaw, 0, "YXZ");
  obj.quaternion.setFromEuler(e1);
  // The wrist joint sits a hand's length behind the grip.
  v2.set(0, 0, 0.06).applyQuaternion(obj.quaternion);
  obj.position.copy(v1).add(v2);
  if (out) out.set(0, 0.03, muzzle).applyQuaternion(obj.quaternion).add(obj.position);
}

const fore = new THREE.Vector3(), handP = new THREE.Vector3(), leftP = new THREE.Vector3(), dir = new THREE.Vector3();
const lerpAng = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/**
 * A gun held the way a person holds it, driven by the arm instead of floating at a fixed angle:
 * - pistol, lowered: it hangs from the hand along the forearm with the wrist cocked so the muzzle points at the
 *   ground ahead; it swings with the arm as you walk.
 * - rifle, lowered: grip in the right palm, barrel laid toward the left hand, so the support hand is always on
 *   the handguard (whatever the body is doing).
 * - raised (aim 1): exactly along the aim, so shots go where the crosshair is.
 * Between the two it blends with the arms.
 */
export function placeHeld(obj: THREE.Object3D, bones: CharacterModel["bones"], bodyYaw: number, hold: "pistol" | "rifle", aim: number, aimYaw: number, aimPitch: number, muzzle: number, out?: THREE.Vector3, act: { kick?: number; reload?: number } = {}): boolean {
  // Reloading: the gun dips and rolls toward the body (magazine well up), then comes back.
  const r = act.reload ?? 0, m = Math.sin(r * Math.PI);
  const ok = placeGun(obj, bones, bodyYaw, hold, aim, aimYaw, aimPitch - 0.45 * m, muzzle, out, 0.5 * m);
  if (!ok) return false;
  // Firing: the gun snaps back into the hand (slide / recoil), muzzle flipping up a touch.
  const kick = act.kick ?? 0;
  if (kick > 0) {
    v2.set(0, 0, -0.045 * kick).applyQuaternion(obj.quaternion);
    obj.position.add(v2);
    obj.rotateX(-0.18 * kick);
  }
  supportHand(obj, bones, hold, aim, r);
  return true;
}

// Where the support (left) wrist goes, in the gun's own frame (+x = the holder's left, +y up, +z toward the
// muzzle): under the rifle's handguard; wrapped round the shooting hand on a pistol.
const SUPPORT = { rifle: new THREE.Vector3(0.045, -0.065, 0.16), pistol: new THREE.Vector3(0.05, -0.06, -0.065) };
// The magazine (bottom of the grip / the mag well), where the support hand goes to swap it during a reload.
const MAG = { rifle: new THREE.Vector3(0.0, -0.13, 0.05), pistol: new THREE.Vector3(0.0, -0.11, -0.03) };
const magT = new THREE.Vector3();
const supportT = new THREE.Vector3();

/** IK the left hand onto the gun: always for a rifle, for a pistol only as it comes up to aim. */
function supportHand(obj: THREE.Object3D, bones: CharacterModel["bones"], hold: "pistol" | "rifle", aim: number, reload = 0) {
  const arm = bones.get("LeftArm")?.bone, fore = bones.get("LeftForeArm")?.bone, hand = bones.get("LeftHand")?.bone;
  if (!arm || !fore || !hand) return;
  const m = Math.sin(reload * Math.PI);
  const w = Math.max(hold === "rifle" ? 1 : THREE.MathUtils.smoothstep(aim, 0.35, 0.9), m);
  if (w <= 0) return;
  obj.updateMatrixWorld(true);
  // Reload: hand to the magazine, pull the old one down and away (first half), slap the new one in (second half).
  supportT.copy(SUPPORT[hold]);
  if (reload > 0) {
    magT.copy(MAG[hold]);
    magT.y -= Math.max(0, Math.sin(reload * Math.PI * 2)) * 0.16;
    supportT.lerp(magT, Math.min(1, m * 1.6));
  }
  supportT.applyMatrix4(obj.matrixWorld);
  twoBoneIK(arm, fore, hand, supportT, w);
}

function placeGun(obj: THREE.Object3D, bones: CharacterModel["bones"], bodyYaw: number, hold: "pistol" | "rifle", aim: number, aimYaw: number, aimPitch: number, muzzle: number, out?: THREE.Vector3, roll = 0): boolean {
  const hand = bones.get("RightHand")?.bone, foreArm = bones.get("RightForeArm")?.bone, left = bones.get("LeftHand")?.bone;
  if (!hand || !foreArm) return false;
  hand.updateWorldMatrix(true, false);
  hand.getWorldPosition(handP);
  foreArm.getWorldPosition(fore);
  dir.subVectors(handP, fore).normalize(); // forearm, elbow → wrist
  let lowYaw = bodyYaw, lowPitch = -1.1;
  if (hold === "rifle" && left) {
    left.getWorldPosition(leftP);
    // Aim the line a little under the support wrist: the handguard (which sits above the grip) then rests in
    // that palm instead of floating over it.
    leftP.y -= 0.07;
    const d = leftP.sub(handP);
    if (d.lengthSq() > 0.01) { d.normalize(); lowYaw = Math.atan2(d.x, d.z); lowPitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)); }
  } else {
    // Forearm pitch + a cocked wrist (~40°); never pointing back up at yourself.
    lowPitch = Math.min(-0.45, Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) + 0.7);
  }
  const yaw = lerpAng(lowYaw, aimYaw, aim), pitch = THREE.MathUtils.lerp(lowPitch, aimPitch, aim);
  e1.set(-pitch, yaw, roll, "YXZ");
  obj.quaternion.setFromEuler(e1);
  // The fist closes round the grip about 7 cm past the wrist; the model's origin is the top of the grip (where
  // the web of the thumb sits), so it rides a few centimetres above the fist's centre, in the gun's own frame.
  obj.position.copy(handP).addScaledVector(dir, 0.07);
  v2.set(0, 0.03, 0.012).applyQuaternion(obj.quaternion);
  obj.position.add(v2);
  if (out) out.set(0, 0.03, muzzle).applyQuaternion(obj.quaternion).add(obj.position);
  return true;
}

// ---------------------------------------------------------------- the player's gun
function HeldGun({ id }: { id: WeaponId }) {
  const model = useWeaponModel(id);
  const ref = useRef<THREE.Group>(null);
  // Runs from the avatar, right after this frame's pose (so the gun and the support-hand IK use the final arms).
  useEffect(() => {
    const place = () => {
      const g = ref.current, rig = playerRig.model, root = playerRig.root;
      if (!g) return;
      g.visible = gun.held && !!rig && !!root;
      if (!g.visible || !rig || !root) return;
      const def = WEAPONS[id];
      if (def.hold === "none") return;
      g.visible = placeHeld(g, rig.bones, root.rotation.y, def.hold, playerRig.aim, root.rotation.y, gun.pitch - 0.12 + gun.recoil * 0.12, def.muzzle, muzzleAt, { kick: gun.kick, reload: reloadProgress() });
    };
    playerRig.afterPose = place;
    return () => { if (playerRig.afterPose === place) playerRig.afterPose = null; };
  }, [id]);
  useFrame(() => { if (ref.current && (!gun.held || !playerRig.model)) ref.current.visible = false; });
  return <group ref={ref}><primitive object={model} /></group>;
}

/** Mounted after the player's avatar (so it reads this frame's pose). */
export function PlayerGun() {
  const current = useArsenal((s) => s.current);
  if (WEAPONS[current].hold === "none") return null;
  return <Optional key={current}><HeldGun id={current} /></Optional>;
}

// ---------------------------------------------------------------- effects
type Tracer = { life: number; max: number; from: THREE.Vector3; to: THREE.Vector3; color: THREE.Color };
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number };
type SpriteFx = { s: THREE.Sprite; life: number; max: number; grow: number; rise: number; base: number; fade: number };
type Decal = { m: THREE.Object3D; life: number; size: number; grow: number };

const MAX_TRACERS = 48, MAX_BLOOD = 320, MAX_SPARKS = 160, MAX_SPRITES = 48, MAX_DECALS = 48, MAX_CASINGS = 40;

function Effects() {
  const { scene: poolScene } = useGLTF("/models/props/blood_pool.glb", DRACO_PATH);
  const { scene: splatScene } = useGLTF("/models/props/blood_splat.glb", DRACO_PATH);
  const parts = useMemo(() => {
    // Tracers: one LineSegments; additive colours fade to black (= invisible) over their short life.
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3));
    tracerGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3));
    const tracerLines = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    tracerLines.frustumCulled = false;
    const points = (n: number, color: string, size: number, additive: boolean) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setDrawRange(0, 0);
      const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive }));
      p.frustumCulled = false;
      return p;
    };
    const blood = points(MAX_BLOOD, "#7a0008", 0.07, false);
    const sparks = points(MAX_SPARKS, "#ffd27a", 0.06, true);
    const casings = points(MAX_CASINGS, "#d8b04a", 0.035, false); // brass
    const fireTex = glow("rgba(255,240,200,1)", "rgba(255,90,10,0)");
    const smokeTex = glow("rgba(90,90,90,0.85)", "rgba(90,90,90,0)");
    const sprites: SpriteFx[] = Array.from({ length: MAX_SPRITES }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, toneMapped: false }));
      s.visible = false;
      return { s, life: 0, max: 1, grow: 1, rise: 0, base: 1, fade: 1 };
    });
    // Blood on the ground: the user's decal models, cloned into a small pool.
    const decal = (src: THREE.Object3D) => {
      const o = src.clone(true);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.renderOrder = 1;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.transparent = true; mat.depthWrite = false; mat.color?.multiplyScalar(0.8);
        if (!mat.map) mat.color = new THREE.Color("#5e0006");
        m.material = mat;
      });
      o.visible = false;
      return o;
    };
    const decals: Decal[] = Array.from({ length: MAX_DECALS }, (_, i) => ({ m: decal(i % 3 === 2 ? splatScene : poolScene), life: 0, size: 1, grow: 0 }));
    return { tracerLines, blood, sparks, casings, sprites, decals, fireTex, smokeTex };
  }, [poolScene, splatScene]);

  const state = useMemo(() => ({
    tracers: [] as Tracer[], blood: [] as Particle[], sparks: [] as Particle[], casings: [] as Particle[], nextSprite: 0, nextDecal: 0,
  }), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05) * time.world;
    const low = gfx().effects === "low";
    // Drain the queue into the pools.
    for (const e of fxQueue.splice(0)) spawn(e, low);
    // Tracers
    const tp = parts.tracerLines.geometry.getAttribute("position") as THREE.BufferAttribute;
    const tc = parts.tracerLines.geometry.getAttribute("color") as THREE.BufferAttribute;
    state.tracers = state.tracers.filter((t) => (t.life += dt) < t.max);
    state.tracers.forEach((t, i) => {
      const k = 1 - t.life / t.max;
      // The streak travels: its tail chases its head down the line.
      const head = Math.min(1, t.life / t.max * 2.5), tail = Math.max(0, head - 0.35);
      v1.copy(t.from).lerp(t.to, tail); v2.copy(t.from).lerp(t.to, head);
      tp.setXYZ(i * 2, v1.x, v1.y, v1.z); tp.setXYZ(i * 2 + 1, v2.x, v2.y, v2.z);
      tc.setXYZ(i * 2, t.color.r * k * 0.3, t.color.g * k * 0.3, t.color.b * k * 0.3); tc.setXYZ(i * 2 + 1, t.color.r * k, t.color.g * k, t.color.b * k);
    });
    parts.tracerLines.geometry.setDrawRange(0, state.tracers.length * 2);
    tp.needsUpdate = true; tc.needsUpdate = true;
    // Blood droplets: arc, fall, and leave small splats where they land.
    stepParticles(state.blood, parts.blood, dt, 9.8, (p) => {
      if (Math.random() < (low ? 0.02 : 0.06)) addDecal(p.x, p.z, 0.25 + Math.random() * 0.3, true);
    });
    stepParticles(state.sparks, parts.sparks, dt, 6, null);
    stepParticles(state.casings, parts.casings, dt, 9.8, null);
    // Sprites: flashes, fireballs, smoke.
    for (const f of parts.sprites) {
      if (!f.s.visible) continue;
      f.life += dt;
      const k = f.life / f.max;
      if (k >= 1) { f.s.visible = false; continue; }
      f.s.scale.setScalar(f.base * (1 + k * f.grow));
      f.s.position.y += f.rise * dt;
      (f.s.material as THREE.SpriteMaterial).opacity = Math.pow(1 - k, f.fade);
    }
    // Decals grow into place, then stay a while.
    for (const d of parts.decals) {
      if (!d.m.visible) continue;
      d.life += dt;
      const k = Math.min(1, d.life / (d.grow || 0.001));
      d.m.scale.setScalar(d.size * (0.2 + 0.8 * Math.sqrt(k)));
      if (d.life > 90) d.m.visible = false;
    }
  });

  function stepParticles(list: Particle[], pts: THREE.Points, dt: number, gravity: number, onLand: ((p: Particle) => void) | null) {
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      p.vy -= gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y <= 0.06) { onLand?.(p); list.splice(i, 1); continue; }
      if (p.life > p.max) { list.splice(i, 1); continue; }
    }
    for (const p of list) pos.setXYZ(n++, p.x, p.y, p.z);
    pts.geometry.setDrawRange(0, n);
    pos.needsUpdate = true;
  }

  function sprite(at: { x: number; y: number; z: number }, tex: THREE.Texture, color: string, base: number, max: number, grow: number, rise: number, additive: boolean, fade = 1) {
    const f = parts.sprites[state.nextSprite++ % MAX_SPRITES];
    const m = f.s.material as THREE.SpriteMaterial;
    m.map = tex; m.color.set(color); m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true;
    f.s.position.set(at.x, at.y, at.z);
    Object.assign(f, { life: 0, max, grow, rise, base, fade });
    f.s.scale.setScalar(base);
    f.s.visible = true;
  }

  function addDecal(x: number, z: number, size: number, quick: boolean) {
    const d = parts.decals[state.nextDecal++ % MAX_DECALS];
    d.m.position.set(x, 0.075, z);
    d.m.rotation.y = Math.random() * Math.PI * 2;
    Object.assign(d, { life: 0, size, grow: quick ? 0.15 : 4 });
    d.m.scale.setScalar(size * 0.2);
    d.m.visible = true;
  }

  function burst(list: Particle[], max: number, at: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, n: number, speed: number, life: number) {
    for (let i = 0; i < n && list.length < max; i++) {
      const s = speed * (0.4 + Math.random() * 0.8);
      list.push({ x: at.x, y: at.y, z: at.z, vx: dir.x * s + (Math.random() - 0.5) * speed * 0.7, vy: dir.y * s + Math.random() * speed * 0.5, vz: dir.z * s + (Math.random() - 0.5) * speed * 0.7, life: 0, max: life });
    }
  }

  function spawn(e: FxEvent, low: boolean) {
    switch (e.kind) {
      case "tracer":
        if (state.tracers.length >= MAX_TRACERS) state.tracers.shift();
        state.tracers.push({ life: 0, max: 0.09, from: new THREE.Vector3(e.from.x, e.from.y, e.from.z), to: new THREE.Vector3(e.to.x, e.to.y, e.to.z), color: new THREE.Color(e.color) });
        break;
      case "flash":
        sprite(e.at, parts.fireTex, e.color, e.size, 0.06, 0.6, 0, true);
        break;
      case "blood": {
        const l = Math.hypot(e.dir.x, e.dir.y, e.dir.z) || 1;
        burst(state.blood, MAX_BLOOD, e.at, { x: e.dir.x / l, y: e.dir.y / l, z: e.dir.z / l }, Math.round(e.amount * (low ? 1 : 2.4)), 3.2, 1.4);
        break;
      }
      case "pool":
        addDecal(e.x, e.z, e.size, false);
        break;
      case "splat":
        addDecal(e.x, e.z, e.size, true);
        break;
      case "casing":
        burst(state.casings, MAX_CASINGS, e.at, e.dir, 1, 2.6, 1.6);
        break;
      case "spark":
        burst(state.sparks, MAX_SPARKS, e.at, { x: 0, y: 0.6, z: 0 }, low ? 4 : 10, 4, 0.35);
        sprite(e.at, parts.fireTex, e.color ?? "#ffcf80", 0.18, 0.05, 0.5, 0, true);
        break;
      case "smoke":
        sprite(e.at, parts.smokeTex, e.dark ? "#2a2a2a" : "#9a9a9a", 0.8, 2.2, 3.5, 1.6, false, 1.4);
        if (e.dark && Math.random() < 0.5) sprite(e.at, parts.fireTex, "#ff8a2a", 0.7, 0.35, 0.6, 1, true);
        break;
      case "explosion":
        sprite(e.at, parts.fireTex, "#ffb347", e.size * 0.9, 0.7, 2.2, 1.5, true);
        sprite({ x: e.at.x, y: e.at.y + 1, z: e.at.z }, parts.fireTex, "#ff5a1a", e.size * 0.6, 0.9, 2.6, 3, true);
        for (let i = 0; i < (low ? 2 : 5); i++) sprite({ x: e.at.x + (Math.random() - 0.5) * 3, y: e.at.y + 1 + Math.random() * 2, z: e.at.z + (Math.random() - 0.5) * 3 }, parts.smokeTex, "#222", e.size * 0.5, 3 + Math.random() * 2, 3, 2.2, false, 1.6);
        burst(state.sparks, MAX_SPARKS, e.at, { x: 0, y: 1, z: 0 }, low ? 20 : 60, 14, 0.9);
        break;
    }
  }

  return (
    <group>
      <primitive object={parts.tracerLines} />
      <primitive object={parts.blood} />
      <primitive object={parts.sparks} />
      <primitive object={parts.casings} />
      {parts.sprites.map((f, i) => <primitive key={i} object={f.s} />)}
      {parts.decals.map((d, i) => <primitive key={`d${i}`} object={d.m} />)}
    </group>
  );
}

// ---------------------------------------------------------------- pickups
type PickupKind = WeaponId | "health" | "armor";
type Pickup = { id: string; kind: PickupKind; x: number; z: number; rounds: number; placed: boolean; respawnT: number };

/** Weapons, health and armour placed around the office, the Havana street and further out (GTA-style). */
const PICKUPS: Pickup[] = ([
  ["smg", 52, -13, 120], ["rifle", 56, -42, 120], ["carbine", 72, -62, 120], ["sniper", 96, 9, 20], ["plasma", 600, 1500, 60], ["incinerator", 3600, 600, 12],
  ["pistol", 9, -2.5, 48], ["health", 8.5, 2.6, 0], ["health", 48, -30, 0], ["health", 80, 8, 0], ["armor", 66, -20, 0], ["armor", 90, 8, 0], ["armor", -1300, 700, 0],
] as const).map(([kind, x, z, rounds], i) => ({ id: `pickup-${i}`, kind, x, z, rounds, placed: false, respawnT: 0 }));

const LABEL: Record<string, string> = { health: "Health", armor: "Body Armour" };

function PickupView({ p }: { p: Pickup }) {
  const ref = useRef<THREE.Group>(null);
  const isWeapon = p.kind !== "health" && p.kind !== "armor";
  const tex = useMemo(() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const c = cv.getContext("2d")!;
    c.fillStyle = p.kind === "health" ? "#1f9d3a" : "#2a5bd7"; c.fillRect(0, 0, 64, 64);
    c.fillStyle = "#fff";
    if (p.kind === "health") { c.fillRect(26, 10, 12, 44); c.fillRect(10, 26, 44, 12); }
    else { c.beginPath(); c.moveTo(14, 12); c.lineTo(50, 12); c.lineTo(54, 30); c.lineTo(46, 54); c.lineTo(18, 54); c.lineTo(10, 30); c.closePath(); c.fill(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [p.kind]);
  useFrame(({ clock }, dtRaw) => {
    const g = ref.current;
    if (!g) return;
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (!p.placed && d < 250) {
      // Placed once the area's collision grid is in, so it never ends up inside a building.
      const s = openSpot(p.x, p.z, canStand, 0.4);
      p.x = s.x; p.z = s.z; p.placed = true;
    }
    if (p.respawnT > 0) p.respawnT -= Math.min(dtRaw, 0.05);
    g.visible = p.placed && p.respawnT <= 0 && d < 160;
    if (!g.visible) return;
    g.position.set(p.x, 0.75 + Math.sin(clock.elapsedTime * 2.2) * 0.08, p.z);
    g.rotation.y = clock.elapsedTime * 1.6;
    // Walk through it to take it.
    const gs = useGame.getState();
    if (d < 1.1 && gs.explore && !gs.driving && !fighter.ko && player.pos.y < 0.5) {
      if (p.kind === "health") { if (fighter.hp >= MAX_HP) return; fighter.hp = MAX_HP; }
      else if (p.kind === "armor") { if (fighter.armor >= 100) return; fighter.armor = 100; }
      else giveWeapon(p.kind, p.rounds);
      p.respawnT = 60;
      bumpStat("pickups");
      playSound("pickup");
      showBanner(isWeapon ? WEAPONS[p.kind as WeaponId].name.toUpperCase() : LABEL[p.kind].toUpperCase(), "pass", isWeapon ? "Tab: weapon wheel · right mouse: aim · left mouse: fire · R: reload" : undefined, 1800);
    }
  });
  return (
    <group ref={ref} visible={false}>
      {isWeapon ? <Optional><PickupGun id={p.kind as WeaponId} /></Optional> : (
        <mesh><boxGeometry args={[0.42, 0.42, 0.42]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      )}
      {/* soft halo so pickups read from a distance, like GTA's glowing pickups */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.7}><ringGeometry args={[0.45, 0.62, 24]} /><meshBasicMaterial color={isWeapon ? "#ffd23f" : p.kind === "health" ? "#3cff7a" : "#5aa0ff"} transparent opacity={0.65} depthWrite={false} toneMapped={false} /></mesh>
    </group>
  );
}

function PickupGun({ id }: { id: WeaponId }) {
  const model = useWeaponModel(id);
  const s = 0.9 / Math.max(0.3, Math.min(1.25, id === "pistol" || id === "plasma" ? 0.45 : 1));
  return <primitive object={model} scale={s} rotation-z={0.2} />;
}

export function Pickups() {
  return <group>{PICKUPS.map((p) => <PickupView key={p.id} p={p} />)}</group>;
}

export function Combat() {
  return (
    <group>
      <Optional><Effects /></Optional>
      <Pickups />
    </group>
  );
}

/** Expose the current weapon for the HUD without React state churn. */
export const weaponInfo = () => currentWeapon();

class OptionalBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error("[assets] combat asset failed to load", err instanceof Error ? err.message : err); }
  render() { return this.state.failed ? null : this.props.children; }
}
const Optional = ({ children }: { children: ReactNode }) => <OptionalBoundary><Suspense fallback={null}>{children}</Suspense></OptionalBoundary>;
