// Combat effects queue: gameplay code pushes short-lived visual events here (tracers, muzzle flashes, blood,
// sparks, explosions); world/Combat.tsx draws them from pooled meshes. Keeps systems free of three.js scenes.
export type Vec = { x: number; y: number; z: number };
export type FxEvent =
  | { kind: "tracer"; from: Vec; to: Vec; color: string; width?: number }
  | { kind: "flash"; at: Vec; color: string; size: number }
  | { kind: "blood"; at: Vec; dir: Vec; amount: number }
  | { kind: "pool"; x: number; z: number; size: number }
  | { kind: "splat"; x: number; z: number; size: number } // spatter on the ground behind someone who was shot
  | { kind: "casing"; at: Vec; dir: Vec } // a spent shell flicked out of the ejection port
  | { kind: "spark"; at: Vec; color?: string }
  | { kind: "explosion"; at: Vec; size: number }
  | { kind: "smoke"; at: Vec; dark: boolean };

export const fxQueue: FxEvent[] = [];
export function emitFx(e: FxEvent): void {
  if (fxQueue.length < 400) fxQueue.push(e);
}

/** Screen effects the HUD reads (red flash when hurt, hit marker when your shot lands). */
export const screenFx = { hurt: 0, hitMarker: 0, kill: 0, shake: 0 };
