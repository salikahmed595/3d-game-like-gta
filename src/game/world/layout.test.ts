import { describe, expect, it } from "vitest";
import { DISTRICTS, RAMPS, ROADS, SCENERY, WORLD_HALF, rampAt, roadPoint, roadLength } from "./layout.ts";

describe("open world layout", () => {
  it("keeps every district on the island and apart from the others", () => {
    for (const d of DISTRICTS) {
      expect(Math.abs(d.ox) + d.bounds.maxX).toBeLessThan(WORLD_HALF);
      expect(Math.abs(d.oz) + d.bounds.maxZ).toBeLessThan(WORLD_HALF);
      for (const o of DISTRICTS) {
        if (o === d) continue;
        // Havana Street is Downtown's annex on Empire Avenue: it sits right beside it (but must not overlap).
        const gap = [d.key, o.key].includes("havana") && [d.key, o.key].includes("downtown") ? 2 : 40;
        const apart = d.ox + d.bounds.maxX + gap < o.ox + o.bounds.minX || o.ox + o.bounds.maxX + gap < d.ox + d.bounds.minX
          || d.oz + d.bounds.maxZ + gap < o.oz + o.bounds.minZ || o.oz + o.bounds.maxZ + gap < d.oz + d.bounds.minZ;
        expect(apart, `${d.key} overlaps ${o.key}`).toBe(true);
      }
    }
  });

  it("never runs a road through a district", () => {
    for (const road of ROADS) {
      const total = roadLength.get(road.id)!;
      for (let s = 0; s <= total; s += 4) {
        const p = roadPoint(road, s);
        for (const d of DISTRICTS) {
          const inside = p.x > d.ox + d.bounds.minX + 1 && p.x < d.ox + d.bounds.maxX - 1 && p.z > d.oz + d.bounds.minZ + 1 && p.z < d.oz + d.bounds.maxZ - 1;
          expect(inside, `${road.id} crosses ${d.key} at ${Math.round(p.x)},${Math.round(p.z)}`).toBe(false);
        }
      }
    }
  }, 20000); // samples ~50 km of road every 4 m

  it("keeps lamps, signs, trees and rocks off every road (no posts in the lanes at junctions)", () => {
    const segs = ROADS.flatMap((r) => r.pts.slice(0, r.loop ? undefined : -1).map((a, i) => ({ r, a, b: r.pts[(i + 1) % r.pts.length] })));
    const onAnyRoad = (x: number, z: number) => segs.some(({ r, a, b }) => {
      const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2));
      return Math.hypot(x - (a[0] + ex * t), z - (a[1] + ez * t)) < r.width / 2;
    });
    for (const p of [...SCENERY.lamps, ...SCENERY.signs, ...SCENERY.trees, ...SCENERY.rocks]) {
      expect(onAnyRoad(p.x, p.z), `prop on a road at ${Math.round(p.x)},${Math.round(p.z)}`).toBe(false);
    }
  }, 30000);

  it("puts every stunt ramp on open ground beside a road, sloping up along it", () => {
    for (const r of RAMPS) {
      for (const d of DISTRICTS) expect(Math.hypot(r.x - d.ox, r.z - d.oz) > 200, `${r.id} near ${d.key}`).toBe(true);
      const top = rampAt(r.x + r.dx * (r.len - 0.1), r.z + r.dz * (r.len - 0.1));
      expect(top.h).toBeGreaterThan(r.height * 0.9);
      expect(rampAt(r.x - r.dx, r.z - r.dz).h).toBe(0);
    }
  });

  it("connects every district to the highway network", () => {
    for (const d of DISTRICTS.filter((x) => x.key !== "downtown" && x.key !== "havana")) expect(ROADS.some((r) => r.id === `to-${d.key}`), d.key).toBe(true);
    // Havana opens straight onto Empire Avenue (which runs to the North–South Highway).
    const havana = DISTRICTS.find((d) => d.key === "havana")!;
    const avenue = ROADS.find((r) => r.id === "dt-east")!;
    const southEdge = havana.oz + havana.bounds.maxZ;
    expect(Math.abs(southEdge - (avenue.pts[0][1] - avenue.width / 2))).toBeLessThan(6);
    expect(havana.ox + havana.bounds.minX).toBeGreaterThan(avenue.pts[0][0] - 10);
    expect(havana.ox + havana.bounds.maxX).toBeLessThan(avenue.pts[1][0]);
  });
});
