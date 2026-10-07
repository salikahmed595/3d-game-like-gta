export type CharacterAnimationState =
  | "idle" | "walk" | "sit" | "stand" | "phone-check" | "typing" | "celebrate-small"
  | "celebrate-big" | "fist-pump" | "confident-walk" | "victory" | "wall-punch" | "drink" | "wave"
  // open world: running, fist fights, being knocked over
  | "run" | "guard" | "punch-left" | "punch-right" | "stagger" | "down" | "jump";

export type CharacterEmotion =
  | "neutral" | "focused" | "excited" | "happy" | "proud" | "frustrated" | "surprised" | "determined";

export type GameMode = "idle" | "sale-reaction" | "celebration" | "upgrade" | "boss-battle" | "cinematic";

export type CameraShot = "default" | "sale" | "orbit" | "upgrade" | "boss" | "building";

export type BurstKind = "sale" | "confetti" | "dust" | "xp";
export type Burst = { id: number; kind: BurstKind; intensity: number; origin: [number, number, number] };

export type Toast = {
  id: number;
  title: string;
  amount?: string;
  lines: string[];
  tone: "sale" | "level" | "upgrade" | "trophy" | "boss" | "info";
};
