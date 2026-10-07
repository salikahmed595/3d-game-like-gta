// City content built from the user's own assets (tools/blender/convert_world.py → public/models/world, vehicles).
// Road centrelines are read off the top-down layout render and validated against the collision grid at load,
// so a slightly-off coordinate is snapped to the clear corridor (or dropped) instead of driving through a wall.
import { gridBlocked } from "./grid.ts";
import type { CarSpec } from "../systems/drive.ts";

export type MapDef = {
  id: string;
  name: string;
  /** World offset of the map (the office sits at the origin of the home map). */
  ox: number; oz: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  ground: string;
  /** Candidate road centrelines (two-way: one lane each side). */
  roads: { a: [number, number]; b: [number, number] }[];
};

export const DOWNTOWN: MapDef = {
  id: "downtown", name: "Downtown", ox: 0, oz: 0,
  bounds: { minX: -73, maxX: 73, minZ: -119, maxZ: 119 },
  ground: "#2a2c30",
  roads: [
    { a: [-13, -70], b: [-13, 66] }, // central avenue (N-S)
    { a: [33, -95], b: [33, 112] }, // east road (N-S)
    { a: [-33, -98], b: [68, -98] }, // north street
    { a: [-49, -29], b: [65, -29] },
    { a: [-68, 18.6], b: [33, 18.6] },
    { a: [-1, 42.6], b: [70, 42.6] },
    { a: [-33, 94], b: [52, 94] }, // south street
  ],
};

/** Travel destinations (one map is loaded at a time; the office lives in Downtown). Away maps sit far from the
 *  office so they never overlap it. Roads and the arrival spot are found automatically from each map's grid. */
const AWAY = 2000;
const away = (id: string, name: string, w: number, d: number, ground: string): MapDef => ({
  id, name, ox: AWAY, oz: 0, ground, roads: [],
  bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 },
});
export const MAPS: MapDef[] = [
  DOWNTOWN,
  away("towers", "Tower District", 186, 183, "#2b2d31"),
  away("blocks", "Old Blocks", 70, 93, "#2e2c29"),
  away("oldstreet", "Old Street", 31, 80, "#2a2a2c"),
  away("postwar", "Postwar City", 77, 103, "#34302a"),
  away("wasteland", "Wasteland", 106, 93, "#3a3328"),
  away("havana", "Havana Street", 79, 68, "#3b3732"),
];
export const mapById = (id: string) => MAPS.find((m) => m.id === id) ?? DOWNTOWN;

/** top = top speed (km/h), accel = launch acceleration (m/s²); the fastest cars reach the 300 km/h cap. */
export type VehicleModel = { id: string; name: string; length: number; width: number; top: number; accel: number; flip?: boolean; traffic?: boolean; bike?: boolean };

/** Every vehicle the user supplied (pack_8 is the red supercar, kept as a drivable showpiece). */
export const VEHICLES: VehicleModel[] = [
  { id: "classic", name: "Classic Coupe", length: 3.9, width: 1.74, top: 190, accel: 7, traffic: true },
  { id: "future", name: "Future Racer", length: 4.6, width: 2.4, top: 300, accel: 12.5 },
  { id: "concept", name: "Concept Car", length: 4.5, width: 2.4, top: 290, accel: 11 },
  { id: "rusty", name: "Rusty Sedan", length: 4.6, width: 1.65, top: 150, accel: 5.5, traffic: true },
  { id: "vintage", name: "Vintage Racer", length: 3.6, width: 1.9, top: 245, accel: 9.5 },
  { id: "pack_0", name: "Sedan", length: 4.4, width: 1.96, top: 210, accel: 7.5, traffic: true },
  { id: "pack_1", name: "Hatchback", length: 4.4, width: 1.94, top: 190, accel: 7, flip: true, traffic: true },
  { id: "pack_2", name: "Compact", length: 4.4, width: 2.17, top: 180, accel: 6.5, traffic: true },
  { id: "pack_3", name: "Van", length: 4.4, width: 1.78, top: 160, accel: 5.5, flip: true, traffic: true },
  { id: "pack_4", name: "Pickup", length: 4.4, width: 1.76, top: 175, accel: 6.5, flip: true, traffic: true },
  { id: "pack_5", name: "SUV", length: 4.4, width: 1.97, top: 195, accel: 7, traffic: true },
  { id: "pack_6", name: "City Car", length: 4.4, width: 1.96, top: 185, accel: 7, flip: true, traffic: true },
  { id: "pack_7", name: "Jeep", length: 4.4, width: 2.19, top: 170, accel: 7, traffic: true },
  { id: "pack_8", name: "Supercar", length: 4.4, width: 1.99, top: 300, accel: 12.5 },
  { id: "pack_9", name: "Station Wagon", length: 4.4, width: 1.96, top: 190, accel: 7, traffic: true },
  // The user's police Harley (police pack): parked outside the police station on Empire Avenue.
  { id: "cop_bike", name: "Police Bike", length: 2.45, width: 0.9, top: 230, accel: 10.5, bike: true },
];
export const vehicleUrl = (id: string) => `/models/vehicles/${id}.glb`;
export const vehicleModel = (id: string) => VEHICLES.find((v) => v.id === id)!;
export const carSpec = (id: string, model: string, x: number, z: number, yaw: number): CarSpec => {
  const m = vehicleModel(model);
  return { id, model, name: m.name, x, z, yaw, length: m.length, width: m.width, top: m.top, accel: m.accel };
};

/** Drivable cars parked around the office lot (positions are nudged to a clear spot at load). */
export const PARKED: { model: string; x: number; z: number; yaw: number }[] = [
  // One row, nose-out toward Empire Avenue (east): every car has a clear run off the lot.
  { model: "pack_8", x: 12, z: -11, yaw: Math.PI / 2 },
  { model: "classic", x: 12, z: -7.5, yaw: Math.PI / 2 },
  { model: "future", x: 12, z: -4, yaw: Math.PI / 2 },
  { model: "vintage", x: 12, z: 4.5, yaw: Math.PI / 2 },
  { model: "concept", x: 12, z: 8, yaw: Math.PI / 2 },
  { model: "rusty", x: 12, z: 11.5, yaw: Math.PI / 2 },
  // Outside the police station, across Empire Avenue.
  { model: "cop_bike", x: 84, z: 8.5, yaw: Math.PI / 2 },
];

export type Road = { ax: number; az: number; bx: number; bz: number; len: number; dx: number; dz: number };

const clearAlong = (ax: number, az: number, bx: number, bz: number, halfWidth: number) => {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.floor(len / 2));
  const px = -(bz - az) / len, pz = (bx - ax) / len;
  let blocked = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (gridBlocked(x + px * halfWidth, z + pz * halfWidth) || gridBlocked(x - px * halfWidth, z - pz * halfWidth) || gridBlocked(x, z)) blocked++;
  }
  return blocked / (n + 1);
};

/** Snap each candidate road sideways (±6 m) to the clearest corridor; drop it if nothing is clear enough. */
export function resolveRoads(map: MapDef): Road[] {
  const out: Road[] = [];
  for (const r of map.roads) {
    const [ax, az] = r.a, [bx, bz] = r.b;
    const len = Math.hypot(bx - ax, bz - az);
    const px = -(bz - az) / len, pz = (bx - ax) / len;
    let best = { off: 0, score: Infinity };
    for (let off = -6; off <= 6; off += 0.5) {
      const s = clearAlong(ax + px * off, az + pz * off, bx + px * off, bz + pz * off, 3);
      if (s < best.score - 1e-6 || (Math.abs(s - best.score) < 1e-6 && Math.abs(off) < Math.abs(best.off))) best = { off, score: s };
    }
    if (best.score > 0.08) continue;
    const sx = ax + px * best.off + map.ox, sz = az + pz * best.off + map.oz;
    const ex = bx + px * best.off + map.ox, ez = bz + pz * best.off + map.oz;
    out.push({ ax: sx, az: sz, bx: ex, bz: ez, len, dx: (ex - sx) / len, dz: (ez - sz) / len });
  }
  return out;
}

/** Find drivable straights automatically: long runs where a ~5 m wide corridor is clear on the collision grid,
 *  scanned along both axes. Works for any converted map; the longest, non-overlapping runs become roads. */
export function detectRoads(map: MapDef, blocked: (x: number, z: number) => boolean = gridBlocked, max = 8): Road[] {
  const b = map.bounds;
  const HALF = 2.5, MIN_LEN = 36, SPACING = 14;
  const clearAt = (x: number, z: number, horizontal: boolean) => {
    for (let o = -HALF; o <= HALF; o += 0.5) {
      if (horizontal ? blocked(x + map.ox, z + o + map.oz) : blocked(x + o + map.ox, z + map.oz)) return false;
    }
    return true;
  };
  type Run = { h: boolean; line: number; from: number; to: number };
  const runs: Run[] = [];
  for (const h of [true, false]) {
    const [l0, l1] = h ? [b.minZ + 4, b.maxZ - 4] : [b.minX + 4, b.maxX - 4];
    const [t0, t1] = h ? [b.minX + 2, b.maxX - 2] : [b.minZ + 2, b.maxZ - 2];
    for (let line = l0; line <= l1; line += 1) {
      let start: number | null = null;
      for (let t = t0; t <= t1 + 1; t += 1) {
        const ok = t <= t1 && (h ? clearAt(t, line, true) : clearAt(line, t, false));
        if (ok && start === null) start = t;
        if (!ok && start !== null) {
          if (t - 1 - start >= MIN_LEN) runs.push({ h, line, from: start, to: t - 1 });
          start = null;
        }
      }
    }
  }
  runs.sort((p, q) => (q.to - q.from) - (p.to - p.from));
  const chosen: Run[] = [];
  for (const r of runs) {
    const clash = chosen.some((c) => c.h === r.h && Math.abs(c.line - r.line) < SPACING && c.from < r.to && r.from < c.to);
    if (!clash) chosen.push(r);
    if (chosen.length >= max) break;
  }
  return chosen.map((r) => {
    const [ax, az, bx, bz] = r.h ? [r.from, r.line, r.to, r.line] : [r.line, r.from, r.line, r.to];
    const len = Math.hypot(bx - ax, bz - az);
    return { ax: ax + map.ox, az: az + map.oz, bx: bx + map.ox, bz: bz + map.oz, len, dx: (bx - ax) / len, dz: (bz - az) / len };
  });
}

/** Nearest clear spot (spiral search) for a footprint of the given radius. */
export function clearSpot(x: number, z: number, radius: number, ok: (x: number, z: number) => boolean): { x: number; z: number } {
  if (ok(x, z) && !gridBlocked(x, z, radius)) return { x, z };
  for (let ring = 1; ring < 30; ring++) {
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      const cx = x + Math.cos(t) * ring, cz = z + Math.sin(t) * ring;
      if (ok(cx, cz) && !gridBlocked(cx, cz, radius)) return { x: cx, z: cz };
    }
  }
  return { x, z };
}
