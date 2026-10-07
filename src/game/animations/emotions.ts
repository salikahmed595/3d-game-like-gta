// ARKit blendshape recipes for each emotion. Weights blend gradually in the Avatar; never snap.
import type { CharacterEmotion } from "../../types/game.ts";

export type MorphWeights = Record<string, number>;

const sym = (name: string, v: number): MorphWeights => ({ [`${name}Left`]: v, [`${name}Right`]: v });
const merge = (...parts: MorphWeights[]): MorphWeights => Object.assign({}, ...parts);

export const EMOTION_WEIGHTS: Record<CharacterEmotion, MorphWeights> = {
  neutral: {},
  focused: merge(sym("eyeSquint", 0.3), sym("browDown", 0.45), sym("mouthPress", 0.2)),
  excited: merge({ browInnerUp: 0.5, jawOpen: 0.2 }, sym("browOuterUp", 0.5), sym("eyeWide", 0.4), sym("mouthSmile", 0.75), sym("cheekSquint", 0.3)),
  happy: merge(sym("mouthSmile", 0.85), sym("cheekSquint", 0.55), sym("eyeSquint", 0.25), { browInnerUp: 0.1 }),
  proud: merge(sym("mouthSmile", 0.4), sym("cheekSquint", 0.15), { browInnerUp: 0.12, mouthClose: 0.1 }),
  frustrated: merge(sym("mouthFrown", 0.6), sym("browDown", 0.65), sym("mouthPress", 0.4), sym("noseSneer", 0.2)),
  surprised: merge({ browInnerUp: 0.85, jawOpen: 0.4 }, sym("eyeWide", 1), sym("browOuterUp", 0.8)),
  determined: merge(sym("browDown", 0.5), sym("eyeSquint", 0.25), sym("mouthPress", 0.5), { jawForward: 0.12 }),
};
