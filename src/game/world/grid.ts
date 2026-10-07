// Collision grids baked by tools/blender/convert_world.py: one bit per 0.5 m cell, set where a map has geometry
// at body height. Maps are placed at an offset in the world; a point is blocked if any placed map blocks it.
export type GridFile = { cell: number; w: number; h: number; x0: number; y0: number; bits: string };
type Placed = { cell: number; w: number; h: number; x0: number; y0: number; bits: Uint8Array; ox: number; oz: number };

const placed = new Map<string, Placed>();

/** Register a map's grid at world offset (ox, oz). Blender (x, y) maps to game (x, -z). */
export function addGrid(id: string, g: GridFile, ox: number, oz: number): void {
  const raw = atob(g.bits);
  const bits = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bits[i] = raw.charCodeAt(i);
  placed.set(id, { cell: g.cell, w: g.w, h: g.h, x0: g.x0, y0: g.y0, bits, ox, oz });
}

export function removeGrid(id: string): void { placed.delete(id); }

function cellBlocked(p: Placed, x: number, z: number): boolean {
  const bx = x - p.ox, by = -(z - p.oz);
  const i = Math.floor((bx - p.x0) / p.cell), j = Math.floor((by - p.y0) / p.cell);
  if (i < 0 || j < 0 || i >= p.w || j >= p.h) return false;
  const k = j * p.w + i;
  return (p.bits[k >> 3] & (1 << (k & 7))) !== 0;
}

/** Blocked at (x, z), checking a small ring of radius r around it (body / car-corner clearance). */
export function gridBlocked(x: number, z: number, r = 0): boolean {
  for (const p of placed.values()) {
    if (cellBlocked(p, x, z)) return true;
    if (r > 0) {
      for (let a = 0; a < 8; a++) {
        const t = (a / 8) * Math.PI * 2;
        if (cellBlocked(p, x + Math.cos(t) * r, z + Math.sin(t) * r)) return true;
      }
    }
  }
  return false;
}

export const gridCount = () => placed.size;
