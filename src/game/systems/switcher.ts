// Character switching (GTA V's three protagonists): Salik, Soldier Boy and Aesthetic Boy each live somewhere on the
// island. Switch and the camera pulls up into the sky, flies over and drops down onto the other character, who
// carries on from where you last left them. The one you leave stays put as a person in the world.
import * as THREE from "three";
import { create } from "zustand";
import { useGame } from "../state/store.ts";
import { playSound } from "../audio.ts";
import { api } from "../../services/api.ts";
import { CHARACTERS, getCharacter } from "../../../shared/characters.ts";
import { canStand, player, stopPath } from "./explore.ts";
import { drivenCar, exitCar } from "./drive.ts";
import { openSpot, ROADS } from "../world/layout.ts";
import { cancelAbility } from "./abilities.ts";

export const PLAYABLE = CHARACTERS.filter((c) => c.role === "player").map((c) => c.id);

type Spot = { x: number; z: number };
const KEY = "se-switch";
const entrance = (key: string): Spot => {
  const r = ROADS.find((x) => x.id === `to-${key}`)!;
  return { x: r.pts[0][0] + (r.pts[1][0] - r.pts[0][0]) * 0.02, z: r.pts[0][1] + (r.pts[1][1] - r.pts[0][1]) * 0.02 };
};
const DEFAULTS: Record<string, Spot> = { salik: { x: 6.5, z: 0.75 }, soldier: entrance("old-blocks"), aesthetic: entrance("harbor") };

function load(): Record<string, Spot> {
  try { const s = localStorage.getItem(KEY); if (s) return { ...DEFAULTS, ...JSON.parse(s) }; } catch { /* ignore */ }
  return { ...DEFAULTS };
}
const spots = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(spots)); } catch { /* ignore */ } };

/** Where a playable character is waiting (for the one you're not playing). */
export const charSpot = (id: string): Spot => spots[id] ?? DEFAULTS.salik;

/** Camera choreography read by CameraRig: up into the sky over `from`, then down onto `to`. */
export const switchCam = { phase: "idle" as "idle" | "up" | "down", t: 0, from: new THREE.Vector3(), to: new THREE.Vector3() };
export const useSwitch = create<{ open: boolean; busy: boolean; set: (p: { open?: boolean; busy?: boolean }) => void }>((set) => ({ open: false, busy: false, set: (p) => set(p) }));

export type SwitchBlock = () => string | null;
const blocks = new Set<SwitchBlock>();
/** Other systems can veto a switch (an active mission, a wanted level) with a reason. */
export const addSwitchBlock = (f: SwitchBlock) => { blocks.add(f); return () => blocks.delete(f); };

export async function switchCharacter(id: string): Promise<string | null> {
  const g = useGame.getState();
  const current = getCharacter(g.player?.avatarId).id;
  useSwitch.getState().set({ open: false });
  if (id === current || switchCam.phase !== "idle") return null;
  if (!g.explore || g.mode !== "idle") return "Finish what you're doing first";
  for (const b of blocks) { const why = b(); if (why) return why; }
  cancelAbility();
  if (drivenCar()) exitCar();
  stopPath();
  spots[current] = { x: player.pos.x, z: player.pos.z };
  save();
  useSwitch.getState().set({ busy: true });
  playSound("whoosh");
  switchCam.from.set(player.pos.x, 0, player.pos.z);
  const dest = charSpot(id);
  const spot = openSpot(dest.x, dest.z, canStand, 0.5);
  switchCam.to.set(spot.x, 0, spot.z);
  switchCam.phase = "up"; switchCam.t = 0;
  await new Promise((r) => setTimeout(r, 1300));
  try {
    const p = await api.setAvatar(g.userId, id);
    useGame.setState((s) => ({ player: s.player ? { ...s.player, avatarId: p.avatarId } : p, shown: s.shown ? { ...s.shown, avatarId: p.avatarId } : p }));
  } catch {
    // Saving the choice failed: still switch for this session (cosmetic only).
    useGame.setState((s) => ({ player: s.player ? { ...s.player, avatarId: id } : s.player, shown: s.shown ? { ...s.shown, avatarId: id } : s.shown }));
  }
  player.pos.set(spot.x, 0, spot.z);
  player.yaw = 0;
  player.snap = true;
  playSound("whoosh");
  switchCam.phase = "down"; switchCam.t = 0;
  await new Promise((r) => setTimeout(r, 1300));
  switchCam.phase = "idle";
  useSwitch.getState().set({ busy: false });
  return null;
}

// Dev-only handle for scripted browser checks.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__switch = { switchCharacter, switchCam, charSpot };
