// Everything the player can walk up to and use. Actions only *show* server-authoritative data
// (target, stats, trophies) or play cosmetic body language; none of them change business state.
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { formatMoney } from "../../../shared/engine.ts";
import { playSound } from "../audio.ts";
import { camHint, emote, player, returnToDesk } from "../systems/explore.ts";
import type { Interactable } from "../systems/explore.ts";

const g = () => useGame.getState();
const money = (n: number) => { const c = g().config; return c ? formatMoney(n, c.brand) : String(n); };

/** World position of the AI companion (written by Companion.tsx every frame). */
export const companionPos = new THREE.Vector3(-0.85, 1.5, -0.2);
export const companionSignal = { celebrate: 0, talk: 0 };

let tipIndex = 0;
function companionTips(): string[] {
  const s = g().shown;
  if (!s) return ["Let's get to work."];
  const tips: string[] = [];
  const left = s.monthlyTarget - s.monthlyRevenue;
  tips.push(left > 0 ? `${money(left)} left to hit this month's target.` : "Monthly target smashed. Everything now is bonus.");
  if (s.nextUnlock) tips.push(`${money(s.nextUnlock.revenueLeft)} more unlocks the ${s.nextUnlock.name}.`);
  if (s.streak > 0) tips.push(`${s.streak}-day sales streak. One deal today keeps it alive.`);
  tips.push(`${s.stats.deals} deals closed so far. ${s.trophies.length} trophies on the shelf.`);
  tips.push(`Level ${s.level} ${s.rank}. ${s.levelProgress.required - s.levelProgress.current} XP to the next level.`);
  return tips;
}

function face(x: number, z: number) {
  player.yaw = Math.atan2(x - player.pos.x, z - player.pos.z);
  camHint.yaw = player.yaw; // frame the object over the player's shoulder
}

export const INTERACTABLES: Interactable[] = [
  {
    id: "desk", radius: 1.3,
    label: () => (g().explore ? "Sit down & work" : null),
    at: () => ({ x: 0.15, z: 0.05 }),
    run: () => returnToDesk(),
  },
  {
    id: "coffee", radius: 1.2,
    label: () => "Grab a coffee",
    at: () => ({ x: 0.55, z: 0.2 }),
    run: () => {
      if (g().explore) face(0.55, 0.95);
      emote("drink", 2600);
      g().set({ emotion: "happy" });
      setTimeout(() => { if (g().mode === "idle") g().set({ emotion: "neutral" }); }, 2600);
    },
  },
  {
    id: "target", radius: 1.5,
    label: () => (g().wallBroken ? null : "Check the monthly target"),
    at: () => ({ x: -0.2, z: -1.45 }),
    run: () => {
      const s = g().shown;
      if (!s) return;
      if (g().explore) face(-0.2, -2.05);
      const left = Math.max(s.monthlyTarget - s.monthlyRevenue, 0);
      g().set({ emotion: "determined" });
      g().showToast({
        title: "MONTHLY TARGET", amount: `${money(left)} TO GO`,
        lines: [`${money(s.monthlyRevenue)} of ${money(s.monthlyTarget)}`, `Boss health ${Math.round(s.bossHealthPercent)}%`], tone: "info",
      });
      setTimeout(() => { if (g().mode === "idle") g().set({ emotion: "neutral" }); }, 3000);
    },
  },
  {
    id: "trophies", radius: 1.4,
    label: () => "View trophy shelf",
    at: () => ({ x: -1.95, z: -1.5 }),
    run: () => { if (g().explore) face(-2.55, -1.5); playSound("trophy"); g().set({ panel: "trophies", selectedTrophy: null }); },
  },
  {
    id: "stats", radius: 1.4,
    label: () => "Open performance board",
    at: () => ({ x: 1.9, z: -1.85 }),
    run: () => { if (g().explore) face(1.9, -2.5); g().set({ panel: "stats" }); },
  },
  {
    id: "plant", radius: 1.1,
    label: () => (g().displayTier >= 2 ? "Water the plant" : null),
    at: () => ({ x: 1.55, z: -1.2 }),
    run: () => {
      if (g().explore) face(2.0, -1.6);
      g().burst("xp", 0.5, [2.0, 0.9, -1.6]);
      g().set({ emotion: "happy" });
      setTimeout(() => { if (g().mode === "idle") g().set({ emotion: "neutral" }); }, 1500);
    },
  },
  {
    id: "companion", radius: 1.8, fallback: true,
    // In the office only: outside, Nova floats beside you all the time and a permanent prompt would be noise.
    label: () => (Math.hypot(player.pos.x, player.pos.z) < 8 ? "Talk to Nova" : null),
    at: () => ({ x: companionPos.x, z: companionPos.z }),
    run: () => {
      const tips = companionTips();
      const tip = tips[tipIndex++ % tips.length];
      if (g().explore) face(companionPos.x, companionPos.z);
      emote("wave", 1600);
      companionSignal.talk++;
      g().showToast({ title: "NOVA", lines: [tip], tone: "info" });
    },
  },
];
