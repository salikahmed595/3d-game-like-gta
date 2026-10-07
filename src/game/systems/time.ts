// Game-time scale for slow motion (stunt jumps, special abilities). `world` slows everything around the player;
// `self` slows the player too (stunt-jump cam). Systems multiply their frame dt by these.
export const time = { world: 1, self: 1, worldTarget: 1, selfTarget: 1 };
/** The pause menu (Esc) freezes the world, GTA-style; time eases back in when it closes. */
export const pause = { on: false };

export function slowMo(world: number, self: number): void { time.worldTarget = world; time.selfTarget = self; }
export function normalTime(): void { time.worldTarget = 1; time.selfTarget = 1; }

/** Called once per frame (ExploreController): ease toward the targets so slow-mo ramps in and out. */
export function stepTime(dtRaw: number): void {
  if (pause.on) { time.world = 0; time.self = 0; return; }
  const k = 1 - Math.exp(-Math.min(dtRaw, 0.05) * 6);
  time.world += (time.worldTarget - time.world) * k;
  time.self += (time.selfTarget - time.self) * k;
}
