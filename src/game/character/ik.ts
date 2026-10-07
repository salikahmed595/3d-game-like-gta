// Two-bone inverse kinematics (shoulder → elbow → wrist), applied after the procedural pose: it bends the arm so
// the hand lands exactly on a point (the support hand on a rifle's handguard, on a pistol grip). Works in world
// space on the live bones, so it doesn't care how a rig's bone axes are oriented; the pose's elbow direction is
// kept as the bend plane, so elbows still point where a person's would (down and out).
import * as THREE from "three";

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), t = new THREE.Vector3();
const u = new THREE.Vector3(), v = new THREE.Vector3(), w1 = new THREE.Vector3(), w2 = new THREE.Vector3(), axis = new THREE.Vector3();
const q = new THREE.Quaternion(), qw = new THREE.Quaternion(), qp = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Rotate `bone` by a world-space rotation `delta` (children follow). */
function rotateWorld(bone: THREE.Object3D, delta: THREE.Quaternion) {
  bone.getWorldQuaternion(qw);
  if (bone.parent) bone.parent.getWorldQuaternion(qp); else qp.identity();
  bone.quaternion.copy(qp.invert().multiply(delta).multiply(qw)); // new local = parentWorld⁻¹ · delta · world
  bone.updateMatrixWorld(true);
}

/** `from` turned about `axis` by ±ang — whichever lands closer to `near` (stay on the same side of the bend). */
function turnToward(from: THREE.Vector3, ang: number, near: THREE.Vector3, out: THREE.Vector3) {
  w1.copy(from).applyAxisAngle(axis, ang);
  w2.copy(from).applyAxisAngle(axis, -ang);
  return out.copy(w1.dot(near) >= w2.dot(near) ? w1 : w2);
}

/**
 * Move the chain upper → lower → end so `end` reaches `target` (world), blended by `weight` (0..1).
 * Out-of-reach targets are approached as far as the arm stretches.
 */
export function twoBoneIK(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, weight = 1): void {
  if (weight <= 0.001) return;
  upper.updateWorldMatrix(true, true);
  upper.getWorldPosition(a); lower.getWorldPosition(b); end.getWorldPosition(c);
  t.copy(c).lerp(target, Math.min(1, weight));
  const lab = b.distanceTo(a), lbc = c.distanceTo(b);
  const lat = THREE.MathUtils.clamp(t.distanceTo(a), Math.abs(lab - lbc) + 1e-3, lab + lbc - 1e-3);
  // Bend plane from the pose (where the elbow already points); "elbow down" if the arm is dead straight.
  u.subVectors(c, a); v.subVectors(b, a);
  axis.crossVectors(u, v);
  if (axis.lengthSq() < 1e-8) axis.crossVectors(u, DOWN);
  axis.normalize();
  // 1. Elbow: open / close it to the angle that puts the wrist `lat` from the shoulder (law of cosines).
  const wantB = Math.acos(THREE.MathUtils.clamp((lab * lab + lbc * lbc - lat * lat) / (2 * lab * lbc), -1, 1));
  u.subVectors(a, b).normalize(); // elbow → shoulder
  v.subVectors(c, b).normalize(); // elbow → wrist (now)
  rotateWorld(lower, q.setFromUnitVectors(v, turnToward(u, wantB, v, new THREE.Vector3())));
  // 2. Swing the whole arm about the shoulder so the wrist points at the target.
  end.getWorldPosition(c);
  u.subVectors(c, a).normalize();
  v.subVectors(t, a).normalize();
  rotateWorld(upper, q.setFromUnitVectors(u, v));
}
