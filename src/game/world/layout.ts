// The open world: a 10 x 10 km island built around the office. Districts are the user's own city maps (converted
// by tools/blender/convert_world.py) placed across the island and joined by a highway network: the "Empire Loop"
// ring for flat-out racing, two cross highways through the middle, and a connector road into every district.
// Everything here is deterministic (seeded), so the radar, collisions, traffic and missions all agree.
import { MAPS, DOWNTOWN } from "./city.ts";
import type { MapDef } from "./city.ts";

export const WORLD_HALF = 5000; // metres: the island spans -5000..5000 on both axes
export const RING = 4300; // Empire Loop half-size
const RING_CORNER = 650;
export const NS_X = 110; // north–south highway (east of Downtown)
export const EW_Z = -160; // east–west highway (north of Downtown)
export const DOWNTOWN_OX = -55;

export type District = MapDef & { key: string };

const base = (id: string) => MAPS.find((m) => m.id === id) ?? DOWNTOWN;
const place = (id: string, key: string, name: string, x: number, z: number): District =>
  ({ ...base(id), key, name, ox: x, oz: z, roads: id === "downtown" ? DOWNTOWN.roads : [] });

export const DISTRICTS: District[] = [
  // Downtown sits 55 m west so the office lands in the open strip by its east edge: a straight drive out to the
  // highways (in the city model's own layout the office lot is boxed in by buildings).
  place("downtown", "downtown", "Downtown", DOWNTOWN_OX, 0),
  place("towers", "tower-district", "Tower District", 1400, -900),
  place("blocks", "old-blocks", "Old Blocks", -1300, 700),
  place("oldstreet", "old-street", "Old Street", 600, 1500),
  place("postwar", "postwar", "Postwar City", -1500, -1600),
  place("wasteland", "wasteland", "Wasteland", 3600, 600),
  place("towers", "skyline", "Skyline Heights", -3200, 2600),
  place("blocks", "harbor", "Harbor Blocks", 2900, 3100),
  place("oldstreet", "market-lane", "Market Lane", -2400, -2700),
  place("postwar", "ruins-east", "Ruins East", 3300, -3100),
  place("wasteland", "dust-flats", "Dust Flats", -3700, -300),
  place("towers", "north-towers", "North Towers", 1800, -3500),
  place("blocks", "riverside", "Riverside", -600, 3600),
  // The user's Havana street kit lines the north side of Empire Avenue, right outside the office: its main street
  // opens onto the avenue. The police station faces it from the south side (POLICE_STATION below).
  place("havana", "havana", "Havana Street", 62, -42),
];
export const districtByKey = (key: string) => DISTRICTS.find((d) => d.key === key);

export function districtAt(x: number, z: number, margin = 0): District | null {
  for (const d of DISTRICTS) {
    const b = d.bounds;
    if (x >= d.ox + b.minX - margin && x <= d.ox + b.maxX + margin && z >= d.oz + b.minZ - margin && z <= d.oz + b.maxZ + margin) return d;
  }
  return null;
}

// ---------------------------------------------------------------- roads
export type RoadKind = "highway" | "road";
export type RoadPath = {
  id: string; name: string; kind: RoadKind;
  pts: [number, number][]; loop: boolean;
  width: number; lanes: number; // lanes per direction
  speed: number; // traffic cruise speed, m/s
  y: number; // draw height (overlaps at junctions are layered instead of z-fighting)
};

function ringPoints(): [number, number][] {
  const pts: [number, number][] = [];
  const R = RING, c = RING_CORNER;
  // Corners as quarter arcs, walked clockwise when seen from above (+x east, +z south).
  const corners: [number, number, number][] = [[R - c, -R + c, -Math.PI / 2], [R - c, R - c, 0], [-R + c, R - c, Math.PI / 2], [-R + c, -R + c, Math.PI]];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (i / 10) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * c, cz + Math.sin(a) * c]);
    }
  }
  return pts;
}

/** Straight connector from a district edge to the nearest highway (axis aligned, so it never cuts a corner). */
function connector(d: District): RoadPath | null {
  if (d.key === "downtown" || d.key === "havana") return null; // both open straight onto Empire Avenue
  const b = d.bounds;
  const options: { len: number; pts: [number, number][] }[] = [];
  const edgeX = (dir: 1 | -1) => d.ox + (dir > 0 ? b.maxX : b.minX) + dir * 2;
  const edgeZ = (dir: 1 | -1) => d.oz + (dir > 0 ? b.maxZ : b.minZ) + dir * 2;
  for (const lineX of [NS_X, RING, -RING]) {
    const dir = lineX > d.ox ? 1 : -1;
    const from = edgeX(dir);
    if (Math.abs(d.oz) < RING - RING_CORNER) options.push({ len: Math.abs(lineX - from), pts: [[from, d.oz], [lineX, d.oz]] });
  }
  for (const lineZ of [EW_Z, RING, -RING]) {
    const dir = lineZ > d.oz ? 1 : -1;
    const from = edgeZ(dir);
    if (Math.abs(d.ox) < RING - RING_CORNER) options.push({ len: Math.abs(lineZ - from), pts: [[d.ox, from], [d.ox, lineZ]] });
  }
  options.sort((a, b2) => a.len - b2.len);
  const best = options[0];
  if (!best) return null;
  return { id: `to-${d.key}`, name: `${d.name} Road`, kind: "road", pts: best.pts, loop: false, width: 10, lanes: 1, speed: 15, y: 0.05 };
}

export const ROADS: RoadPath[] = [
  { id: "ring", name: "Empire Loop", kind: "highway", pts: ringPoints(), loop: true, width: 18, lanes: 2, speed: 31, y: 0.03 },
  { id: "ns", name: "North–South Highway", kind: "highway", pts: [[NS_X, -RING], [NS_X, RING]], loop: false, width: 18, lanes: 2, speed: 29, y: 0.04 },
  { id: "ew", name: "East–West Highway", kind: "highway", pts: [[-RING, EW_Z], [RING, EW_Z]], loop: false, width: 18, lanes: 2, speed: 29, y: 0.035 },
  // Downtown's exit: from the office straight east onto the North–South Highway.
  { id: "dt-east", name: "Empire Avenue", kind: "road", pts: [[DOWNTOWN_OX + 75, 0], [NS_X, 0]], loop: false, width: 10, lanes: 1, speed: 12, y: 0.05 },
  ...DISTRICTS.map(connector).filter((r): r is RoadPath => !!r),
];

// ---------------------------------------------------------------- road queries (spatial hash of segments)
type Seg = { road: RoadPath; ax: number; az: number; bx: number; bz: number; s0: number; len: number };
const CELL = 200;
const segHash = new Map<string, Seg[]>();
const keyOf = (i: number, j: number) => `${i},${j}`;

export const roadLength = new Map<string, number>();
for (const road of ROADS) {
  const n = road.pts.length;
  let s = 0;
  const count = road.loop ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const [ax, az] = road.pts[i], [bx, bz] = road.pts[(i + 1) % n];
    const len = Math.hypot(bx - ax, bz - az);
    const seg: Seg = { road, ax, az, bx, bz, s0: s, len };
    s += len;
    const pad = road.width;
    const i0 = Math.floor((Math.min(ax, bx) - pad) / CELL), i1 = Math.floor((Math.max(ax, bx) + pad) / CELL);
    const j0 = Math.floor((Math.min(az, bz) - pad) / CELL), j1 = Math.floor((Math.max(az, bz) + pad) / CELL);
    for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) {
      const k = keyOf(ii, jj);
      const list = segHash.get(k) ?? [];
      list.push(seg);
      segHash.set(k, list);
    }
  }
  roadLength.set(road.id, s);
}

export type RoadHit = { road: RoadPath; dist: number; s: number; x: number; z: number; dx: number; dz: number };

/** Closest point on any road near (x, z) (within one hash cell), or null. */
export function nearestRoad(x: number, z: number): RoadHit | null {
  const list = segHash.get(keyOf(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return null;
  let best: RoadHit | null = null;
  for (const sg of list) {
    const ex = sg.bx - sg.ax, ez = sg.bz - sg.az;
    const t = Math.max(0, Math.min(1, ((x - sg.ax) * ex + (z - sg.az) * ez) / (sg.len * sg.len || 1)));
    const px = sg.ax + ex * t, pz = sg.az + ez * t;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.dist) best = { road: sg.road, dist: d, s: sg.s0 + sg.len * t, x: px, z: pz, dx: ex / sg.len, dz: ez / sg.len };
  }
  return best;
}

/** Is (x, z) on (or within `pad` m of) any road other than `except`? */
export function onOtherRoad(x: number, z: number, except: RoadPath, pad: number): boolean {
  const list = segHash.get(keyOf(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return false;
  for (const sg of list) {
    if (sg.road === except) continue;
    const ex = sg.bx - sg.ax, ez = sg.bz - sg.az;
    const t = Math.max(0, Math.min(1, ((x - sg.ax) * ex + (z - sg.az) * ez) / (sg.len * sg.len || 1)));
    if (Math.hypot(x - (sg.ax + ex * t), z - (sg.az + ez * t)) < sg.road.width / 2 + pad) return true;
  }
  return false;
}

export function onRoad(x: number, z: number): boolean {
  const h = nearestRoad(x, z);
  return !!h && h.dist <= h.road.width / 2 + 0.5;
}

/** Point + heading at arc length s along a road (wraps on loops, clamps otherwise). */
export function roadPoint(road: RoadPath, s: number): { x: number; z: number; dx: number; dz: number } {
  const total = roadLength.get(road.id) ?? 0;
  if (road.loop) s = ((s % total) + total) % total;
  else s = Math.max(0, Math.min(total, s));
  const n = road.pts.length;
  const count = road.loop ? n : n - 1;
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const [ax, az] = road.pts[i], [bx, bz] = road.pts[(i + 1) % n];
    const len = Math.hypot(bx - ax, bz - az);
    if (s <= acc + len || i === count - 1) {
      const t = len ? Math.min(1, (s - acc) / len) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / (len || 1), dz: (bz - az) / (len || 1) };
    }
    acc += len;
  }
  return { x: road.pts[0][0], z: road.pts[0][1], dx: 1, dz: 0 };
}

// ---------------------------------------------------------------- stunt ramps
/** A wedge on a highway shoulder, facing along the road: x/z = foot of the ramp, (dx, dz) = up-slope direction. */
export type Ramp = { id: string; x: number; z: number; dx: number; dz: number; len: number; width: number; height: number };
export const RAMPS: Ramp[] = ([
  ["ns", 1700, 1], ["ns", 6300, -1], ["ew", 1900, -1], ["ew", 5900, 1],
  ["ring", 4200, -1], ["ring", 12500, -1], ["ring", 20600, -1], ["ring", 28400, -1],
] as const).map(([roadId, s, side], i) => {
  const road = ROADS.find((r) => r.id === roadId)!;
  const p = roadPoint(road, s);
  const off = road.width / 2 + 15;
  return { id: `ramp-${i}`, x: p.x - p.dz * off * side, z: p.z + p.dx * off * side, dx: p.dx, dz: p.dz, len: 9, width: 5, height: 2.3 };
});

/** Ramp surface height under (x, z), with the slope it is on (0 when not on a ramp). */
export function rampAt(x: number, z: number): { h: number; slope: number; ramp: Ramp | null } {
  for (const r of RAMPS) {
    const rx = x - r.x, rz = z - r.z;
    const along = rx * r.dx + rz * r.dz, side = Math.abs(-rx * r.dz + rz * r.dx);
    if (along >= 0 && along <= r.len && side <= r.width / 2) return { h: (along / r.len) * r.height, slope: Math.atan2(r.height, r.len), ramp: r };
  }
  return { h: 0, slope: 0, ramp: null };
}

/** Empire Customs: the garage on Empire Avenue (open side faces the road, to the north). */
export const GARAGE = { x: 60, z: 19, w: 11, d: 9, h: 4.6 };
export const inGarageBay = (x: number, z: number) =>
  Math.abs(x - GARAGE.x) < GARAGE.w / 2 - 1.2 && z > GARAGE.z - GARAGE.d / 2 && z < GARAGE.z + GARAGE.d / 2 - 1;

/** Police station (the user's model) on the south side of Empire Avenue, entrance facing the road (north). */
export const POLICE_STATION = { x: 88, z: 24, w: 19.4, d: 21.7, rot: Math.PI };
const inStation = (x: number, z: number, pad = 0) =>
  Math.abs(x - POLICE_STATION.x) < POLICE_STATION.w / 2 + pad && Math.abs(z - POLICE_STATION.z) < POLICE_STATION.d / 2 + pad;

/** The run-up and landing strip of each ramp stays free of trees and rocks. */
function inRampLane(x: number, z: number): boolean {
  for (const r of RAMPS) {
    const rx = x - r.x, rz = z - r.z;
    const along = rx * r.dx + rz * r.dz, side = Math.abs(-rx * r.dz + rz * r.dx);
    if (along > -60 && along < 140 && side < 14) return true;
  }
  return false;
}

// ---------------------------------------------------------------- scenery placement + static colliders
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Prop = { x: number; z: number; rot: number; s: number };
export type Collider = { x: number; z: number; r: number; kind: "tree" | "lamp" | "rock" | "sign" };

const colHash = new Map<string, Collider[]>();
const COL_CELL = 20;
function addCollider(c: Collider) {
  const k = keyOf(Math.floor(c.x / COL_CELL), Math.floor(c.z / COL_CELL));
  const list = colHash.get(k) ?? [];
  list.push(c);
  colHash.set(k, list);
}

/** First static prop (tree trunk, lamp post, rock, sign post) within `r` of (x, z). */
export function staticHit(x: number, z: number, r: number): Collider | null {
  const i = Math.floor(x / COL_CELL), j = Math.floor(z / COL_CELL);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const list = colHash.get(keyOf(i + di, j + dj));
    if (!list) continue;
    for (const c of list) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return c;
  }
  return null;
}

const clearOfRoads = (x: number, z: number, gap: number) => {
  if (inRampLane(x, z)) return false;
  if (Math.abs(x - GARAGE.x) < GARAGE.w && Math.abs(z - GARAGE.z) < GARAGE.d) return false; // around the garage
  if (inStation(x, z, 6)) return false;
  const h = nearestRoad(x, z);
  return !h || h.dist > h.road.width / 2 + gap;
};

export const SCENERY = (() => {
  const rand = rng(20261006);
  // Garage walls (back and both sides) are solid.
  for (let t = -GARAGE.w / 2; t <= GARAGE.w / 2; t += 0.9) addCollider({ x: GARAGE.x + t, z: GARAGE.z + GARAGE.d / 2, r: 0.35, kind: "sign" });
  for (let t = -GARAGE.d / 2; t <= GARAGE.d / 2; t += 0.9) for (const sx of [-1, 1]) addCollider({ x: GARAGE.x + (sx * GARAGE.w) / 2, z: GARAGE.z + t, r: 0.35, kind: "sign" });
  // Police station: solid footprint (a grid of posts; walls stop people, cars and bullets alike).
  for (let x = -POLICE_STATION.w / 2 + 0.6; x <= POLICE_STATION.w / 2 - 0.6; x += 1.1)
    for (let z = -POLICE_STATION.d / 2 + 0.6; z <= POLICE_STATION.d / 2 - 0.6; z += 1.1)
      addCollider({ x: POLICE_STATION.x + x, z: POLICE_STATION.z + z, r: 0.62, kind: "sign" });
  const lamps: Prop[] = [];
  const trees: Prop[] = [];
  const rocks: Prop[] = [];
  const rails: { x: number; z: number; rot: number; len: number }[] = [];
  const signs: { x: number; z: number; rot: number }[] = [];

  // Street lamps along the highways and roads, both sides; guard rails on the outside of the Empire Loop.
  for (const road of ROADS) {
    const total = roadLength.get(road.id)!;
    const step = road.kind === "highway" ? 80 : 45;
    for (let s = 20; s < total - 10; s += step) {
      const p = roadPoint(road, s);
      for (const side of [1, -1]) {
        const off = road.width / 2 + 1.6;
        const x = p.x - p.dz * off * side, z = p.z + p.dx * off * side;
        if (districtAt(x, z, 4) || inRampLane(x, z)) continue;
        // Skip lamps that would stand on any other road (junctions): checking only the nearest road missed a
        // side road's lamps planted in the highway lanes, which cars hit as an invisible-feeling post.
        if (onOtherRoad(x, z, road, 2)) continue;
        lamps.push({ x, z, rot: Math.atan2(p.x - x, p.z - z), s: 1 }); // rot: the lamp arm faces the road
        addCollider({ x, z, r: 0.25, kind: "lamp" });
      }
    }
    if (road.id === "ring") {
      for (let s = 0; s < total; s += 12) {
        const p = roadPoint(road, s);
        const off = road.width / 2 + 3;
        // Outside of the ring = away from the island centre.
        const nx = -p.dz, nz = p.dx;
        const side = nx * p.x + nz * p.z > 0 ? 1 : -1;
        { const rx = p.x + nx * off * side, rz = p.z + nz * off * side; if (!inRampLane(rx, rz)) rails.push({ x: p.x + nx * off * side, z: p.z + nz * off * side, rot: Math.atan2(p.dx, p.dz), len: 12.2 }); }
      }
    }
  }

  // Billboards beside the highways (they show the player's own empire: see Terrain.tsx).
  for (const [roadId, s, side] of [["ns", 3400, 1], ["ns", 5600, -1], ["ew", 2200, 1], ["ew", 6400, -1], ["ring", 2500, 1], ["ring", 9000, 1], ["ring", 15500, 1], ["ring", 23000, 1], ["ring", 29000, 1]] as const) {
    const road = ROADS.find((r) => r.id === roadId)!;
    const p = roadPoint(road, s);
    const off = road.width / 2 + 9;
    const x = p.x - p.dz * off * side, z = p.z + p.dx * off * side;
    signs.push({ x, z, rot: Math.atan2(p.x - x, p.z - z) }); // the face looks at the traffic
    addCollider({ x, z, r: 0.6, kind: "sign" });
  }

  // Forests: clusters of trees in the countryside, kept off roads and out of districts.
  for (let c = 0; c < 140; c++) {
    const cx = (rand() * 2 - 1) * (WORLD_HALF - 300), cz = (rand() * 2 - 1) * (WORLD_HALF - 300);
    const n = 25 + Math.floor(rand() * 45);
    const spread = 60 + rand() * 160;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * spread;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.abs(x) > WORLD_HALF - 60 || Math.abs(z) > WORLD_HALF - 60) continue;
      if (!clearOfRoads(x, z, 10) || districtAt(x, z, 30)) continue;
      const s = 0.8 + rand() * 0.9;
      trees.push({ x, z, rot: rand() * 6.28, s });
      addCollider({ x, z, r: 0.45 * s, kind: "tree" });
    }
  }
  // Scattered single trees and rocks so open ground still reads as speed.
  for (let i = 0; i < 2600; i++) {
    const x = (rand() * 2 - 1) * (WORLD_HALF - 80), z = (rand() * 2 - 1) * (WORLD_HALF - 80);
    if (!clearOfRoads(x, z, 8) || districtAt(x, z, 25)) continue;
    if (rand() < 0.75) {
      const s = 0.7 + rand() * 1.1;
      trees.push({ x, z, rot: rand() * 6.28, s });
      addCollider({ x, z, r: 0.45 * s, kind: "tree" });
    } else {
      const s = 0.6 + rand() * 2.2;
      rocks.push({ x, z, rot: rand() * 6.28, s });
      addCollider({ x, z, r: 0.9 * s, kind: "rock" });
    }
  }
  return { lamps, trees, rocks, rails, signs };
})();

/** A clear spot to put the player (or a car) near (x, z): on open ground or a road, never inside a prop. */
export function openSpot(x: number, z: number, ok: (x: number, z: number) => boolean, r = 1.5): { x: number; z: number } {
  for (let ring = 0; ring < 40; ring++) {
    const n = ring === 0 ? 1 : 12;
    for (let a = 0; a < n; a++) {
      const t = (a / n) * Math.PI * 2;
      const cx = x + Math.cos(t) * ring * 1.5, cz = z + Math.sin(t) * ring * 1.5;
      if (ok(cx, cz) && !staticHit(cx, cz, r)) return { x: cx, z: cz };
    }
  }
  return { x, z };
}
