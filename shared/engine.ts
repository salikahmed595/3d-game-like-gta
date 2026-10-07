// Deterministic game rules. One place for level/XP/office math — never reimplement in components.
import type { BrandConfig, OrgConfig, OfficeTierConfig, PerformanceEventType } from "./domain.ts";

export const MAX_LEVEL = 100;

// Total XP needed to *reach* a level. Level 1 = 0 XP. Easy to retune.
export function getXpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(100 * Math.pow(level - 1, 1.6));
}

export function getLevelFromXp(totalXp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && totalXp >= getXpRequiredForLevel(level + 1)) level++;
  return level;
}

export function getLevelProgress(totalXp: number) {
  const level = getLevelFromXp(totalXp);
  const base = getXpRequiredForLevel(level);
  const next = level >= MAX_LEVEL ? base : getXpRequiredForLevel(level + 1);
  const required = Math.max(next - base, 1);
  const current = totalXp - base;
  return { current, required, ratio: level >= MAX_LEVEL ? 1 : Math.min(current / required, 1) };
}

export function getRankName(level: number, ranks: string[]): string {
  const perRank = Math.ceil(MAX_LEVEL / Math.max(ranks.length, 1));
  const idx = Math.min(Math.floor((level - 1) / perRank), ranks.length - 1);
  return ranks[idx] ?? ranks[0] ?? "Rookie";
}

export function calculateXp(
  eventType: PerformanceEventType,
  amount: number,
  config: Pick<OrgConfig, "kpiRules" | "xpPer100Revenue">,
): number {
  const rule = config.kpiRules.find((r) => r.eventType === eventType);
  if (!rule) return 0;
  const revenueXp = rule.revenueCounts ? Math.floor(amount / 100) * config.xpPer100Revenue : 0;
  return rule.xp + revenueXp;
}

export function getOfficeTier(lifetimeRevenue: number, tiers: OfficeTierConfig[]): 1 | 2 | 3 {
  let tier: 1 | 2 | 3 = 1;
  for (const t of tiers) if (lifetimeRevenue >= t.revenueRequired) tier = t.tier;
  return tier;
}

export function getNextUnlock(lifetimeRevenue: number, tiers: OfficeTierConfig[]) {
  const current = getOfficeTier(lifetimeRevenue, tiers);
  const next = tiers.find((t) => t.tier === current + 1);
  if (!next) return null;
  const floor = tiers.find((t) => t.tier === current)?.revenueRequired ?? 0;
  const span = Math.max(next.revenueRequired - floor, 1);
  return {
    name: next.name,
    revenueLeft: Math.max(next.revenueRequired - lifetimeRevenue, 0),
    ratio: Math.min(Math.max((lifetimeRevenue - floor) / span, 0), 1),
  };
}

export function getBossHealthPercent(currentRevenue: number, target: number): number {
  if (target <= 0) return 100;
  return Math.round((100 - Math.min((currentRevenue / target) * 100, 100)) * 10) / 10;
}

export function formatMoney(amount: number, brand: Pick<BrandConfig, "currency" | "locale">): string {
  return new Intl.NumberFormat(brand.locale, {
    style: "currency",
    currency: brand.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export const DEFAULT_RANKS = [
  "Rookie", "Closer", "Deal Maker", "High Performer", "Sales Pro", "Elite Closer",
  "Rainmaker", "Founder I", "Founder II", "Tycoon", "Magnate", "Empire Legend",
];

export const DEFAULT_CONFIG: OrgConfig = {
  brand: {
    companyName: "Salik Builds",
    playerName: "Salik",
    playerTitle: "AI Creator",
    buildingName: "Salik Builds HQ",
    primaryColor: "#ffb020",
    currency: "USD",
    locale: "en-US",
    bossName: "The Market",
    rankNames: DEFAULT_RANKS,
  },
  monthlyTarget: 25000,
  xpPer100Revenue: 100,
  bigDealThreshold: 2500,
  approvalRequired: false,
  kpiRules: [
    { eventType: "call_completed", xp: 5, revenueCounts: false },
    { eventType: "qualified_lead", xp: 20, revenueCounts: false },
    { eventType: "meeting_booked", xp: 50, revenueCounts: false },
    { eventType: "proposal_sent", xp: 30, revenueCounts: false },
    { eventType: "deal_closed", xp: 200, revenueCounts: true },
    { eventType: "revenue_recorded", xp: 0, revenueCounts: true },
    { eventType: "upsell", xp: 150, revenueCounts: true },
    { eventType: "renewal", xp: 100, revenueCounts: true },
    { eventType: "daily_goal_achieved", xp: 100, revenueCounts: false },
    { eventType: "weekly_goal_achieved", xp: 500, revenueCounts: false },
    { eventType: "monthly_goal_achieved", xp: 5000, revenueCounts: false },
    { eventType: "personal_record", xp: 250, revenueCounts: false },
  ],
  officeTiers: [
    { tier: 1, name: "Starter Office", revenueRequired: 0 },
    { tier: 2, name: "Professional Office", revenueRequired: 5000 },
    { tier: 3, name: "Executive Office", revenueRequired: 25000 },
  ],
  milestones: [
    { id: "first_deal", title: "First Deal", metric: "deals", value: 1, rarity: "common" },
    { id: "first_1k", title: "First $1,000", metric: "revenue", value: 1000, rarity: "common" },
    { id: "first_10k", title: "First $10,000", metric: "revenue", value: 10000, rarity: "rare" },
    { id: "ten_deals", title: "10 Deals Closed", metric: "deals", value: 10, rarity: "rare" },
    { id: "hundred_calls", title: "100 Calls", metric: "calls", value: 100, rarity: "epic" },
  ],
};
