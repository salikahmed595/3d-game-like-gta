// Core domain types shared by server and client.
export const EVENT_TYPES = [
  "call_completed", "qualified_lead", "meeting_booked", "proposal_sent", "deal_closed",
  "revenue_recorded", "upsell", "renewal", "daily_goal_achieved", "weekly_goal_achieved",
  "monthly_goal_achieved", "personal_record",
] as const;
export type PerformanceEventType = (typeof EVENT_TYPES)[number];

export const CURRENCIES = ["USD", "PKR", "GBP", "AED", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type EventStatus = "pending" | "approved" | "rejected";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export type KpiRule = { eventType: PerformanceEventType; xp: number; revenueCounts: boolean };

export type OfficeTierConfig = { tier: 1 | 2 | 3; name: string; revenueRequired: number };

export type MilestoneConfig = {
  id: string;
  title: string;
  metric: "deals" | "revenue" | "calls" | "meetings" | "streak";
  value: number;
  rarity: Rarity;
};

export type BrandConfig = {
  companyName: string;
  playerName: string;
  playerTitle: string;
  buildingName: string;
  primaryColor: string;
  currency: Currency;
  locale: string;
  bossName: string;
  rankNames: string[];
};

export type OrgConfig = {
  brand: BrandConfig;
  monthlyTarget: number;
  xpPer100Revenue: number;
  bigDealThreshold: number;
  kpiRules: KpiRule[];
  officeTiers: OfficeTierConfig[];
  milestones: MilestoneConfig[];
  approvalRequired: boolean;
};

export type Trophy = {
  id: string;
  title: string;
  metric: string;
  value: number;
  rarity: Rarity;
  earnedAt: string;
};

export type PlayerState = {
  userId: string;
  level: number;
  xp: number;
  rank: string;
  levelProgress: { current: number; required: number; ratio: number };
  streak: number;
  stats: { calls: number; meetings: number; deals: number; lifetimeRevenue: number };
  monthlyRevenue: number;
  monthlyTarget: number;
  officeTier: 1 | 2 | 3;
  trophies: Trophy[];
  bossHealthPercent: number;
  nextUnlock: { name: string; revenueLeft: number; ratio: number } | null;
  /** Chosen 3D character (shared/characters.ts); null until the player picks one. */
  avatarId: string | null;
};

export type GameEventKind =
  | "sale" | "big_sale" | "activity" | "level_up" | "office_upgrade" | "milestone" | "boss_defeated";

export type GameEvent = {
  id: string;
  kind: GameEventKind;
  eventType: PerformanceEventType;
  amount: number;
  xpAwarded: number;
  levelsGained: number;
  officeTierFrom?: number;
  officeTierTo?: number;
  bossDefeated: boolean;
  milestones: { id: string; title: string; rarity: Rarity }[];
  createdAt: string;
};

export type ApiOk<T> = { success: true; data: T };
export type ApiErr = { success: false; error: { code: string; message: string } };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type EventResult = {
  status: EventStatus;
  duplicate: boolean;
  player: PlayerState;
  gameEvent: GameEvent | null;
};

export type PendingEvent = {
  id: string;
  eventType: PerformanceEventType;
  amount: number;
  currency: Currency;
  clientName: string | null;
  note: string | null;
  occurredAt: string;
  createdAt: string;
};

export type BootstrapData = { config: OrgConfig; player: PlayerState };
