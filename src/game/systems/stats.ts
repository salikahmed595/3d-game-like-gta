// Player career stats (GTA V Pause > Stats): distance on foot / driven, top speed, shots, kills, deaths, arrests,
// missions passed, time in the city. Saved in this browser only; never touches sales data. No imports on purpose,
// so any system can count something without creating a module cycle.
export type Stats = {
  walked: number; driven: number; topSpeed: number; playTime: number; shots: number; kills: number;
  wasted: number; busted: number; missions: number; pickups: number; maxWanted: number;
};

const KEY = "se-stats";
const ZERO: Stats = { walked: 0, driven: 0, topSpeed: 0, playTime: 0, shots: 0, kills: 0, wasted: 0, busted: 0, missions: 0, pickups: 0, maxWanted: 0 };

export const stats: Stats = (() => {
  try { return { ...ZERO, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Stats>) }; } catch { return { ...ZERO }; }
})();

let dirty = false;
export function bumpStat(k: keyof Stats, by = 1): void { stats[k] += by; dirty = true; }
export function maxStat(k: keyof Stats, v: number): void { if (v > stats[k]) { stats[k] = v; dirty = true; } }

// Written every few seconds rather than per frame.
if (typeof window !== "undefined") {
  const flush = () => { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch { /* ignore */ } };
  setInterval(flush, 4000);
  window.addEventListener("beforeunload", flush);
}
