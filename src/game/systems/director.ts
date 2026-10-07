// Game director: turns server-confirmed GameEvents into a deterministic, prioritized sequence of
// animation / emotion / camera / sound / effect beats. Persist first (server), then celebrate (here).
import type { GameEvent, GameEventKind, PerformanceEventType, PlayerState } from "../../../shared/domain.ts";
import { formatMoney } from "../../../shared/engine.ts";
import { playSound } from "../audio.ts";
import { useGame } from "../state/store.ts";
import { cutToDesk, player } from "./explore.ts";
import { exitCar } from "./drive.ts";
import { companionSignal } from "../world/interactions.ts";
import type { CharacterAnimationState, CharacterEmotion } from "../../types/game.ts";

type Job = { event: GameEvent; player: PlayerState };

const PRIORITY: Record<GameEventKind, number> = {
  boss_defeated: 100, office_upgrade: 90, level_up: 80, big_sale: 70, sale: 60, milestone: 50, activity: 40,
};

const queue: Job[] = [];
const seen = new Set<string>();
let running = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const st = () => useGame.getState();

const TITLES: Partial<Record<PerformanceEventType, string>> = {
  call_completed: "CALL LOGGED", qualified_lead: "LEAD QUALIFIED", meeting_booked: "MEETING BOOKED",
  proposal_sent: "PROPOSAL SENT", deal_closed: "DEAL CLOSED", revenue_recorded: "REVENUE RECORDED",
  upsell: "UPSELL WON", renewal: "RENEWAL WON", daily_goal_achieved: "DAILY GOAL HIT",
  weekly_goal_achieved: "WEEKLY GOAL HIT", monthly_goal_achieved: "MONTHLY GOAL HIT", personal_record: "PERSONAL RECORD",
};

export function enqueueGameEvent(event: GameEvent, player: PlayerState): void {
  if (seen.has(event.id)) return; // SSE + POST response can both deliver the same event
  seen.add(event.id);
  st().setPlayer(player);
  queue.push({ event, player });
  queue.sort((a, b) => PRIORITY[b.event.kind] - PRIORITY[a.event.kind]); // stable: equal priority keeps arrival order
  if (!running) void drain();
}

async function drain(): Promise<void> {
  running = true;
  cancelIdle();
  try {
    while (queue.length) {
      const job = queue.shift();
      if (job) await runJob(job).catch((err) => console.error("[director] reaction failed", err instanceof Error ? err.message : err));
    }
  } finally {
    running = false;
    settleIdle();
    scheduleIdleLife();
  }
}

function setBeat(patch: { anim?: CharacterAnimationState; emotion?: CharacterEmotion; seated?: boolean }): void {
  st().set(patch);
}

function settleIdle(): void {
  const g = st();
  const shown = g.shown;
  const ratio = shown && shown.monthlyTarget > 0 ? shown.monthlyRevenue / shown.monthlyTarget : 0;
  // Near-target: more focused posture and expression. A roaming player stays on their feet.
  g.set({ mode: "idle", anim: g.explore ? "idle" : "typing", seated: !g.explore, walkTarget: null, shot: "default", emotion: ratio >= 0.85 && ratio < 1 ? "focused" : "neutral" });
}

/** Character-relative effect origin: follows the player when they are roaming. */
function near(x: number, y: number, z: number): [number, number, number] {
  return st().explore ? [player.pos.x + x, y, player.pos.z + z] : [x, y, z];
}

async function emotionSequence(steps: [CharacterEmotion, number][]): Promise<void> {
  for (const [e, ms] of steps) { setBeat({ emotion: e }); await sleep(ms); }
}

const shot = (s: "sale" | "orbit" | "upgrade" | "boss" | "building" | "default") => {
  if (st().reducedMotion && s !== "default") return;
  st().set({ shot: s });
};

function nextLines(p: PlayerState, xp: number, money: (n: number) => string): string[] {
  const lines = [`+${xp} XP`];
  if (p.nextUnlock) {
    lines.push(`${p.nextUnlock.name} ${Math.round(p.nextUnlock.ratio * 100)}% complete`, `${money(p.nextUnlock.revenueLeft)} until next upgrade`);
  } else {
    lines.push("All offices unlocked");
  }
  return lines;
}

async function runJob({ event, player }: Job): Promise<void> {
  const g = st();
  const config = g.config;
  if (!config) return;
  const money = (n: number) => formatMoney(n, config.brand);
  const isRevenue = event.amount > 0;
  g.set({ emote: null }); // a real achievement interrupts the coffee break
  // Ordinary sales play out over the drive (toast, sound, XP); office upgrades and the boss cut back to the desk.
  const staged = !!event.bossDefeated || (event.officeTierTo ?? 0) > (event.officeTierFrom ?? 0);
  if (g.driving && staged) exitCar();

  try {
    // Upgrades and the boss are staged in the office: cut the roaming player back to the desk first.
    if (g.explore && staged) await cutToDesk();
    // 1) primary reaction
    if (!isRevenue) {
      await activityReaction(event, player, money);
    } else {
      await saleReaction(event, player, money, event.kind === "big_sale" || event.kind === "boss_defeated" || event.amount >= config.bigDealThreshold);
    }
    // 2) level up
    if (event.levelsGained > 0) await levelUpReaction(player);
    // 3) office upgrade (the boss sequence reveals its own upgrade)
    if (!event.bossDefeated && (event.officeTierTo ?? 0) > (event.officeTierFrom ?? 0)) await officeReaction(event, player);
    // 4) trophies
    for (const m of event.milestones) await trophyReaction(m.title, player);
    // 5) boss
    if (event.bossDefeated) await bossReaction(event, player);
  } finally {
    st().commitShown(player);
    if (!queue.length) settleIdle();
  }
}

async function activityReaction(e: GameEvent, p: PlayerState, money: (n: number) => string): Promise<void> {
  st().set({ mode: "sale-reaction" });
  setBeat({ emotion: "focused" });
  st().commitShown(p);
  st().showToast({ title: TITLES[e.eventType] ?? "ACTIVITY", lines: [`+${e.xpAwarded} XP`, p.nextUnlock ? `${money(p.nextUnlock.revenueLeft)} until ${p.nextUnlock.name}` : ""].filter(Boolean), tone: "info" });
  playSound("xp");
  st().burst("xp", 0.8, near(0, 1.3, 0.6));
  await sleep(1100);
}

async function saleReaction(e: GameEvent, p: PlayerState, money: (n: number) => string, big: boolean): Promise<void> {
  st().set({ mode: big ? "celebration" : "sale-reaction" });
  // Phone rings, character checks it, expression shifts.
  playSound("phone");
  setBeat({ anim: "phone-check", emotion: "neutral" });
  shot("sale");
  await sleep(650);
  setBeat({ emotion: "surprised" });
  await sleep(550);

  st().commitShown(p);
  st().showToast({ title: TITLES[e.eventType] ?? "SALE", amount: `+${money(e.amount)}`, lines: nextLines(p, e.xpAwarded, money), tone: "sale" });
  playSound(big ? "bigsale" : "sale");
  playSound("coin");
  companionSignal.celebrate++;
  st().burst("sale", big ? 1.8 : 1, near(0, 1.3, 0.7));
  st().burst("xp", 1, near(0, 1.6, 0.4));

  if (big) {
    shot("orbit");
    st().set({ pulse: st().pulse + 1 });
    setBeat({ anim: "celebrate-big", seated: false });
    st().burst("confetti", 1, near(0, 2.4, 0.3));
    await emotionSequence([["excited", 900], ["proud", 1300]]);
    await sleep(600);
  } else {
    setBeat({ anim: "celebrate-small", seated: false, emotion: "happy" });
    await sleep(1300);
  }
  setBeat({ emotion: "proud" });
  shot("default");
  await sleep(250);
  setBeat({ anim: "typing", seated: true, emotion: "neutral" });
  await sleep(300);
}

async function levelUpReaction(p: PlayerState): Promise<void> {
  st().set({ mode: "celebration" });
  playSound("levelup");
  companionSignal.celebrate++;
  setBeat({ anim: "fist-pump", seated: false, emotion: "proud" });
  st().showToast({ title: "LEVEL UP", amount: `LEVEL ${p.level}`, lines: [p.rank.toUpperCase()], tone: "level" });
  st().burst("confetti", 0.6, near(0, 2.2, 0.3));
  st().commitShown(p);
  await sleep(2000);
  setBeat({ anim: "typing", seated: true, emotion: "neutral" });
  await sleep(250);
}

async function officeReaction(e: GameEvent, p: PlayerState): Promise<void> {
  const tier = (e.officeTierTo ?? 1) as 1 | 2 | 3;
  const name = st().config?.officeTiers.find((t) => t.tier === tier)?.name ?? "New Office";
  st().set({ mode: "upgrade" });
  shot("upgrade");
  setBeat({ anim: "stand", seated: false, emotion: "surprised" });
  playSound("upgrade");
  st().burst("dust", 1.2, [0.2, 0.6, 1.0]);
  await sleep(900);
  st().set({ displayTier: tier, pulse: st().pulse + 1 });
  st().burst("confetti", 0.9, [0, 2.2, 0.8]);
  st().showToast({ title: "OFFICE UPGRADED", amount: name.toUpperCase(), lines: p.nextUnlock ? [`Next: ${p.nextUnlock.name}`] : ["Top tier reached"], tone: "upgrade" });
  setBeat({ anim: "victory", emotion: "happy" });
  await sleep(2600);
  shot("default");
  setBeat({ anim: "typing", seated: true, emotion: "neutral" });
  await sleep(400);
}

async function trophyReaction(title: string, p: PlayerState): Promise<void> {
  playSound("trophy");
  st().commitShown(p);
  st().showToast({ title: "TROPHY UNLOCKED", amount: title.toUpperCase(), lines: ["Added to your trophy shelf"], tone: "trophy" });
  st().burst("sale", 0.7, [-2.4, 1.6, -1.5]);
  setBeat({ emotion: "happy" });
  await sleep(1500);
  setBeat({ emotion: "neutral" });
}

async function bossReaction(e: GameEvent, p: PlayerState): Promise<void> {
  const g = st();
  const bossName = g.config?.brand.bossName ?? "The Boss";
  g.set({ mode: "boss-battle" });
  shot("boss");
  setBeat({ anim: "confident-walk", seated: false, emotion: "determined" });
  g.set({ walkTarget: { x: 0.2, z: -1.35, yaw: Math.PI } });
  await sleep(2300);

  setBeat({ anim: "wall-punch" });
  await sleep(600);
  playSound("boss-hit");
  await sleep(300);

  // Impact: wall shatters; if the tier changed at the same time, reveal the new office behind it.
  playSound("crumble");
  playSound("boss-defeat");
  g.set({ mode: "cinematic", wallBroken: true, pulse: g.pulse + 1 });
  if ((e.officeTierTo ?? 1) > g.displayTier) g.set({ displayTier: e.officeTierTo as 1 | 2 | 3 });
  g.burst("dust", 2, [0.1, 1.2, -1.8]);
  g.burst("confetti", 1.6, [0, 2.4, -0.8]);
  g.commitShown(p);
  g.showToast({ title: "TARGET ACHIEVED", amount: `${bossName.toUpperCase()} DEFEATED`, lines: ["Boss defeated", e.officeTierTo && e.officeTierTo > (e.officeTierFrom ?? 1) ? "New office revealed" : "Reward unlocked"], tone: "boss" });
  setBeat({ anim: "victory", emotion: "excited" });
  await sleep(1800);
  setBeat({ emotion: "proud" });
  await sleep(1200);

  shot("building");
  await sleep(3200);
  g.set({ endScreen: new URLSearchParams(location.search).has("demo") });
  shot("default");
  g.set({ walkTarget: null });
  setBeat({ anim: "confident-walk", emotion: "happy" });
  await sleep(1500);
  setBeat({ anim: "typing", seated: true, emotion: "neutral" });
  await sleep(300);
}

// ---- Idle life: small ambient behaviours that never interrupt a reaction ----
function cancelIdle(): void { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }

export function scheduleIdleLife(): void {
  cancelIdle();
  idleTimer = setTimeout(async () => {
    // Ambient desk behaviour only; a roaming player (or one mid-emote) is left alone.
    if (running || st().mode !== "idle" || st().explore || st().emote) return scheduleIdleLife();
    const pick = Math.random();
    setBeat({ anim: pick < 0.6 ? "phone-check" : "typing", emotion: pick < 0.6 ? "neutral" : "focused" });
    await sleep(2600);
    if (!running) settleIdle();
    scheduleIdleLife();
  }, 14000 + Math.random() * 12000);
}
