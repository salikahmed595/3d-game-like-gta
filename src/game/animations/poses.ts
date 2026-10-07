// Procedural pose library. Offsets are Euler degrees (order XYZ) in *model-space axes* (x = character's
// left, y = up, z = forward) applied on top of the rig's rest pose, so they work regardless of how the
// source skeleton orients its local bone axes.
// The rig rests in a T-pose: arms run along the x axis. For the character's LEFT arm:
//   z < 0 lowers the arm, z > 0 raises it; y < 0 swings it forward; x pitches a forward arm downward.
// Right-side values are mirrored automatically by pair().
import type { CharacterAnimationState } from "../../types/game.ts";

export type Vec3 = [number, number, number];
export type Pose = {
  seated: boolean;
  hipsLift: number; // extra vertical motion (jumps, bounce)
  bones: Record<string, Vec3>;
  phone?: boolean;
  mug?: boolean;
};

const sin = Math.sin;
const rad = (d: number) => (d * Math.PI) / 180;

// Mirror an offset to the character's other side: rotation about the lateral axes flips sign.
const mirror = ([x, y, z]: Vec3): Vec3 => [x, -y, -z];

function pair(bones: Record<string, Vec3>, name: string, left: Vec3, right: Vec3 = mirror(left)): void {
  bones[`Left${name}`] = left;
  bones[`Right${name}`] = right;
}

const SEATED_LEGS = (bones: Record<string, Vec3>) => {
  pair(bones, "UpLeg", [-88, 0, 4]);
  pair(bones, "Leg", [88, 0, 0]);
};

// `standing`: the player is roaming, so gestures that are normally seated (phone, coffee, wave) keep the legs straight.
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Natural locomotion, blended continuously by speed (m/s): standing weight-shift → walk → jog → sprint.
 * phase advances with distance travelled (one cycle = two steps). Built from how people actually move:
 * the knee folds most just after toe-off and is nearly straight at heel strike, the body rides highest over the
 * planted foot, the pelvis turns with the swinging leg while the shoulders counter-rotate, arms swing against the
 * legs with elbows bending more as the pace rises, and the torso leans into speed.
 */
export function locomotion(speed: number, phase: number, t: number): { bones: Record<string, Vec3>; hipsLift: number } {
  const bones: Record<string, Vec3> = {};
  const k = clamp01(speed / 0.7); // 0 = standing, 1 = fully stepping
  const r = clamp01((speed - 2.4) / 3.2); // 0 = walk, 1 = sprint
  const s = sin(phase), c = Math.cos(phase);
  // Thighs (+x = back). Runners reach further forward than back.
  const A = k * lerp(22, 46, r);
  const bias = -r * 12 * k;
  bones.LeftUpLeg = [A * s + bias, 0, 1.5];
  bones.RightUpLeg = [-A * s + bias, 0, -1.5];
  // Knees: swing-phase fold (peaks ~35% into the swing), a little give in stance, more when running.
  const peak = k * lerp(58, 112, r), base = lerp(3, 16, r) * k + 2;
  const fold = (ph: number) => base + peak * Math.pow(Math.max(0, Math.cos(ph - 2.67)), 2);
  bones.LeftLeg = [fold(phase), 0, 0];
  bones.RightLeg = [fold(phase + Math.PI), 0, 0];
  // Feet: toes lift through the swing so they clear the ground.
  bones.LeftFoot = [-Math.max(0, Math.cos(phase - 2.9)) * 18 * k, 0, 0];
  bones.RightFoot = [-Math.max(0, Math.cos(phase + Math.PI - 2.9)) * 18 * k, 0, 0];
  // Body rides highest over the planted leg, lowest in double support; a sprint adds a flight bounce.
  const hipsLift = k * lerp(0.022, 0.05, r) * (Math.abs(c) - 0.55) - r * 0.04 * k;
  // Pelvis turns with the swinging leg, shoulders counter-rotate, head stays on target.
  const twist = k * lerp(5, 9, r) * s;
  bones.Hips = [0, twist, sin(phase * 2) * 1.6 * k * (1 - r)];
  const lean = lerp(2, 14, r) * k;
  bones.Spine = [lean * 0.5, -twist * 0.6, 0];
  bones.Spine2 = [lean * 0.5 + sin(t * 1.7) * 0.6, -twist * 1.1, 0];
  bones.Head = [-lean * 0.7, twist * 0.5, 0];
  // Arms swing against the legs (-x = forward for a hanging arm); elbows bend more forward and with pace.
  const B = k * lerp(16, 42, r);
  const HANG_W = -78 + r * 12;
  bones.LeftArm = [-B * s, 0, HANG_W];
  bones.RightArm = [B * s, 0, -HANG_W];
  const elbow = (fwd: number) => -(lerp(12, 82, r) + Math.max(0, fwd) * lerp(14, 22, r)); // fwd: -1 back .. 1 forward
  bones.LeftForeArm = [0, elbow(s), 0];
  bones.RightForeArm = mirror([0, elbow(-s), 0]);
  // Standing still: slow weight shift between the feet, one knee relaxed, breathing.
  if (k < 1) {
    const w = 1 - k, shift = sin(t * 0.55);
    bones.Hips = [bones.Hips[0], bones.Hips[1], bones.Hips[2] + shift * 2.2 * w];
    bones.Spine = [bones.Spine[0] + sin(t * 0.8) * 0.8 * w, bones.Spine[1], bones.Spine[2] - shift * 1.6 * w];
    bones.LeftLeg = [bones.LeftLeg[0] + Math.max(0, shift) * 7 * w, 0, 0];
    bones.RightLeg = [bones.RightLeg[0] + Math.max(0, -shift) * 7 * w, 0, 0];
    bones.LeftArm = [bones.LeftArm[0] + sin(t * 0.9) * 2 * w, 0, HANG_W];
    bones.RightArm = [bones.RightArm[0] + sin(t * 0.9 + 1) * 2 * w, 0, -HANG_W];
  }
  return { bones, hipsLift };
}

/**
 * Fingers: [0, 0, fold°] per joint. The rig works out each character's own fold axis (rig.ts curls), so the same
 * numbers close any hand. Each knuckle folds a little more than the one before it and the thumb wraps across,
 * like a real fist round a grip. k: 0 = open, ~0.2 = relaxed (a hand at rest is never flat), 1 = a firm grip.
 */
const FINGERS = ["Index", "Middle", "Ring", "Pinky"] as const;
export function grip(bones: Record<string, Vec3>, side: "Left" | "Right", k: number): void {
  FINGERS.forEach((f, i) => {
    bones[`${side}Hand${f}1`] = [0, 0, k * (58 + i * 5)];
    bones[`${side}Hand${f}2`] = [0, 0, k * (82 + i * 3)];
    bones[`${side}Hand${f}3`] = [0, 0, k * 46];
  });
  bones[`${side}HandThumb1`] = [0, 0, k * 22];
  bones[`${side}HandThumb2`] = [0, 0, k * 30];
  bones[`${side}HandThumb3`] = [0, 0, k * 28];
}

/** Hands that aren't doing anything rest half-curled (only mannequins hold their fingers dead straight). */
function relaxHands(bones: Record<string, Vec3>, k = 0.22): void {
  if (!bones.RightHandIndex1) grip(bones, "Right", k);
  if (!bones.LeftHandIndex1) grip(bones, "Left", k);
}

/**
 * Weapon arms laid over any body pose. hold: pistol / rifle; aim 0..1 (lowered → raised to the eye);
 * pitch in degrees (+ up). Right hand is the trigger hand.
 */
export function weaponArms(bones: Record<string, Vec3>, hold: "pistol" | "rifle", aim: number, pitch: number, kick = 0): void {
  const P = pitch * aim;
  const mixV = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  // The walk cycle's arm swing (x on a hanging arm): a gun arm still swings, just less — it's carrying weight.
  const swingR = bones.RightArm?.[0] ?? 0;
  if (hold === "pistol") {
    // Lowered (GTA V): gun arm relaxed at the side, a little forward, elbow soft, muzzle to the ground ahead.
    // Raised: both arms out, the support hand cupping the gun hand (isosceles stance).
    // Authored as the LEFT side and mirrored (right-arm z is positive when hanging).
    const rArm = mixV(mirror([-4 + swingR * 0.35, -4, -72]), mirror([-P, -106, -2]), aim); // both arms angle in to the centre line
    // Raised: the forearms twist so the palms face each other (thumbs up) — fingers can then wrap the grip.
    const rFore = mixV(mirror([0, -26, 0]), [-90, 4, 0], aim);
    const lArm = mixV(bones.LeftArm ?? [0, 0, -78], [-P + 5, -108, -6], aim); // support hand under the gun hand
    const lFore = mixV(bones.LeftForeArm ?? [0, -12, 0], [-90, -34, 0], aim);
    bones.RightArm = rArm; bones.RightForeArm = rFore; bones.LeftArm = lArm; bones.LeftForeArm = lFore;
    grip(bones, "Right", 1);
    grip(bones, "Left", aim > 0.5 ? 0.85 : 0.25);
  } else {
    // Low ready (GTA V): stock by the right hip, elbow back, muzzle down and across to the left; the support
    // hand under the handguard. Raised: stock in the shoulder, trigger elbow out, support arm along the barrel.
    bones.RightArm = mixV(mirror([8 + swingR * 0.15, -24, -60]), mirror([-P * 0.7, -58, -26]), aim);
    bones.RightForeArm = mixV(mirror([0, -72, 0]), mirror([0, -88, 0]), aim);
    bones.LeftArm = mixV([10, -54, -60], [-P, -84, -10], aim);
    bones.LeftForeArm = mixV([0, -48, 0], [0, -18, 0], aim);
    grip(bones, "Right", 1);
    grip(bones, "Left", 0.95); // fingers wrapped up round the handguard
  }
  // The upper body follows the aim up and down; a slight blade toward the gun side when raised.
  const sp = bones.Spine2 ?? [0, 0, 0];
  // Rifle: the chest blades toward the gun so the support shoulder comes forward (the hand can reach the handguard).
  bones.Spine2 = [sp[0] - P * 0.35 - kick * (hold === "rifle" ? 7 : 4), sp[1] - (hold === "rifle" ? 20 : 0) * aim, sp[2]]; // -y: left shoulder forward; a shot rocks the shoulders back
  const hd = bones.Head ?? [0, 0, 0];
  bones.Head = [hd[0] * (1 - aim) - P * 0.45, hd[1] * (1 - aim) - (hold === "rifle" ? 6 : 2) * aim, hd[2]];
}

export function computePose(anim: CharacterAnimationState, t: number, walkPhase: number, standing = false, speed?: number): Pose {
  const bones: Record<string, Vec3> = {};
  const breathe = sin(t * 1.7) * 0.8;
  bones.Spine2 = [breathe, 0, 0];
  bones.Head = [0, sin(t * 0.5) * 3, 0];
  let seated = false;
  let hipsLift = 0;
  let phone = false;
  let mug = false;
  const HANG = -78; // arms resting at the sides
  const lowerBody = () => {
    if (standing) pair(bones, "Arm", [0, 0, HANG]);
    else { seated = true; SEATED_LEGS(bones); pair(bones, "Arm", [58, -78, 0]); pair(bones, "ForeArm", [0, -14, 58]); }
  };

  switch (anim) {
    case "sit": {
      // Relaxed (bench): leaning back a touch, hands resting on the thighs.
      seated = true;
      SEATED_LEGS(bones);
      bones.Spine = [-4, 0, 0];
      bones.Head = [-2, sin(t * 0.35) * 10, 0];
      pair(bones, "Arm", [30, -40, HANG + 22]);
      pair(bones, "ForeArm", [0, -60, 10]);
      break;
    }
    case "drink": {
      lowerBody();
      // Lift the mug to the mouth, sip, lower slightly, sip again.
      const sip = Math.min(t / 0.6, 1) * (0.85 + Math.max(0, sin(t * 2.2)) * 0.15);
      bones.Head = [-8 * sip, 0, 0];
      pair(bones, "Arm", standing ? [0, 0, HANG] : [58, -78, 0], mirror([30 * sip, -45 * sip, HANG * (1 - sip)]));
      pair(bones, "ForeArm", standing ? [0, -6, 0] : [0, -14, 58], mirror([0, -40 * sip, 128 * sip]));
      mug = true;
      grip(bones, "Right", 0.7); // fingers round the mug
      break;
    }
    case "wave": {
      lowerBody();
      const k = Math.min(t / 0.35, 1);
      bones.Head = [-4, -8, 0];
      // A friendly wave: upper arm out a little above the shoulder, forearm up, hand swinging from the elbow
      // (not a straight arm over the head, which no one does and which tears clothing on simple rigs).
      bones.RightArm = mirror([0, -18 * k, HANG + (-HANG + 22) * k]);
      bones.RightForeArm = mirror([0, -12 * k, (88 + sin(t * 9) * 18) * k]);
      break;
    }
    case "typing": {
      seated = true;
      SEATED_LEGS(bones);
      bones.Spine = [6, 0, 0];
      bones.Head = [14, sin(t * 0.4) * 4, 0];
      const typing = anim === "typing" ? 1 : 0.15;
      pair(bones, "Arm", [58, -78, 0]);
      pair(bones, "ForeArm", [0, -14 + sin(t * 13) * 1.5 * typing, 58]);
      pair(bones, "Hand", [0, 0, -8 + sin(t * 17 + 1) * 4 * typing]);
      relaxHands(bones, 0.12); // fingers loosely over the keys
      break;
    }
    case "phone-check": {
      seated = !standing;
      if (seated) SEATED_LEGS(bones);
      bones.Spine = [4, 0, 0];
      bones.Head = [16, 8, 0];
      pair(bones, "Arm", standing ? [0, 0, HANG] : [58, -78, 0], mirror([40, -35, 0]));
      pair(bones, "ForeArm", standing ? [0, -6, 0] : [0, -14, 58], mirror([0, -30, 105]));
      phone = true;
      grip(bones, "Right", 0.5);
      break;
    }
    case "stand":
    case "idle": {
      if (standing) { Object.assign(bones, locomotion(0, 0, t).bones); break; } // weight shift, relaxed arms
      bones.Spine = [sin(t * 0.8) * 0.8, 0, 0];
      pair(bones, "Arm", [0, 0, HANG]);
      pair(bones, "ForeArm", [0, -6, 0]);
      break;
    }
    case "celebrate-small": {
      const b = Math.abs(sin(t * 7));
      hipsLift = b * 0.05;
      bones.Spine = [-4, 0, 0];
      bones.Head = [-10, 0, 0];
      pair(bones, "Arm", [0, 0, 62 + sin(t * 9) * 8]);
      pair(bones, "ForeArm", [0, 0, 10]);
      break;
    }
    case "celebrate-big": {
      const b = Math.abs(sin(t * 6));
      hipsLift = b * 0.14;
      bones.Spine = [-8, sin(t * 3) * 8, 0];
      bones.Head = [-14, 0, 0];
      pair(bones, "Arm", [0, 0, 78 + sin(t * 10) * 8]);
      pair(bones, "ForeArm", [0, 0, 8]);
      pair(bones, "UpLeg", [-10 * b, 0, 6]);
      pair(bones, "Leg", [20 * b, 0, 0]);
      break;
    }
    case "fist-pump": {
      const pump = sin(t * 8);
      hipsLift = Math.max(pump, 0) * 0.03;
      bones.Spine = [-4, 10, 0];
      pair(bones, "Arm", [0, 0, HANG], mirror([0, -25, 62 + pump * 8]));
      pair(bones, "ForeArm", [0, -6, 0], mirror([0, 0, 55 + pump * 12]));
      bones.Head = [-8, 8, 0];
      break;
    }
    case "walk":
    case "confident-walk":
    case "run": {
      const v = speed ?? (anim === "run" ? 6 : anim === "confident-walk" ? 2.6 : 1.4);
      const g = locomotion(v, walkPhase, t);
      Object.assign(bones, g.bones);
      hipsLift = g.hipsLift;
      break;
    }
    case "guard":
    case "punch-left":
    case "punch-right": {
      // Boxer's guard; a punch snaps one arm straight out and twists the torso into it.
      const bob = sin(t * 5) * 1.5;
      pair(bones, "Arm", [0, -55, -32]);
      pair(bones, "ForeArm", [0, -118, 0]);
      bones.Spine = [6 + bob, 0, 0];
      bones.Head = [4, 0, 0];
      pair(bones, "UpLeg", [-10, 0, 8]);
      pair(bones, "Leg", [16, 0, 0]);
      grip(bones, "Left", 1); grip(bones, "Right", 1); // fists
      if (anim !== "guard") {
        const k = t < 0.11 ? t / 0.11 : t < 0.2 ? 1 : Math.max(0, 1 - (t - 0.2) / 0.2);
        const side = anim === "punch-left" ? "Left" : "Right";
        const strike: Vec3 = [0, -88, -4], straight: Vec3 = [0, -8, 0];
        const arm = bones[`${side}Arm`], fore = bones[`${side}ForeArm`];
        const mix = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        bones[`${side}Arm`] = side === "Left" ? mix(arm, strike) : mix(arm, mirror(strike));
        bones[`${side}ForeArm`] = side === "Left" ? mix(fore, straight) : mix(fore, mirror(straight));
        bones.Spine = [8, (side === "Left" ? 22 : -22) * k, 0];
      }
      break;
    }
    case "jump": {
      // Tucked legs, arms up for balance.
      pair(bones, "UpLeg", [-38, 0, 6]);
      pair(bones, "Leg", [62, 0, 0]);
      pair(bones, "Arm", [0, -20, -40]);
      pair(bones, "ForeArm", [0, -50, 0]);
      bones.Spine = [8, 0, 0];
      break;
    }
    case "stagger": {
      const k = Math.min(t / 0.12, 1);
      bones.Spine = [-16 * k, sin(t * 20) * 4, 0];
      bones.Head = [-22 * k, 8, 0];
      pair(bones, "Arm", [0, 20, -40]);
      pair(bones, "ForeArm", [0, -30, 0]);
      pair(bones, "UpLeg", [10, 0, 6]);
      break;
    }
    case "down": {
      // Lying flat (the body itself is laid down by the caller): limbs loose, arms out.
      bones.Head = [-6, 20, 0];
      pair(bones, "Arm", [0, 10, -25]);
      pair(bones, "ForeArm", [0, -20, 0]);
      pair(bones, "UpLeg", [6, 0, 10]);
      pair(bones, "Leg", [12, 0, 0]);
      break;
    }
    case "victory": {
      bones.Spine = [-10, 0, 0];
      bones.Head = [-16, sin(t * 1.2) * 6, 0];
      pair(bones, "Arm", [0, 0, 82 + sin(t * 3) * 4]);
      pair(bones, "ForeArm", [0, 0, 6]);
      pair(bones, "UpLeg", [0, 0, 6]);
      hipsLift = 0.01 + sin(t * 2) * 0.005;
      break;
    }
    case "wall-punch": {
      // 0–0.5s wind-up, 0.5–0.75s strike, then hold.
      const k = Math.min(t / 0.5, 1);
      const strike = Math.min(Math.max((t - 0.5) / 0.25, 0), 1);
      bones.Spine = [4, 20 * (1 - strike) - 12 * strike, 0];
      bones.Head = [4, 0, 0];
      bones.LeftArm = [0, 0, HANG];
      const windSwing = 40 * k;
      bones.RightArm = mirror([0, windSwing * (1 - strike) + -90 * strike, HANG * (1 - strike) * k + 0 * strike + HANG * (1 - k)]);
      bones.RightForeArm = mirror([0, 0, 110 * k * (1 - strike)]);
      bones.LeftUpLeg = [-18, 0, 0];
      bones.RightUpLeg = [14, 0, 0];
      break;
    }
  }
  relaxHands(bones);
  return { seated, hipsLift, bones, phone, mug };
}

export const degToRad = rad;

// ---------------------------------------------------------------- gunshot reactions
const seg = (t: number, a: number, b: number) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const add = (bones: Record<string, Vec3>, name: string, d: Vec3, k = 1) => {
  const b = bones[name] ?? [0, 0, 0];
  bones[name] = [b[0] + d[0] * k, b[1] + d[1] * k, b[2] + d[2] * k];
};
const blend = (bones: Record<string, Vec3>, name: string, to: Vec3, k: number) => {
  const b = bones[name] ?? [0, 0, 0];
  bones[name] = [lerp(b[0], to[0], k), lerp(b[1], to[1], k), lerp(b[2], to[2], k)];
};

/**
 * The jolt of being hit: the body snaps away from the bullet (back if it came from the front), twists toward the
 * side it came from, the head whips, a leg hit buckles that knee. Fast in (60 ms), eased out over ~0.35 s.
 * Returns the hips drop (metres, negative).
 */
export function flinch(bones: Record<string, Vec3>, t: number, front: number, side: number, part: string): number {
  if (t > 0.45) return 0;
  const k = t < 0.06 ? t / 0.06 : Math.max(0, 1 - (t - 0.06) / 0.36);
  const up = part === "head" ? 1.6 : part === "leg" ? 0.4 : 1;
  add(bones, "Spine", [-front * 10 * up, side * 8, side * 4], k);
  add(bones, "Spine2", [-front * 12 * up, side * 12, 0], k);
  add(bones, "Head", [-front * (part === "head" ? 30 : 12), side * 18, side * 8], k);
  // Arms jerk out a little (reflex), then come back.
  add(bones, "LeftArm", [0, 0, 14], k); add(bones, "RightArm", [0, 0, -14], k);
  if (part === "leg") { add(bones, "LeftLeg", [30, 0, 0], k); add(bones, "LeftUpLeg", [-14, 0, 0], k); return -0.09 * k; }
  return -0.03 * k;
}

/** Hurt but alive: the left hand presses on the wound and the body hunches over it (a leg wound: a limp). */
export function clutchWound(bones: Record<string, Vec3>, part: string, amt: number, t: number, speed: number): number {
  const k = clamp01(amt);
  if (part === "leg") {
    // Favouring the leg: the hurt knee barely bends, the body dips onto the good side each step.
    add(bones, "Spine", [8, 0, sin(t * 9) * 4 * clamp01(speed)], k);
    return -0.03 * k * Math.abs(sin(t * 4.5));
  }
  const hand: Record<string, [Vec3, Vec3]> = {
    head: [[30, -40, 12], [0, -36, 126]],
    chest: [[24, -58, -34], [0, -46, 104]],
    belly: [[14, -42, -56], [0, -72, 40]],
  };
  const [arm, fore] = hand[part] ?? hand.chest;
  blend(bones, "LeftArm", arm, k);
  blend(bones, "LeftForeArm", fore, k);
  grip(bones, "Left", 0.45 * k);
  add(bones, "Spine", [10, 0, 0], k);
  add(bones, "Spine2", [8, 6, 0], k);
  add(bones, "Head", [10, 0, 0], k);
  return 0;
}

/**
 * Going down after a fatal shot (the renderer lays the whole body over by p.fall; this is everything else).
 * drop:   a headshot — the legs fold instantly, arms go limp, the body crumples where it stood.
 * fold:   a body shot — they stagger back clutching the wound, the knees buckle, then they pitch over.
 * thrown: a heavy round / blast — arms fling up, back arched, legs swept off the ground.
 * At rest, a body lies loose: arms out at odd angles, a knee bent, head turned — never a neat T.
 * Returns the hips drop (metres).
 */
export function dyingPose(bones: Record<string, Vec3>, style: string, t: number, seed: number, fall: number): number {
  const r1 = sin(seed * 12.9898) * 0.5 + 0.5, r2 = sin(seed * 78.233) * 0.5 + 0.5; // stable per body
  let kneel = 0;
  if (style === "drop") {
    kneel = seg(t, 0, 0.28);
    pair(bones, "Arm", [-10 * kneel, 0, -78 + 10 * kneel]);
    pair(bones, "ForeArm", [0, -20 * kneel, 0]);
    bones.Spine = [24 * kneel, 0, 0]; bones.Head = [30 * kneel, 12, 0];
  } else if (style === "thrown") {
    const fl = seg(t, 0, 0.18) * (1 - seg(t, 0.4, 0.8));
    pair(bones, "Arm", [-30 * fl, 20 * fl, -78 + 120 * fl]);
    pair(bones, "ForeArm", [0, -30 * fl, 0]);
    bones.Spine = [-22 * fl, 0, 0]; bones.Spine2 = [-14 * fl, 0, 0]; bones.Head = [-30 * fl, 0, 0];
    pair(bones, "UpLeg", [-35 * fl, 0, 6]); pair(bones, "Leg", [30 * fl, 0, 0]);
  } else {
    // Stagger: two short steps back, hand to the chest, then the knees go.
    const st = 1 - seg(t, 0.55, 0.8);
    const step = sin(clamp01(t / 0.6) * Math.PI * 2) * 22 * st;
    bones.LeftUpLeg = [step, 0, 3]; bones.RightUpLeg = [-step, 0, -3];
    bones.LeftLeg = [Math.max(0, step) * 1.2 + 6, 0, 0]; bones.RightLeg = [Math.max(0, -step) * 1.2 + 6, 0, 0];
    clutchWound(bones, "chest", st, t, 0);
    bones.RightArm = mirror([10 * st, -20 * st, -70]);
    kneel = seg(t, 0.55, 0.85);
    bones.Spine = [lerp(bones.Spine?.[0] ?? 0, 30, kneel), 0, 0];
    bones.Head = [lerp(bones.Head?.[0] ?? 0, 34, kneel), 10, 0];
  }
  // Knees buckling — then straightening again as the body goes over (the whole body pivots at the feet, so
  // folded legs mid-fall would leave it hovering).
  const buckle = kneel * (1 - seg(fall, 0.05, 0.6));
  if (buckle > 0) {
    blend(bones, "LeftUpLeg", [-34, 0, 8], buckle); blend(bones, "RightUpLeg", [-28, 0, -8], buckle);
    blend(bones, "LeftLeg", [62, 0, 0], buckle); blend(bones, "RightLeg", [56, 0, 0], buckle);
  }
  // On the ground: limp and loose, slightly different every time.
  const lie = seg(fall, 0.6, 1);
  if (lie > 0) {
    blend(bones, "LeftArm", [-20 + r1 * 40, 10 + r2 * 40, -30 + r2 * 50], lie);
    blend(bones, "RightArm", mirror([-10 + r2 * 30, 20 - r1 * 30, -60 + r1 * 70]), lie);
    blend(bones, "LeftForeArm", [0, -10 - r2 * 50, 0], lie); blend(bones, "RightForeArm", mirror([0, -20 - r1 * 40, 0]), lie);
    blend(bones, "LeftUpLeg", [-8 - r1 * 30, 0, 10], lie); blend(bones, "RightUpLeg", [-4, 0, -6 - r2 * 10], lie);
    blend(bones, "LeftLeg", [20 + r1 * 50, 0, 0], lie); blend(bones, "RightLeg", [6, 0, 0], lie);
    blend(bones, "Spine", [0, 0, 0], lie); blend(bones, "Spine2", [0, (r1 - 0.5) * 20, 0], lie);
    blend(bones, "Head", [0, (r2 - 0.5) * 70, (r1 - 0.5) * 20], lie);
  }
  grip(bones, "Left", 0.35); grip(bones, "Right", 0.35);
  return -0.16 * buckle;
}
