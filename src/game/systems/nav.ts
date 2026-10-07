// Grid A* for vehicles: plans a drivable route between two points on a coarse grid (cells sampled with the same
// collision checks the cars use). Used by the police to find their way through district streets.
import { canDrive } from "./explore.ts";
import { staticHit } from "../world/layout.ts";

const CELL = 4;
const cache = new Map<number, boolean>();
let cacheAt = 0;

const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
function free(i: number, j: number): boolean {
  const k = key(i, j);
  let v = cache.get(k);
  if (v === undefined) {
    const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
    v = canDrive(x, z, 1.1) && !staticHit(x, z, 1.4);
    cache.set(k, v);
  }
  return v;
}

/** Waypoints from (ax, az) to (bx, bz), or null if no route within `maxNodes` expansions. */
export function planRoute(ax: number, az: number, bx: number, bz: number, maxNodes = 6000): { x: number; z: number }[] | null {
  const now = performance.now();
  if (now - cacheAt > 4000 || cache.size > 200000) { cache.clear(); cacheAt = now; }
  const si = Math.floor(ax / CELL), sj = Math.floor(az / CELL);
  let gi = Math.floor(bx / CELL), gj = Math.floor(bz / CELL);
  // The goal may sit on a blocked cell (the player next to a wall): use the nearest free neighbour.
  if (!free(gi, gj)) {
    let found = false;
    for (let r = 1; r < 4 && !found; r++) for (let di = -r; di <= r && !found; di++) for (let dj = -r; dj <= r && !found; dj++) {
      if (free(gi + di, gj + dj)) { gi += di; gj += dj; found = true; }
    }
    if (!found) return null;
  }
  const h = (i: number, j: number) => Math.hypot(i - gi, j - gj);
  const open: [number, number, number][] = [[h(si, sj), si, sj]]; // f, i, j  (binary heap on f)
  const g = new Map<number, number>([[key(si, sj), 0]]);
  const from = new Map<number, number>();
  const push = (n: [number, number, number]) => {
    open.push(n);
    let c = open.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break; [open[p], open[c]] = [open[c], open[p]]; c = p; }
  };
  const pop = () => {
    const top = open[0], last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let c = 0;
      for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === c) break; [open[m], open[c]] = [open[c], open[m]]; c = m; }
    }
    return top;
  };
  let expanded = 0;
  while (open.length && expanded++ < maxNodes) {
    const [, i, j] = pop();
    if (i === gi && j === gj) {
      const path: { x: number; z: number }[] = [];
      let k = key(i, j);
      while (k !== key(si, sj)) {
        const ci = Math.floor(k / 8192) - 4096, cj = (k % 8192) - 4096;
        path.push({ x: (ci + 0.5) * CELL, z: (cj + 0.5) * CELL });
        k = from.get(k)!;
      }
      return path.reverse().filter((_, n, arr) => n % 2 === 1 || n === arr.length - 1); // thin out
    }
    const base = g.get(key(i, j))!;
    for (const [di, dj, cost] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]] as const) {
      const ni = i + di, nj = j + dj;
      if (!free(ni, nj)) continue;
      if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue; // no corner cutting
      const nk = key(ni, nj), ng = base + cost;
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); from.set(nk, key(i, j)); push([ng + h(ni, nj), ni, nj]); }
    }
  }
  return null;
}
