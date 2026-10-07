// GTA V help text: the small black box top-left that explains a control the first time you need it, instead of a
// wall of key bindings on screen. Each tip shows once per browser; F1 / the pause menu list every control.
import { create } from "zustand";

type Help = { text: string | null; id: number; set: (p: Partial<Help>) => void };
export const useHelp = create<Help>((set) => ({ text: null, id: 0, set: (p) => set(p) }));

const KEY = "se-help-seen";
const seen: Record<string, true> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, true>; } catch { return {}; } })();
let hideT: ReturnType<typeof setTimeout> | null = null;

export function showHelp(text: string, secs = 7): void {
  const id = useHelp.getState().id + 1;
  useHelp.getState().set({ text, id });
  if (hideT) clearTimeout(hideT);
  hideT = setTimeout(() => { if (useHelp.getState().id === id) useHelp.getState().set({ text: null }); }, secs * 1000);
}

/** A tip that only ever shows once (first walk, first drive, first wanted level…). */
export function helpOnce(key: string, text: string, secs = 8): void {
  if (seen[key]) return;
  seen[key] = true;
  try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* ignore */ }
  showHelp(text, secs);
}

export const hideHelp = () => useHelp.getState().set({ text: null });

/** Every control, grouped (pause menu > Controls, F1). */
export const CONTROLS: { group: string; keys: [string, string][] }[] = [
  { group: "On foot", keys: [["W A S D", "Move"], ["Shift", "Sprint"], ["Space", "Jump"], ["Mouse", "Look (click the game to capture it)"], ["E", "Use / enter a car"], ["F", "Punch"], ["C", "Switch character"], ["X", "Special ability"]] },
  { group: "Weapons", keys: [["Right mouse", "Aim"], ["Left mouse", "Fire / punch"], ["R", "Reload"], ["Tab (hold)", "Weapon wheel"], ["1 – 8", "Pick a weapon"]] },
  { group: "Driving", keys: [["W / S", "Gas / brake & reverse"], ["A / D", "Steer"], ["Space", "Handbrake"], ["Shift", "Nitro"], ["H", "Horn"], ["V", "Camera"], ["Q", "Radio station"], ["N", "Next song (SALIK FM)"], ["E", "Get out"]] },
  { group: "Cheats (type while playing)", keys: [["THUGSTOOLS", "Weapon set 1"], ["PROFESSIONALTOOLS", "Weapon set 2"], ["NUTTERTOOLS", "Weapon set 3"], ["ASPIRINE", "Full health"], ["PRECIOUSPROTECTION", "Full armour"], ["LEAVEMEALONE", "Lose the police"], ["YOUWONTTAKEMEALIVE", "Wanted +2 stars"], ["BIGBANG", "Blow up nearby cars"]] },
  { group: "Game", keys: [["Esc", "Pause menu"], ["M", "Map"], ["F1", "Controls"], ["Backspace", "Back to your desk"]] },
];
