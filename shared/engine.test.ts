import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG, calculateXp, getBossHealthPercent, getLevelFromXp, getLevelProgress,
  getNextUnlock, getOfficeTier, getXpRequiredForLevel,
} from "./engine.ts";

describe("levels", () => {
  it("is monotonic and round-trips", () => {
    for (let l = 1; l < 100; l++) {
      expect(getXpRequiredForLevel(l + 1)).toBeGreaterThan(getXpRequiredForLevel(l));
      expect(getLevelFromXp(getXpRequiredForLevel(l))).toBe(l);
    }
  });
  it("progress ratio is within 0..1", () => {
    const p = getLevelProgress(250);
    expect(p.ratio).toBeGreaterThanOrEqual(0);
    expect(p.ratio).toBeLessThanOrEqual(1);
  });
});

describe("xp", () => {
  it("is deterministic", () => {
    expect(calculateXp("deal_closed", 2500, DEFAULT_CONFIG)).toBe(200 + 25 * 100);
    expect(calculateXp("call_completed", 0, DEFAULT_CONFIG)).toBe(5);
  });
});

describe("office + boss", () => {
  it("tiers by lifetime revenue", () => {
    const t = DEFAULT_CONFIG.officeTiers;
    expect(getOfficeTier(0, t)).toBe(1);
    expect(getOfficeTier(5000, t)).toBe(2);
    expect(getOfficeTier(25000, t)).toBe(3);
    expect(getNextUnlock(25000, t)).toBeNull();
    expect(getNextUnlock(3750, t)?.revenueLeft).toBe(1250);
  });
  it("boss health maps to target", () => {
    expect(getBossHealthPercent(18750, 25000)).toBe(25);
    expect(getBossHealthPercent(99999, 25000)).toBe(0);
  });
});
