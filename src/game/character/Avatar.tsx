import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { computePose, flinch, weaponArms } from "../animations/poses.ts";
import { EMOTION_WEIGHTS } from "../animations/emotions.ts";
import type { CharacterAnimationState } from "../../types/game.ts";
import { lerpAngle, player } from "../systems/explore.ts";
import { playSound } from "../audio.ts";
import { fighter, people, playerHit } from "../systems/people.ts";
import { applyBones, applyFace, applyHips, newPoseState, prepareCharacter } from "./rig.ts";
import { characterUrl, getCharacter } from "../../../shared/characters.ts";
import { currentWeapon, gun, reloadProgress } from "../systems/weapons.ts";
import { bikeLean, drivenCar } from "../systems/drive.ts";
import { vehicleModel } from "../world/city.ts";
import type { CharacterModel } from "./rig.ts";

/** The player's rig, for things attached to the body from outside (the gun in hand). */
export const playerRig = { model: null as CharacterModel | null, root: null as THREE.Group | null, /** 0 lowered … 1 aimed (eased with the arms) */ aim: 0,
  /** Called right after each frame's pose is applied (the held gun + support-hand IK). */ afterPose: null as (() => void) | null };
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__avatar = playerRig;

const hp = new THREE.Vector3(), fp = new THREE.Vector3(), headP = new THREE.Vector3(), dirV = new THREE.Vector3(), leftV = new THREE.Vector3();
const qWorld = new THREE.Quaternion(), qHand = new THREE.Quaternion(), eHold = new THREE.Euler(0, 0, 0, "YXZ"), mLook = new THREE.Matrix4();

/**
 * Hand-held props behave like real objects, not like stickers on the hand bone: a mug stays upright (people keep
 * a drink level), handle toward the fingers, and only tips toward the mouth as it reaches the lips; a phone's
 * screen turns to face the eyes. Both sit in the palm, past the wrist.
 */
function holdProps(model: CharacterModel, root: THREE.Object3D | null, mug: THREE.Object3D, phone: THREE.Object3D) {
  const hand = model.bones.get("RightHand")?.bone, fa = model.bones.get("RightForeArm")?.bone, head = model.bones.get("Head")?.bone;
  if (!hand || !fa || !root) return;
  hand.updateWorldMatrix(true, false);
  hand.getWorldPosition(hp); fa.getWorldPosition(fp);
  dirV.subVectors(hp, fp).normalize();
  const yaw = root.rotation.y;
  leftV.set(Math.cos(yaw), 0, -Math.sin(yaw)); // the character's left
  hand.getWorldQuaternion(qHand).invert();
  if (head) head.getWorldPosition(headP); else headP.copy(hp).setY(hp.y + 0.4);
  if (mug.visible) {
    // Body of the mug just inside the curled fingers; tilt only in the last few centimetres before the mouth.
    const toMouth = THREE.MathUtils.clamp(1 - (headP.y - 0.1 - hp.y) / 0.25, 0, 1);
    eHold.set(toMouth * 0.65, yaw + Math.PI, 0);
    qWorld.setFromEuler(eHold);
    mug.quaternion.copy(qHand).multiply(qWorld);
    mug.position.copy(hp).addScaledVector(dirV, 0.05).addScaledVector(leftV, 0.05);
    hand.worldToLocal(mug.position);
  }
  if (phone.visible) {
    phone.position.copy(hp).addScaledVector(dirV, 0.07);
    mLook.lookAt(headP, phone.position, THREE.Object3D.DEFAULT_UP); // +z (the screen) toward the eyes
    qWorld.setFromRotationMatrix(mLook);
    phone.quaternion.copy(qHand).multiply(qWorld);
    hand.worldToLocal(phone.position);
  }
}

const WALK_SPEED = 1.35;
const SEAT_POS = new THREE.Vector3(0, 0, 0);
const SEAT_HIP_HEIGHT = 0.56; // chair seat (0.49) + thigh thickness

const isWalking = (a: CharacterAnimationState) => a === "walk" || a === "confident-walk";

/** The player's chosen character (server-persisted), falling back to the default. */
export function useAvatarCharacter() {
  const avatarId = useGame((s) => s.player?.avatarId ?? null);
  return getCharacter(avatarId);
}

export function Avatar({ characterId }: { characterId: string }) {
  const def = getCharacter(characterId);
  const { scene: source } = useGLTF(characterUrl(def.id));
  const root = useRef<THREE.Group>(null);
  const lay = useRef<THREE.Group>(null); // pivots about the feet when knocked out
  const model = useMemo(() => prepareCharacter(source, def.height), [source, def.height]);
  const seatedDrop = Math.max(0, model.hipHeight - SEAT_HIP_HEIGHT);

  const phone = useMemo(() => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), new THREE.MeshStandardMaterial({ color: "#111418", metalness: 0.4, roughness: 0.3 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.135), new THREE.MeshBasicMaterial({ color: "#6fd3ff" }));
    screen.position.z = 0.0065;
    m.add(screen);
    m.visible = false;
    return m;
  }, []);

  const mug = useMemo(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.095, 18), new THREE.MeshStandardMaterial({ color: "#efede8", roughness: 0.35 }));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 16), m.material);
    handle.position.x = 0.048;
    m.add(handle);
    m.visible = false;
    return m;
  }, []);

  useEffect(() => { useGame.getState().set({ avatarReady: true }); }, []);
  useEffect(() => { playerRig.model = model; playerRig.root = root.current; return () => { if (playerRig.model === model) { playerRig.model = null; playerRig.root = null; } }; }, [model]);

  useEffect(() => {
    const hand = model.bones.get("RightHand")?.bone;
    if (!hand) return;
    // Bone space is scaled by the rig root; counter-scale so held props are real-world size.
    const k = model.handScale;
    phone.scale.setScalar(k);
    phone.position.set(0, 0.06 * k, 0);
    phone.rotation.set(0, 0, Math.PI / 2);
    mug.scale.setScalar(k);
    mug.position.set(0, 0.08 * k, 0.03 * k);
    hand.add(phone, mug);
    return () => { hand.remove(phone, mug); };
  }, [model, phone, mug]);

  const state = useRef({
    t: 0, walkPhase: 0, seatedAmt: 1, lift: 0, yaw: 0, lastAnim: "" as string, animT: 0,
    pose: newPoseState(), nextBlink: 2, blinkT: -1, fall: 0, aim: 0, lastYaw: 0, roll: 0, land: 0, wasAir: false,
  });
  const tmp = useMemo(() => ({ v: new THREE.Vector3() }), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = state.current;
    const g = useGame.getState();
    const g3 = root.current;
    if (!g3) return;
    s.t += dt;
    // Inside a car you're hidden; on a motorbike you ride it.
    const ride = drivenCar();
    const riding = !!ride && !!vehicleModel(ride.model)?.bike;
    g3.visible = !g.driving || riding;

    // ---- which animation: director reaction > user emote > free-roam locomotion ----
    const exploring = g.explore;
    const idleMode = g.mode === "idle";
    let anim: CharacterAnimationState = g.anim;
    if (idleMode && g.emote) anim = g.emote;
    else if (exploring && idleMode) {
      // Street fighting and sprinting come first; then normal locomotion.
      const squaredUp = [...people.values()].some((p) => p.state === "fight" && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 4);
      if (fighter.ko) anim = "down";
      else if (fighter.attackT > 0) anim = fighter.side === 1 ? "punch-right" : "punch-left";
      else if (fighter.hurtT > 0) anim = "stagger";
      else if (player.sitting) anim = "sit";
      else if (player.pos.y > 0.08) anim = "jump";
      else if (player.speed > 0.15) anim = player.speed > 4.4 ? "run" : "walk";
      else anim = squaredUp ? "guard" : "idle";
    }
    if (exploring && anim === "typing") anim = "idle";
    if (riding) anim = "sit";

    if (anim !== s.lastAnim) { s.lastAnim = anim; s.animT = 0; }
    s.animT += dt;

    // ---- locomotion ----
    let moving = false;
    let walking = isWalking(anim);
    if (player.snap) { g3.position.copy(player.pos); s.yaw = player.yaw; g3.rotation.y = s.yaw; player.snap = false; }
    if (exploring) {
      // Player-driven: position comes from the explore system (collision already resolved).
      g3.position.copy(player.pos);
      s.yaw = player.yaw;
      moving = player.speed > 0.15;
      const before = Math.sin(s.walkPhase);
      // One gait cycle (two steps) covers more ground as the pace rises, so feet plant instead of sliding.
      const stride = THREE.MathUtils.lerp(1.45, 3.3, THREE.MathUtils.clamp((player.speed - 2.4) / 3.2, 0, 1));
      s.walkPhase += (dt * player.speed * Math.PI * 2) / stride;
      // A footstep each time a foot plants (sign change of the stride).
      if (player.pos.y <= 0 && player.speed > 0.6 && Math.sign(before) !== Math.sign(Math.sin(s.walkPhase))) playSound("step");
      if (!moving && walking) walking = false;
      g3.rotation.y = lerpAngle(g3.rotation.y, s.yaw, 1 - Math.exp(-dt * 14));
      // Lean into turns at speed (body roll), and dip on landing from a jump.
      const yawRate = Math.atan2(Math.sin(g3.rotation.y - s.lastYaw), Math.cos(g3.rotation.y - s.lastYaw)) / Math.max(dt, 1e-3);
      s.lastYaw = g3.rotation.y;
      s.roll = THREE.MathUtils.lerp(s.roll, THREE.MathUtils.clamp(-yawRate * player.speed * 0.012, -0.16, 0.16), 1 - Math.exp(-dt * 6));
      const air = player.pos.y > 0.05;
      if (s.wasAir && !air) s.land = 1;
      s.wasAir = air;
      s.land = Math.max(0, s.land - dt * 4);
    } else {
      const goal = g.walkTarget && !g.seated ? tmp.v.set(g.walkTarget.x, 0, g.walkTarget.z) : SEAT_POS;
      const dist = g3.position.distanceTo(goal);
      if (walking && dist > 0.04) {
        const step = Math.min(WALK_SPEED * dt, dist);
        const dx = (goal.x - g3.position.x) / dist, dz = (goal.z - g3.position.z) / dist;
        g3.position.x += dx * step; g3.position.z += dz * step;
        s.yaw = Math.atan2(dx, dz);
        s.walkPhase += dt * 7.5;
        moving = true;
      } else if (!walking) {
        g3.position.lerp(goal, 1 - Math.exp(-dt * 4));
        s.yaw = lerpAngle(s.yaw, g.walkTarget && !g.seated ? g.walkTarget.yaw : 0, 1 - Math.exp(-dt * 5));
      }
      g3.rotation.y = lerpAngle(g3.rotation.y, s.yaw, 1 - Math.exp(-dt * 8));
    }
    if (riding && ride) {
      // In the saddle: sits over the rear wheel and leans with the bike.
      g3.position.set(ride.x - Math.sin(ride.yaw) * 0.25, ride.y + 0.3, ride.z - Math.cos(ride.yaw) * 0.25);
      g3.rotation.y = ride.yaw;
      s.roll = bikeLean(ride);
    }

    // ---- pose ----
    const pose = computePose(moving || !walking ? anim : "idle", anim === "idle" ? s.t : s.animT, s.walkPhase, exploring && !player.sitting, exploring ? player.speed : undefined);
    if (riding) {
      // Hands on the bars, knees gripping the tank, leaning over the front.
      pose.bones.LeftArm = [28, -62, -26]; pose.bones.RightArm = [28, 62, 26];
      pose.bones.LeftForeArm = [0, -24, 0]; pose.bones.RightForeArm = [0, 24, 0];
      pose.bones.LeftUpLeg = [-62, 0, 8]; pose.bones.RightUpLeg = [-62, 0, -8];
      pose.bones.LeftLeg = [78, 0, 0]; pose.bones.RightLeg = [78, 0, 0];
      pose.bones.Spine = [16, 0, 0]; pose.bones.Head = [-14, 0, 0];
    }
    // Holding a gun: arms (and upper body pitch) come from the weapon pose, legs keep walking.
    const w = currentWeapon();
    // Raised while aiming, firing, and for a moment after a hip-fired shot (GTA keeps the gun up); half-raised in
    // front of the chest while reloading.
    const reloading = reloadProgress() > 0;
    s.aim = THREE.MathUtils.lerp(s.aim, gun.aiming || gun.trigger || gun.sinceShot < 0.7 ? 1 : reloading ? 0.55 : 0, 1 - Math.exp(-dt * 14));
    playerRig.aim = s.aim;
    if (exploring && gun.held && w.hold !== "none" && anim !== "down" && anim !== "sit") weaponArms(pose.bones, w.hold, s.aim, THREE.MathUtils.radToDeg(gun.pitch) + gun.kick * (w.hold === "rifle" ? 6 : 14) - (reloading ? 25 : 0), gun.kick);
    // Hit by a bullet: the same jolt NPCs get.
    if (exploring) pose.hipsLift += flinch(pose.bones, playerHit.t, playerHit.front, playerHit.side, "chest");
    if (s.land > 0) { pose.hipsLift -= s.land * 0.08; pose.bones.LeftLeg = [(pose.bones.LeftLeg?.[0] ?? 0) + s.land * 30, 0, 0]; pose.bones.RightLeg = [(pose.bones.RightLeg?.[0] ?? 0) + s.land * 30, 0, 0]; pose.bones.LeftUpLeg = [(pose.bones.LeftUpLeg?.[0] ?? 0) - s.land * 18, 0, 0]; pose.bones.RightUpLeg = [(pose.bones.RightUpLeg?.[0] ?? 0) - s.land * 18, 0, 0]; }
    s.fall = THREE.MathUtils.lerp(s.fall, fighter.ko ? 1 : 0, 1 - Math.exp(-dt * (fighter.ko ? 7 : 2)));
    if (lay.current) {
      lay.current.rotation.x = -s.fall * (Math.PI / 2);
      lay.current.rotation.z = exploring ? s.roll : 0;
      lay.current.position.y = (s.fall * 0.12) / model.scale;
    }
    s.seatedAmt = THREE.MathUtils.lerp(s.seatedAmt, pose.seated ? 1 : 0, 1 - Math.exp(-dt * 6));
    s.lift = THREE.MathUtils.lerp(s.lift, pose.hipsLift, 1 - Math.exp(-dt * 14));
    phone.visible = !!pose.phone;
    mug.visible = !!pose.mug;
    applyBones(model, pose.bones, s.pose, 1 - Math.exp(-dt * (anim.startsWith("punch") ? 24 : 9)));
    applyHips(model, -seatedDrop * s.seatedAmt + s.lift);
    if (mug.visible || phone.visible) holdProps(model, root.current, mug, phone);
    if (exploring) playerRig.afterPose?.();

    // ---- facial emotion (gradual blend) + blinking ----
    s.nextBlink -= dt;
    if (s.nextBlink <= 0 && s.blinkT < 0) { s.blinkT = 0; s.nextBlink = 2 + Math.random() * 3; }
    let blink = 0;
    if (s.blinkT >= 0) { s.blinkT += dt; blink = Math.sin(Math.min(s.blinkT / 0.16, 1) * Math.PI); if (s.blinkT > 0.16) s.blinkT = -1; }
    applyFace(model, EMOTION_WEIGHTS[g.emotion], blink, s.pose, 1 - Math.exp(-dt * 6));
  });

  return (
    <group ref={root} scale={model.scale}>
      <group ref={lay}>
        <group position-y={model.offsetY / model.scale}>
          <primitive object={model.scene} />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload(characterUrl(getCharacter(null).id));
