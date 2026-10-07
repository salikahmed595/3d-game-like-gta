// Special abilities (GTA V style), one per playable character, on X while the meter has charge:
//   Salik: Focus Drive (slows the world while driving), Soldier Boy: Rage (fists hit 3x harder, you take far less
//   damage), Aesthetic Boy: Bullet Time (slows the world on foot). The meter drains while active and recharges
//   slowly, faster from stunts, drifts and landed punches.
import { create } from "zustand";
import { playSound } from "../audio.ts";
import { normalTime, slowMo } from "./time.ts";

export type AbilityKind = "focus" | "rage" | "bullet";
export const ABILITIES: Record<string, { kind: AbilityKind; name: string; blurb: string }> = {
  salik: { kind: "focus", name: "Focus Drive", blurb: "Slows the world while you drive" },
  soldier: { kind: "rage", name: "Rage", blurb: "Hit three times harder, take a fraction of the damage" },
  aesthetic: { kind: "bullet", name: "Bullet Time", blurb: "Slows the world while you're on foot" },
};

export const ability = { meter: 1, active: null as AbilityKind | null };
export const useAbility = create<{ active: AbilityKind | null; set: (a: AbilityKind | null) => void }>((set) => ({ active: null, set: (active) => set({ active }) }));

const DRAIN = 0.11, RECHARGE = 0.018;
const allowed = (kind: AbilityKind, driving: boolean) => (kind === "focus" ? driving : !driving);

export function toggleAbility(charId: string, driving: boolean): void {
  const def = ABILITIES[charId];
  if (!def) return;
  if (ability.active) { stop(); return; }
  if (ability.meter < 0.15 || !allowed(def.kind, driving)) { playSound("ui"); return; }
  ability.active = def.kind;
  useAbility.getState().set(def.kind);
  playSound("nitro");
  if (def.kind === "focus") slowMo(0.4, 0.8);
  if (def.kind === "bullet") slowMo(0.3, 0.9);
}

function stop() {
  if (ability.active && ability.active !== "rage") normalTime();
  ability.active = null;
  useAbility.getState().set(null);
}

export function stepAbility(dt: number, driving: boolean): void {
  if (ability.active) {
    ability.meter = Math.max(0, ability.meter - DRAIN * dt);
    if (ability.meter <= 0 || !allowed(ability.active, driving)) stop();
  } else ability.meter = Math.min(1, ability.meter + RECHARGE * dt);
}

export const chargeAbility = (amount: number) => { if (!ability.active) ability.meter = Math.min(1, ability.meter + amount); };
export const rageOn = () => ability.active === "rage";
export const cancelAbility = () => { if (ability.active) stop(); };

// Dev-only handle for scripted browser checks.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ability = { ability, toggleAbility };
