import { create } from "zustand";
import type { OrgConfig, PlayerState, Trophy } from "../../../shared/domain.ts";
import type {
  Burst, BurstKind, CameraShot, CharacterAnimationState, CharacterEmotion, GameMode, Toast,
} from "../../types/game.ts";

// Server state is authoritative; this store mirrors it for responsive rendering.
type GameStore = {
  userId: string;
  config: OrgConfig | null;
  player: PlayerState | null; // latest authoritative state
  shown: PlayerState | null; // what the HUD/world currently displays (updated at reaction beats)
  displayTier: 1 | 2 | 3;
  wallBroken: boolean;
  connection: "connecting" | "online" | "offline";
  loadError: string | null;

  mode: GameMode;
  anim: CharacterAnimationState;
  emotion: CharacterEmotion;
  shot: CameraShot;
  walkTarget: { x: number; z: number; yaw: number } | null;
  seated: boolean;
  pulse: number; // light pulse counter
  bursts: Burst[];
  toast: Toast | null;
  endScreen: boolean;
  selectedTrophy: Trophy | null;
  panel: "none" | "trophies" | "sale" | "stats" | "character" | "travel" | "map" | "missions" | "customs" | "settings" | "pause";
  /** Which tab the GTA-style pause menu shows. */
  pauseTab: "map" | "missions" | "stats" | "trophies" | "character" | "settings" | "controls";
  reducedMotion: boolean;

  // Free-roam: the player walks the office and the street outside; reactions still play wherever they stand.
  explore: boolean;
  emote: CharacterAnimationState | null; // short user-triggered action (drink coffee, wave) while idle
  prompt: { id: string; label: string } | null; // nearest interactable while exploring
  fade: boolean; // full-screen cut used when a cinematic needs the player back at the desk
  driving: string | null; // id of the car the player is driving (drive.ts)
  avatarReady: boolean; // the player's character has loaded (the loader stops covering the office)
  carsVersion: number; // drivable cars were added / removed (drive.ts)
  peopleVersion: number; // pedestrians were added / removed (people.ts)
  copsVersion: number; // police cars were added / removed (police.ts)
  ko: boolean; // the player was knocked out in a fight (respawns shortly)
  radio: number | null; // car radio station (index into audio STATIONS) while driving
  deathScreen: "wasted" | "busted" | null; // GTA end-of-life screens (grey, slow motion)

  setBootstrap: (config: OrgConfig, player: PlayerState) => void;
  setPlayer: (player: PlayerState) => void;
  commitShown: (player?: PlayerState) => void;
  set: (patch: Partial<GameStore>) => void;
  burst: (kind: BurstKind, intensity: number, origin?: [number, number, number]) => void;
  showToast: (toast: Omit<Toast, "id">) => void;
};

let idCounter = 1;
const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);

export const useGame = create<GameStore>((set, get) => ({
  userId: params.has("demo") ? "demo" : "salik",
  config: null, player: null, shown: null, displayTier: 1, wallBroken: false,
  connection: "connecting", loadError: null,
  mode: "idle", anim: "typing", emotion: "neutral", shot: "default", walkTarget: null, seated: true,
  pulse: 0, bursts: [], toast: null, endScreen: false, selectedTrophy: null, panel: "none", pauseTab: "map",
  explore: false, emote: null, prompt: null, fade: false, driving: null, avatarReady: false, carsVersion: 0, peopleVersion: 0, copsVersion: 0, ko: false, radio: null, deathScreen: null,
  reducedMotion: typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches,

  setBootstrap: (config, player) =>
    set({ config, player, shown: player, displayTier: player.officeTier, wallBroken: player.bossHealthPercent <= 0 }),
  setPlayer: (player) => set({ player }),
  commitShown: (player) => set((s) => ({ shown: player ?? s.player })),
  set: (patch) => set(patch),
  burst: (kind, intensity, origin = [0, 1.2, 0]) =>
    set((s) => ({ bursts: [...s.bursts.slice(-8), { id: idCounter++, kind, intensity, origin }] })),
  showToast: (toast) => {
    const id = idCounter++;
    set({ toast: { ...toast, id } });
    setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, 3600);
  },
}));
