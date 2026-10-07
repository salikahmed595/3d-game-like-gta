// Rig-agnostic character driver shared by the player avatar and NPCs.
// Every converted character uses the same bone names (tools/blender/convert_characters.py), but rest poses,
// bone axes and node transforms differ (T-pose vs A-pose, FBX unit scales, rotated roots). Everything here is
// measured relative to the character's own scene root, so poses authored in model space drive any rig.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { degToRad } from "../animations/poses.ts";
import type { Pose, Vec3 } from "../animations/poses.ts";
import type { MorphWeights } from "../animations/emotions.ts";

type BoneRig = { bone: THREE.Bone; restLocal: THREE.Quaternion; restRel: THREE.Quaternion; restRelInv: THREE.Quaternion };

/** A face shape key and the ARKit recipe names that drive it (aliases cover simpler faces). */
type FaceBinding = { mesh: THREE.Mesh; index: number; from: string[]; mode: "avg" | "max" };

export type CharacterModel = {
  scene: THREE.Object3D;
  bones: Map<string, BoneRig>;
  /** A-pose → T-pose correction for the upper arms (poses are authored for a T-pose). */
  fixes: Map<string, THREE.Quaternion>;
  /** Per finger bone: the model-space axis that curls it toward the palm (poses give finger bones [0, 0, curl°]). */
  curls: Map<string, THREE.Vector3>;
  scale: number;
  offsetY: number;
  /** Standing hip height in metres (after scaling). */
  hipHeight: number;
  hips?: { bone: THREE.Bone; rest: THREE.Vector3; upPerMetre: THREE.Vector3 };
  /** Multiply a real-world size by this to get a size in RightHand-bone space. */
  handScale: number;
  face: FaceBinding[];
  meshes: THREE.Mesh[];
};

// Faces with fewer shapes (e.g. only mouthSmile / mouthOpen / eyesClosed) still react.
const ALIASES: Record<string, { from: string[]; mode: "avg" | "max" }> = {
  mouthSmile: { from: ["mouthSmileLeft", "mouthSmileRight"], mode: "avg" },
  mouthOpen: { from: ["jawOpen"], mode: "max" },
  eyesClosed: { from: ["eyeBlinkLeft", "eyeBlinkRight"], mode: "max" },
};

const rel = (scene: THREE.Object3D, o: THREE.Object3D) => new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(o.matrixWorld);

/** Clone (so rest poses are never captured from an already-posed instance) and measure a character. */
export function prepareCharacter(source: THREE.Object3D, height: number): CharacterModel {
  const scene = cloneSkinned(source);
  scene.position.set(0, 0, 0);
  scene.updateMatrixWorld(true);

  const bones = new Map<string, BoneRig>();
  const q = new THREE.Quaternion();
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; meshes.push(m); }
    if (!(o as THREE.Bone).isBone) return;
    const bone = o as THREE.Bone;
    rel(scene, bone).decompose(new THREE.Vector3(), q, new THREE.Vector3());
    if (!bones.has(bone.name)) bones.set(bone.name, { bone, restLocal: bone.quaternion.clone(), restRel: q.clone(), restRelInv: q.clone().invert() });
  });

  const pos = (name: string) => {
    const b = bones.get(name)?.bone;
    return b ? new THREE.Vector3().setFromMatrixPosition(rel(scene, b)) : null;
  };

  // Upper arms: rotation that takes the rest direction (shoulder→elbow) to the T-pose direction (±X).
  const fixes = new Map<string, THREE.Quaternion>();
  for (const [arm, fore, sign] of [["LeftArm", "LeftForeArm", 1], ["RightArm", "RightForeArm", -1]] as const) {
    const a = pos(arm), f = pos(fore);
    if (!a || !f) continue;
    const dir = f.sub(a).normalize();
    const target = new THREE.Vector3(sign, 0, 0);
    if (dir.angleTo(target) > degToRad(4)) fixes.set(arm, new THREE.Quaternion().setFromUnitVectors(dir, target));
  }

  // Finger curl axes, measured from this rig's own hand (rest pose, model space): rigs disagree on how a hand is
  // turned, so "close the fist" is worked out per character instead of assumed. For each finger segment the axis
  // turns the segment toward the palm; for the thumb, across the palm toward the little finger.
  const curls = new Map<string, THREE.Vector3>();
  for (const side of ["Left", "Right"] as const) {
    const hand = pos(`${side}Hand`), index = pos(`${side}HandIndex1`), pinky = pos(`${side}HandPinky1`), mid = pos(`${side}HandMiddle1`);
    if (!hand || !index || !pinky || !mid) continue;
    const across = pinky.clone().sub(index).normalize(); // index → little finger
    const out = mid.clone().sub(hand).normalize(); // wrist → knuckles
    // Palm normal: perpendicular to both, on the palm side (the side the fingers fold to). The sign follows from the
    // hand's handedness: index → pinky crossed with wrist → knuckles points out of the palm on a right hand.
    const palm = new THREE.Vector3().crossVectors(across, out).normalize();
    if (side === "Left") palm.negate();
    for (const f of ["Index", "Middle", "Ring", "Pinky", "Thumb"]) {
      const j = [1, 2, 3].map((i) => pos(`${side}Hand${f}${i}`));
      for (let i = 0; i < 3; i++) {
        const a = j[i], b = j[i + 1] ?? j[i], prev = j[i - 1];
        if (!a) continue;
        const dir = (b && b !== a ? b.clone().sub(a) : prev ? a.clone().sub(prev) : out.clone()).normalize();
        // Fingers fold toward the palm; the thumb folds across it (toward the little finger and into the palm).
        const toward = f === "Thumb" ? across.clone().add(palm).normalize() : palm;
        const axis = new THREE.Vector3().crossVectors(dir, toward);
        if (axis.lengthSq() > 1e-6) curls.set(`${side}Hand${f}${i + 1}`, axis.normalize());
      }
    }
  }

  const box = new THREE.Box3().setFromObject(scene);
  const h = Math.max(box.max.y - box.min.y, 0.001);
  const scale = height / h;
  const offsetY = -box.min.y * scale;

  let hips: CharacterModel["hips"];
  let hipHeight = height * 0.53;
  const hb = bones.get("Hips")?.bone;
  if (hb?.parent) {
    // A world-up offset of 1 m expressed in the Hips' parent space (handles rotated / unit-scaled roots).
    const parentLinear = new THREE.Matrix3().setFromMatrix4(rel(scene, hb.parent)).invert();
    const upPerMetre = new THREE.Vector3(0, 1 / scale, 0).applyMatrix3(parentLinear);
    hips = { bone: hb, rest: hb.position.clone(), upPerMetre };
    const hp = pos("Hips");
    if (hp) hipHeight = (hp.y - box.min.y) * scale;
  }

  const hand = bones.get("RightHand")?.bone;
  const handWorldScale = hand ? new THREE.Vector3().setFromMatrixScale(rel(scene, hand)).x : 1;
  const handScale = 1 / (handWorldScale * scale);

  const face: FaceBinding[] = [];
  for (const mesh of meshes) {
    const dict = mesh.morphTargetDictionary;
    if (!dict || !mesh.morphTargetInfluences) continue;
    for (const [name, index] of Object.entries(dict)) {
      const alias = ALIASES[name];
      face.push(alias ? { mesh, index, ...alias } : { mesh, index, from: [name], mode: "max" });
    }
  }

  return { scene, bones, fixes, curls, scale, offsetY, hipHeight, hips, handScale, face, meshes };
}

export type PoseState = { deltas: Map<string, THREE.Quaternion>; weights: Map<THREE.Mesh, Float32Array> };
export const newPoseState = (): PoseState => ({ deltas: new Map(), weights: new Map() });

const tmpE = new THREE.Euler();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();

/** Blend bones toward `targets` (model-space Euler degrees on top of a T-pose rest). */
export function applyBones(model: CharacterModel, targets: Record<string, Vec3>, state: PoseState, blend: number): void {
  const names = new Set([...Object.keys(targets), ...state.deltas.keys(), ...model.fixes.keys()]);
  for (const name of names) {
    const r = model.bones.get(name);
    if (!r) continue;
    const t = targets[name] ?? [0, 0, 0];
    const curl = model.curls.get(name);
    if (curl) tmpQ.setFromAxisAngle(curl, degToRad(t[2])); // fingers: z = how far the joint folds into the palm
    else { tmpE.set(degToRad(t[0]), degToRad(t[1]), degToRad(t[2]), "XYZ"); tmpQ.setFromEuler(tmpE); }
    let cur = state.deltas.get(name);
    if (!cur) { cur = new THREE.Quaternion(); state.deltas.set(name, cur); }
    cur.slerp(tmpQ, blend);
    // local = restLocal · (restRel⁻¹ · D · Fix · restRel): a model-axis offset expressed in bone space.
    tmpQ2.copy(cur);
    const fix = model.fixes.get(name);
    if (fix) tmpQ2.multiply(fix);
    r.bone.quaternion.copy(r.restLocal).multiply(tmpQ.copy(r.restRelInv).multiply(tmpQ2).multiply(r.restRel));
  }
}

/** Raise/lower the hips by `metres` (sitting, jumps). */
export function applyHips(model: CharacterModel, metres: number): void {
  if (!model.hips) return;
  model.hips.bone.position.copy(model.hips.rest).addScaledVector(model.hips.upPerMetre, metres);
}

/** Ease face shapes toward an ARKit recipe; `blink` (0..1) overrides the eyelids. */
export function applyFace(model: CharacterModel, recipe: MorphWeights, blink: number, state: PoseState, rate: number): void {
  for (const f of model.face) {
    const infl = f.mesh.morphTargetInfluences;
    if (!infl) continue;
    let w = state.weights.get(f.mesh);
    if (!w) { w = new Float32Array(infl.length); state.weights.set(f.mesh, w); }
    let target = 0;
    for (const n of f.from) target = f.mode === "avg" ? target + (recipe[n] ?? 0) / f.from.length : Math.max(target, recipe[n] ?? 0);
    w[f.index] += (target - w[f.index]) * rate;
    const isLid = f.from.some((n) => n === "eyeBlinkLeft" || n === "eyeBlinkRight");
    infl[f.index] = isLid ? Math.max(w[f.index], blink) : w[f.index];
  }
}

/** Convenience: pose + hips in one call for simple drivers (NPCs). */
export function applyPose(model: CharacterModel, pose: Pose, hipsMetres: number, state: PoseState, blend: number): void {
  applyBones(model, pose.bones, state, blend);
  applyHips(model, hipsMetres);
}
