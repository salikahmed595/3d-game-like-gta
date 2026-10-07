// Line of sight / bullet traces against the static world: district buildings (collision grids are solid up to
// roof-ish height), roadside props, the office shell and the ground. Cheap ray marching, good enough for gunfire.
import { gridBlocked } from "../world/grid.ts";
import { staticHit } from "../world/layout.ts";
import { OFFICE } from "./explore.ts";

const WALL_TOP = 9; // collision grids only record footprints; treat them as solid up to here
const PROP_TOP = 5;

const inOfficeShell = (x: number, y: number, z: number) =>
  y < 3 && x > OFFICE.minX - 0.15 && x < OFFICE.maxX + 0.1 && z > OFFICE.minZ - 0.15 && z < OFFICE.maxZ + 0.1 &&
  // the glass walls and doorway: only the two solid walls stop bullets
  (z < OFFICE.minZ + 0.1 || x < OFFICE.minX + 0.1);

export function solidAt(x: number, y: number, z: number): boolean {
  if (y <= 0) return true;
  if (y < WALL_TOP && gridBlocked(x, z, 0)) return true;
  if (y < PROP_TOP && staticHit(x, z, 0)) return true;
  return inOfficeShell(x, y, z);
}

/** Distance along the ray to the first solid thing (or `max`). */
export function traceWorld(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, step = 0.35): number {
  for (let d = step; d < max; d += step) {
    if (solidAt(ox + dx * d, oy + dy * d, oz + dz * d)) {
      // refine
      let lo = d - step, hi = d;
      for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (solidAt(ox + dx * m, oy + dy * m, oz + dz * m)) hi = m; else lo = m; }
      return hi;
    }
  }
  return max;
}

/** Can a shooter at A see a point B? */
export function lineClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return true;
  return traceWorld(ax, ay, az, dx / len, dy / len, dz / len, len - 0.4, 0.6) >= len - 0.4;
}
