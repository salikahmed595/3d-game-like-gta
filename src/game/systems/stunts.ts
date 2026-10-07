// Stunt jump events (drive.ts emits, missions.ts pays out): the ramp, distance flown and airtime.
export type StuntJump = { rampId: string; distance: number; airtime: number };
export const stuntListeners = new Set<(j: StuntJump) => void>();
export const emitStunt = (j: StuntJump) => stuntListeners.forEach((f) => f(j));
