// Sales event pipeline: validate → duplicate check → authorize → KPI map → reward → transaction → game event.
// The server alone decides permanent rewards; the frontend only reacts to the resulting GameEvent.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CURRENCIES, EVENT_TYPES } from "../shared/domain.ts";
import type {
  EventResult, EventStatus, GameEvent, GameEventKind, OrgConfig, PendingEvent, PlayerState, Trophy,
} from "../shared/domain.ts";
import {
  calculateXp, getBossHealthPercent, getLevelFromXp, getLevelProgress, getNextUnlock, getOfficeTier, getRankName,
} from "../shared/engine.ts";
import { ORG_ID, audit, db, getConfig, transaction } from "./db.ts";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const eventInputSchema = z.object({
  user_id: z.string().min(1).max(64),
  event_type: z.enum(EVENT_TYPES),
  amount: z.number().finite().min(0).max(100_000_000).default(0),
  currency: z.enum(CURRENCIES).default("USD"),
  source: z.string().min(1).max(40).default("api"),
  external_id: z.string().min(1).max(128),
  occurred_at: z.string().datetime().optional(),
  client_name: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});
export type EventInput = z.infer<typeof eventInputSchema>;

type PlayerRow = {
  id: string; name: string; xp: number; calls: number; meetings: number; deals: number;
  lifetime_revenue: number; streak: number; last_sale_day: string | null; boss_defeated_month: string | null;
  avatar_id: string | null;
};
type EventRow = {
  id: string; user_id: string; event_type: EventInput["event_type"]; amount: number; currency: EventInput["currency"];
  status: EventStatus; client_name: string | null; note: string | null; occurred_at: string; created_at: string;
};

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const utcMonth = (d: Date) => d.toISOString().slice(0, 7);

function getPlayerRow(userId: string): PlayerRow {
  const row = db.prepare("SELECT * FROM players WHERE id = ? AND organization_id = ?").get(userId, ORG_ID) as PlayerRow | undefined;
  if (!row) throw new ApiError(404, "USER_NOT_FOUND", "Player does not exist in this organization.");
  return row;
}

function monthlyRevenue(userId: string, config: OrgConfig, now = new Date()): number {
  const revenueTypes = config.kpiRules.filter((r) => r.revenueCounts).map((r) => r.eventType);
  const rows = db.prepare(
    "SELECT event_type, amount FROM performance_events WHERE user_id = ? AND status = 'approved' AND substr(occurred_at,1,7) = ?",
  ).all(userId, utcMonth(now)) as { event_type: EventInput["event_type"]; amount: number }[];
  return rows.filter((r) => revenueTypes.includes(r.event_type)).reduce((sum, r) => sum + r.amount, 0);
}

export function getPlayerState(userId: string): PlayerState {
  const config = getConfig();
  const p = getPlayerRow(userId);
  const level = getLevelFromXp(p.xp);
  const monthly = monthlyRevenue(userId, config);
  const trophies = db.prepare("SELECT * FROM achievements WHERE user_id = ? ORDER BY earned_at").all(userId) as {
    milestone_id: string; title: string; metric: string; value: number; rarity: Trophy["rarity"]; earned_at: string;
  }[];
  return {
    userId, level, xp: p.xp,
    rank: getRankName(level, config.brand.rankNames),
    levelProgress: getLevelProgress(p.xp),
    streak: p.streak,
    stats: { calls: p.calls, meetings: p.meetings, deals: p.deals, lifetimeRevenue: p.lifetime_revenue },
    monthlyRevenue: monthly,
    monthlyTarget: config.monthlyTarget,
    officeTier: getOfficeTier(p.lifetime_revenue, config.officeTiers),
    trophies: trophies.map((t) => ({ id: t.milestone_id, title: t.title, metric: t.metric, value: t.value, rarity: t.rarity, earnedAt: t.earned_at })),
    bossHealthPercent: getBossHealthPercent(monthly, config.monthlyTarget),
    nextUnlock: getNextUnlock(p.lifetime_revenue, config.officeTiers),
    avatarId: p.avatar_id ?? null,
  };
}

/** Cosmetic preference only: never touches XP, revenue or rewards. */
export function setAvatar(userId: string, avatarId: string): PlayerState {
  getPlayerRow(userId); // 404 for unknown players
  db.prepare("UPDATE players SET avatar_id = ? WHERE id = ? AND organization_id = ?").run(avatarId, userId, ORG_ID);
  return getPlayerState(userId);
}

type Listener = (userId: string, result: { player: PlayerState; gameEvent: GameEvent | null }) => void;
const listeners = new Set<Listener>();
export const onGameEvent = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };

export type SubmitOptions = { actor: string; requireApproval: boolean };

export function submitEvent(raw: unknown, opts: SubmitOptions): EventResult {
  const parsed = eventInputSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const input = parsed.data;
  getPlayerRow(input.user_id); // authorization: player must belong to this organization

  const dupe = db.prepare(
    "SELECT id FROM performance_events WHERE organization_id = ? AND source = ? AND external_id = ? AND user_id = ? AND event_type = ?",
  ).get(ORG_ID, input.source, input.external_id, input.user_id, input.event_type);
  if (dupe) return { status: "approved", duplicate: true, player: getPlayerState(input.user_id), gameEvent: null };

  const config = getConfig();
  const status: EventStatus = opts.requireApproval && config.approvalRequired ? "pending" : "approved";
  const id = randomUUID();
  const now = new Date();

  const gameEvent = transaction(() => {
    try {
      db.prepare(
        `INSERT INTO performance_events (id, organization_id, user_id, event_type, amount, currency, source, external_id, status,
          client_name, note, occurred_at, created_at, submitted_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(id, ORG_ID, input.user_id, input.event_type, input.amount, input.currency, input.source, input.external_id, status,
        input.client_name ?? null, input.note ?? null, input.occurred_at ?? now.toISOString(), now.toISOString(), opts.actor);
    } catch (err) {
      if (String(err).includes("UNIQUE")) return "duplicate" as const; // lost a race with an identical event
      throw err;
    }
    audit(opts.actor, "event.submitted", { id, type: input.event_type, status });
    return status === "approved" ? applyRewards(id, config) : null;
  });

  if (gameEvent === "duplicate") return { status: "approved", duplicate: true, player: getPlayerState(input.user_id), gameEvent: null };
  const player = getPlayerState(input.user_id);
  if (gameEvent) listeners.forEach((l) => l(input.user_id, { player, gameEvent }));
  return { status, duplicate: false, player, gameEvent };
}

// Must run inside a transaction. Idempotent per event via xp_transactions.event_id UNIQUE.
function applyRewards(eventId: string, config: OrgConfig): GameEvent {
  const ev = db.prepare("SELECT * FROM performance_events WHERE id = ?").get(eventId) as EventRow;
  const before = getPlayerRow(ev.user_id);
  const tierBefore = getOfficeTier(before.lifetime_revenue, config.officeTiers);
  const levelBefore = getLevelFromXp(before.xp);

  const xp = calculateXp(ev.event_type, ev.amount, config);
  const rule = config.kpiRules.find((r) => r.eventType === ev.event_type);
  const revenueDelta = rule?.revenueCounts ? ev.amount : 0;
  const when = new Date(ev.occurred_at);

  db.prepare("INSERT INTO xp_transactions (id, user_id, event_id, xp, created_at) VALUES (?,?,?,?,?)")
    .run(randomUUID(), ev.user_id, eventId, xp, new Date().toISOString());
  db.prepare("UPDATE performance_events SET xp_awarded = ? WHERE id = ?").run(xp, eventId);

  let streak = before.streak;
  let lastDay = before.last_sale_day;
  if (ev.event_type === "deal_closed") {
    const today = utcDay(when);
    if (lastDay !== today) {
      const yesterday = utcDay(new Date(when.getTime() - 86_400_000));
      streak = lastDay === yesterday ? streak + 1 : 1;
      lastDay = today;
    }
  }

  db.prepare(
    `UPDATE players SET xp = xp + ?, calls = calls + ?, meetings = meetings + ?, deals = deals + ?,
      lifetime_revenue = lifetime_revenue + ?, streak = ?, last_sale_day = ? WHERE id = ?`,
  ).run(xp, ev.event_type === "call_completed" ? 1 : 0, ev.event_type === "meeting_booked" ? 1 : 0,
    ev.event_type === "deal_closed" ? 1 : 0, revenueDelta, streak, lastDay, ev.user_id);

  const after = getPlayerRow(ev.user_id);
  const levelAfter = getLevelFromXp(after.xp);
  const tierAfter = getOfficeTier(after.lifetime_revenue, config.officeTiers);
  // The event row is already stored as approved, so subtract it to get the pre-event total.
  const monthAfter = monthlyRevenue(ev.user_id, config, when);
  const monthBefore = monthAfter - revenueDelta;

  const metrics = { deals: after.deals, revenue: after.lifetime_revenue, calls: after.calls, meetings: after.meetings, streak: after.streak };
  const earned: GameEvent["milestones"] = [];
  for (const m of config.milestones) {
    if (metrics[m.metric] < m.value) continue;
    const res = db.prepare(
      "INSERT OR IGNORE INTO achievements (user_id, milestone_id, title, metric, value, rarity, earned_at) VALUES (?,?,?,?,?,?,?)",
    ).run(ev.user_id, m.id, m.title, m.metric, m.value, m.rarity, new Date().toISOString());
    if (Number(res.changes) > 0) earned.push({ id: m.id, title: m.title, rarity: m.rarity });
  }

  // Boss falls once per month when the monthly target is first crossed.
  const month = utcMonth(when);
  const bossDefeated = monthBefore < config.monthlyTarget && monthAfter >= config.monthlyTarget && after.boss_defeated_month !== month;
  if (bossDefeated) db.prepare("UPDATE players SET boss_defeated_month = ? WHERE id = ?").run(month, ev.user_id);

  const isRevenue = revenueDelta > 0;
  const kind: GameEventKind = bossDefeated ? "boss_defeated"
    : tierAfter > tierBefore ? "office_upgrade"
    : levelAfter > levelBefore ? "level_up"
    : isRevenue && ev.amount >= config.bigDealThreshold ? "big_sale"
    : isRevenue ? "sale"
    : earned.length > 0 ? "milestone"
    : "activity";

  audit("system", "reward.applied", { eventId, xp, kind });
  return {
    id: eventId, kind, eventType: ev.event_type, amount: ev.amount, xpAwarded: xp,
    levelsGained: levelAfter - levelBefore,
    officeTierFrom: tierBefore, officeTierTo: tierAfter, bossDefeated,
    milestones: earned, createdAt: new Date().toISOString(),
  };
}

export function listPending(): PendingEvent[] {
  const rows = db.prepare("SELECT * FROM performance_events WHERE status = 'pending' ORDER BY created_at").all() as EventRow[];
  return rows.map((r) => ({
    id: r.id, eventType: r.event_type, amount: r.amount, currency: r.currency, clientName: r.client_name,
    note: r.note, occurredAt: r.occurred_at, createdAt: r.created_at,
  }));
}

export function reviewEvent(eventId: string, decision: "approve" | "reject", actor: string): EventResult {
  const config = getConfig();
  const ev = db.prepare("SELECT * FROM performance_events WHERE id = ?").get(eventId) as EventRow | undefined;
  if (!ev) throw new ApiError(404, "EVENT_NOT_FOUND", "Event not found.");
  if (ev.status !== "pending") throw new ApiError(409, "ALREADY_REVIEWED", "This event has already been reviewed.");
  const gameEvent = transaction(() => {
    const status = decision === "approve" ? "approved" : "rejected";
    db.prepare("UPDATE performance_events SET status = ?, reviewed_at = ? WHERE id = ?").run(status, new Date().toISOString(), eventId);
    audit(actor, `event.${status}`, { eventId });
    return decision === "approve" ? applyRewards(eventId, config) : null;
  });
  const player = getPlayerState(ev.user_id);
  if (gameEvent) listeners.forEach((l) => l(ev.user_id, { player, gameEvent }));
  return { status: decision === "approve" ? "approved" : "rejected", duplicate: false, player, gameEvent };
}
