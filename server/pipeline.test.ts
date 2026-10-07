import { beforeAll, describe, expect, it } from "vitest";

process.env.DB_PATH = ":memory:";
const { seed, resetPlayer } = await import("./db.ts");
const { submitEvent, getPlayerState, setAvatar, ApiError } = await import("./pipeline.ts");

const opts = { actor: "test", requireApproval: false };
const deal = (amount: number, id: string) => ({ user_id: "demo", event_type: "deal_closed", amount, currency: "USD", source: "test", external_id: id });

beforeAll(() => seed());

describe("event pipeline", () => {
  it("awards XP once and ignores duplicates", () => {
    resetPlayer("demo");
    const first = submitEvent(deal(1500, "d1"), opts);
    const xp = first.player.xp;
    expect(xp).toBe(200 + 15 * 100);
    const again = submitEvent(deal(1500, "d1"), opts);
    expect(again.duplicate).toBe(true);
    expect(again.player.xp).toBe(xp);
    expect(again.player.stats.lifetimeRevenue).toBe(1500);
  });

  it("upgrades office, awards milestones, defeats boss at target", () => {
    resetPlayer("demo");
    submitEvent(deal(1500, "a"), opts);
    const up = submitEvent(deal(4000, "b"), opts);
    expect(up.player.officeTier).toBe(2);
    expect(up.gameEvent?.kind).toBe("office_upgrade");
    submitEvent(deal(18000, "c"), opts);
    const last = submitEvent(deal(1500, "d"), opts);
    expect(last.gameEvent?.bossDefeated).toBe(true);
    expect(last.player.officeTier).toBe(3);
    expect(getPlayerState("demo").trophies.length).toBeGreaterThanOrEqual(3);
  });

  it("stores the chosen character without touching progress, and keeps it across a reset", () => {
    resetPlayer("demo");
    submitEvent(deal(1500, "av1"), opts);
    const before = getPlayerState("demo");
    expect(before.avatarId).toBeNull();
    const after = setAvatar("demo", "arian");
    expect(after.avatarId).toBe("arian");
    expect(after.xp).toBe(before.xp);
    expect(after.stats.lifetimeRevenue).toBe(before.stats.lifetimeRevenue);
    resetPlayer("demo");
    expect(getPlayerState("demo").avatarId).toBe("arian");
    expect(() => setAvatar("ghost", "arian")).toThrow(ApiError);
  });

  it("rejects invalid input and unknown users", () => {
    expect(() => submitEvent({ ...deal(-5, "x") }, opts)).toThrow(ApiError);
    expect(() => submitEvent({ ...deal(5, "y"), user_id: "ghost" }, opts)).toThrow(ApiError);
  });
});
