// Open-world missions: drive, race, sprint to 300 km/h, fist-fight a rival, tour the island. Walk into a yellow
// marker (or pick one in the Missions panel) to start. Rewards are "street cash" and best times, stored only in this
// browser: they are a side game and never touch XP, revenue or any business data (rules §64).
import { bumpStat } from "./stats.ts";
import { create } from "zustand";
import { useGame } from "../state/store.ts";
import { playSound } from "../audio.ts";
import { canStand, onCutToDesk, player, registerInteractables, startExplore, stopPath } from "./explore.ts";
import { cars, drivenCar, enterCar, exitCar, removeCar, spawnCar } from "./drive.ts";
import { addPerson, fighter, koListeners, people, removePerson, respawnHooks } from "./people.ts";
import { RAMPS, ROADS, districtByKey, nearestRoad, openSpot, roadLength, roadPoint } from "../world/layout.ts";
import { carSpec } from "../world/city.ts";
import { stuntListeners } from "./stunts.ts";
import { addSwitchBlock } from "./switcher.ts";
import { chargeAbility } from "./abilities.ts";
import { bustListeners, clearWanted, useWanted } from "./police.ts";

type Point = { x: number; z: number };
export type Objective =
  | { kind: "car"; text: string }
  | { kind: "goto"; at: Point; r: number; text: string }
  | { kind: "speed"; kmh: number; text: string }
  | { kind: "ko"; personId: string; text: string };

export type MissionDef = {
  id: string; title: string; blurb: string; start: Point; reward: number;
  timeLimit?: number; gold?: number; // seconds
  car?: { model: string; x: number; z: number; yaw: number };
  objectives: () => Objective[];
  setup?: () => void; cleanup?: () => void;
};

const entrance = (key: string): Point => {
  const r = ROADS.find((x) => x.id === `to-${key}`);
  if (!r) { const d = districtByKey(key)!; return { x: d.ox, z: d.oz }; }
  const [ax, az] = r.pts[0], [bx, bz] = r.pts[1];
  const l = Math.hypot(bx - ax, bz - az);
  return { x: ax + ((bx - ax) / l) * 25, z: az + ((bz - az) / l) * 25 };
};

const ring = ROADS.find((r) => r.id === "ring")!;
function ringCheckpoints(): Objective[] {
  const total = roadLength.get("ring")!;
  const s0 = nearestRoad(150, -4300)!.s;
  const out: Objective[] = [];
  for (let k = 1; k <= 8; k++) {
    const p = roadPoint(ring, s0 + (total * k) / 8 - (k === 8 ? 8 : 0));
    out.push({ kind: "goto", at: { x: p.x, z: p.z }, r: 16, text: k === 8 ? "Cross the finish line" : `Checkpoint ${k} of 7` });
  }
  return out;
}

const RIVAL = "rival-trevor";
const OLD_BLOCKS = districtByKey("old-blocks")!;

export const MISSIONS: MissionDef[] = [
  {
    id: "first-wheels", title: "First Wheels", reward: 250, timeLimit: 150, gold: 75,
    blurb: "Grab any car from the office lot and get to the Tower District before the clock runs out.",
    start: { x: 24, z: 13 },
    objectives: () => [
      { kind: "car", text: "Get in a car (walk up to one and press E)" },
      { kind: "goto", at: entrance("tower-district"), r: 12, text: "Drive to the Tower District" },
    ],
  },
  {
    id: "highway-rush", title: "Highway Rush", reward: 900, timeLimit: 165, gold: 115,
    blurb: "Flat out up the North–South Highway, then east along the Empire Loop. Hit every checkpoint.",
    start: { x: 126, z: -40 }, car: { model: "pack_8", x: 115.5, z: -60, yaw: Math.PI },
    objectives: () => [
      ...[-700, -1500, -2500, -3500].map((z, i) => ({ kind: "goto" as const, at: { x: 112, z }, r: 14, text: `Checkpoint ${i + 1} of 7` })),
      ...[1200, 2400].map((x, i) => ({ kind: "goto" as const, at: { x, z: -4296 }, r: 16, text: `Checkpoint ${i + 5} of 7` })),
      { kind: "goto", at: { x: 3500, z: -4296 }, r: 16, text: "Cross the finish line" },
    ],
  },
  {
    id: "top-speed", title: "300 Club", reward: 600, timeLimit: 75, gold: 30,
    blurb: "Take the Future Racer onto the straight highway and hit 300 km/h. Hold Shift for nitro.",
    start: { x: 132, z: -230 }, car: { model: "future", x: 115.5, z: -260, yaw: Math.PI },
    objectives: () => [{ kind: "speed", kmh: 299, text: "Reach 300 km/h (Shift = nitro)" }],
  },
  {
    id: "street-fight", title: "Street Fight", reward: 500, gold: 25,
    blurb: "Trevor has been talking trash in Old Blocks. Go settle it with your fists (F to punch).",
    start: entrance("old-blocks"),
    objectives: () => [
      { kind: "goto", at: { x: OLD_BLOCKS.ox, z: OLD_BLOCKS.oz }, r: 30, text: "Find Trevor in Old Blocks" },
      { kind: "ko", personId: RIVAL, text: "Knock Trevor out (F to punch)" },
    ],
    setup: () => {
      const spot = openSpot(OLD_BLOCKS.ox, OLD_BLOCKS.oz, canStand, 0.6);
      const p = addPerson(RIVAL, "trevor", spot.x, spot.z, true);
      p.state = "roam"; // waits until the player shows up
    },
    cleanup: () => removePerson(RIVAL),
  },
  {
    id: "grand-tour", title: "Grand Tour", reward: 1500,
    blurb: "See your island: Old Street, Wasteland, Harbor Blocks, Skyline Heights and Market Lane, then home.",
    start: { x: 28, z: -12 },
    objectives: () => [
      { kind: "car", text: "Get in a car" },
      ...(["old-street", "wasteland", "harbor", "skyline", "market-lane"] as const).map((k) => ({ kind: "goto" as const, at: entrance(k), r: 14, text: `Drive to ${districtByKey(k)!.name}` })),
      { kind: "goto", at: { x: 32, z: 0 }, r: 12, text: "Head back to your office" },
    ],
  },
  {
    id: "empire-loop", title: "Empire Loop GP", reward: 2500, timeLimit: 560, gold: 420,
    blurb: "A full 33 km lap of the Empire Loop in the Supercar. The ultimate time trial.",
    start: { x: 150, z: -4270 }, car: { model: "pack_8", x: 160, z: -4295.5, yaw: Math.PI / 2 },
    objectives: ringCheckpoints,
  },
];
export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);

// ---------------------------------------------------------------- state (local to this browser)
type Saved = { cash: number; best: Record<string, number>; done: Record<string, boolean>; stunts?: Record<string, boolean> };
const KEY = "se-street";
function load(): Saved {
  try { const s = localStorage.getItem(KEY); if (s) return { cash: 0, best: {}, done: {}, ...JSON.parse(s) }; } catch { /* ignore */ }
  return { cash: 0, best: {}, done: {} };
}

export type Banner = { id: number; title: string; sub?: string; tone: "pass" | "fail" | "start" };
type Run = { id: string; step: number; elapsed: number; objectives: Objective[] };

type MissionStore = Saved & {
  run: Run | null;
  banner: Banner | null;
  waypoint: Point | null;
  set: (p: Partial<MissionStore>) => void;
};

export const useMissions = create<MissionStore>((set) => ({ ...load(), run: null, banner: null, waypoint: null, set: (p) => set(p) }));

function save() {
  const { cash, best, done, stunts } = useMissions.getState();
  try { localStorage.setItem(KEY, JSON.stringify({ cash, best, done, stunts })); } catch { /* ignore */ }
}

let bannerId = 0;
export function showBanner(title: string, tone: Banner["tone"], sub?: string, ms = 3800) {
  const id = ++bannerId;
  useMissions.getState().set({ banner: { id, title, sub, tone } });
  setTimeout(() => { if (useMissions.getState().banner?.id === id) useMissions.getState().set({ banner: null }); }, ms);
}

export function addCash(n: number) {
  useMissions.getState().set({ cash: Math.max(0, useMissions.getState().cash + n) });
  save();
}

/** Current GPS target: the active objective, else the player's map waypoint. */
export function gpsTarget(): Point | null {
  const { run, waypoint } = useMissions.getState();
  if (run) {
    const o = run.objectives[run.step];
    if (o?.kind === "goto") return o.at;
    if (o?.kind === "ko") { const p = people.get(o.personId); return p ? { x: p.x, z: p.z } : null; }
    return null;
  }
  return waypoint;
}

export const currentObjective = (): Objective | null => {
  const run = useMissions.getState().run;
  return run ? run.objectives[run.step] ?? null : null;
};

// ---------------------------------------------------------------- flow
const MISSION_CAR = "mission-car";

export async function startMission(id: string): Promise<void> {
  const def = missionById(id);
  const g = useGame.getState();
  if (!def || useMissions.getState().run || g.mode !== "idle") return;
  if (useWanted.getState().stars > 0) { showBanner("LOSE THE COPS FIRST", "fail", "Missions can't start while you're wanted", 2600); return; }
  if (!g.explore) startExplore();
  stopPath();
  g.set({ fade: true, panel: "none" });
  await new Promise((r) => setTimeout(r, 400));
  if (useGame.getState().driving) exitCar();
  const s = openSpot(def.start.x, def.start.z, canStand, 0.5);
  player.pos.set(s.x, 0, s.z);
  player.snap = true;
  fighter.hp = 100;
  def.setup?.();
  if (def.car) {
    spawnCar(carSpec(MISSION_CAR, def.car.model, def.car.x, def.car.z, def.car.yaw));
    enterCar(MISSION_CAR);
  }
  useMissions.getState().set({ run: { id, step: 0, elapsed: 0, objectives: def.objectives() }, waypoint: null });
  playSound("mission-start");
  showBanner(def.title.toUpperCase(), "start", def.blurb, 4200);
  setTimeout(() => useGame.getState().set({ fade: false }), 200);
}

function finish(passed: boolean, reason?: string) {
  const st = useMissions.getState();
  const run = st.run;
  if (!run) return;
  const def = missionById(run.id)!;
  def.cleanup?.();
  st.set({ run: null });
  if (passed) {
    const time = run.elapsed;
    const best = st.best[def.id];
    const gold = def.gold !== undefined && time <= def.gold;
    const record = best === undefined || time < best;
    useMissions.getState().set({ best: record ? { ...st.best, [def.id]: time } : st.best, done: { ...st.done, [def.id]: true } });
    addCash(def.reward + (gold ? Math.round(def.reward * 0.5) : 0));
    bumpStat("missions");
    playSound("mission-passed");
    setTimeout(() => playSound("cash"), 900);
    showBanner("MISSION PASSED", "pass", `+$${(def.reward + (gold ? Math.round(def.reward * 0.5) : 0)).toLocaleString()} street cash · ${formatTime(time)}${gold ? " · GOLD" : ""}${record && best !== undefined ? " · NEW RECORD" : ""}`, 5200);
  } else {
    playSound("mission-failed");
    showBanner("MISSION FAILED", "fail", reason, 4200);
  }
  // A mission car stays where it is (keep driving if you like) until another mission replaces it.
}

export function cancelMission(reason = "Mission cancelled") { if (useMissions.getState().run) finish(false, reason); }

koListeners.add(() => {
  cancelMission("You were wasted");
  // Hospital bill, GTA-style (street cash only; never sales money).
  const fee = Math.min(useMissions.getState().cash, 200);
  if (fee > 0) addCash(-fee);
  if (fee) setTimeout(() => showBanner("HOSPITAL BILL", "fail", `-$${fee} street cash`, 3000), 5300);
});
respawnHooks.add(() => { if (useGame.getState().driving) exitCar(); clearWanted(); });

// Stunt jumps: first clean landing off each ramp pays out (GTA's "unique stunt jump").
stuntListeners.add((j) => {
  const st = useMissions.getState();
  const first = !st.stunts?.[j.rampId];
  const stunts = { ...st.stunts, [j.rampId]: true };
  st.set({ stunts });
  chargeAbility(0.25);
  if (first) { addCash(250); playSound("cash"); }
  else save();
  showBanner(first ? "UNIQUE STUNT JUMP" : "STUNT JUMP", "pass", `${Math.round(j.distance)} m · ${j.airtime.toFixed(1)} s air${first ? ` · +$250 · ${Object.keys(stunts).length}/${RAMPS.length} found` : ""}`, 3200);
});

// No switching characters mid-mission or with the police after you.
addSwitchBlock(() => (useMissions.getState().run ? "Can't switch characters during a mission" : useWanted.getState().stars ? "Lose the cops before switching" : null));
onCutToDesk.add(() => { cancelMission("Your empire needs you back at the desk"); clearWanted(); });
bustListeners.add((stars) => {
  const fine = Math.min(useMissions.getState().cash, 100 * stars);
  if (useMissions.getState().run) { const def = missionById(useMissions.getState().run!.id); def?.cleanup?.(); useMissions.getState().set({ run: null }); }
  addCash(-fine);
  showBanner("BUSTED", "fail", fine ? `-$${fine.toLocaleString()} street cash` : undefined, 4200);
});

export const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;

/** Per frame: advance the active objective, check the clock. */
export function stepMissions(dt: number): void {
  const st = useMissions.getState();
  const run = st.run;
  if (!run) return;
  const def = missionById(run.id)!;
  run.elapsed += dt;
  if (def.timeLimit && run.elapsed > def.timeLimit) { finish(false, "Out of time"); return; }
  const o = run.objectives[run.step];
  if (!o) { finish(true); return; }
  const car = drivenCar();
  let done = false;
  switch (o.kind) {
    case "car": done = !!car; break;
    case "goto": done = Math.hypot(player.pos.x - o.at.x, player.pos.z - o.at.z) < o.r; break;
    case "speed": done = !!car && Math.abs(car.speed) * 3.6 >= o.kmh; break;
    case "ko": {
      const p = people.get(o.personId);
      if (p && p.state === "roam" && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 14) { p.state = "fight"; p.t = 0; }
      done = !!p && (p.state === "down" || p.state === "air" || p.state === "dead") && p.hp <= 0;
      break;
    }
  }
  if (done) {
    run.step += 1;
    if (o.kind === "goto" || o.kind === "speed") playSound("checkpoint");
    if (run.step >= run.objectives.length) finish(true);
    else useMissions.getState().set({ run: { ...run } });
  }
}

/** Yellow start markers: walk into one and press E. */
export function registerMissionStarts(): () => void {
  return registerInteractables(MISSIONS.map((m) => ({
    id: `mission-${m.id}`, radius: 3.5,
    label: () => (useMissions.getState().run ? null : `Start mission: ${m.title}`),
    at: () => m.start,
    run: () => void startMission(m.id),
  })));
}

/** Clean up a stale mission car if the player abandons it far away (keeps the cars list short). */
export function tidyMissionCar() {
  const c = cars.get(MISSION_CAR);
  if (c && !useMissions.getState().run && useGame.getState().driving !== MISSION_CAR && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 600) removeCar(MISSION_CAR);
}

// Dev-only handle for scripted browser checks.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__missions = { MISSIONS, startMission, cancelMission, useMissions, currentObjective };
