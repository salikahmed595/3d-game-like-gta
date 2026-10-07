// Empire Customs: per-model tuning bought with street cash (respray, engine, top speed, nitro). Saved in this browser
// only, like street cash: it's the side game and never touches sales data.
import { create } from "zustand";
import type { CarSpec, CarState } from "./drive.ts";

export type Tune = { paint: string | null; engine: number; top: number; nitro: number };
const KEY = "se-garage";
const blank = (): Tune => ({ paint: null, engine: 0, top: 0, nitro: 0 });

function load(): Record<string, Tune> {
  try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch { /* ignore */ }
  return {};
}

type GarageStore = { tunes: Record<string, Tune>; set: (model: string, t: Tune) => void };
export const useGarage = create<GarageStore>((set, get) => ({
  tunes: load(),
  set: (model, t) => {
    const tunes = { ...get().tunes, [model]: t };
    set({ tunes });
    try { localStorage.setItem(KEY, JSON.stringify(tunes)); } catch { /* ignore */ }
  },
}));

export const tuneOf = (model: string): Tune => ({ ...blank(), ...useGarage.getState().tunes[model] });

export const MAX = { engine: 3, top: 3, nitro: 2 };
export const PRICE = { paint: 250, engine: [800, 1600, 3200], top: [1000, 2000, 4000], nitro: [900, 2200] };
export const PAINTS: { name: string; hex: string }[] = [
  { name: "Factory", hex: "" }, { name: "Racing Red", hex: "#d0202a" }, { name: "Midnight Blue", hex: "#1d3c8f" },
  { name: "Lime", hex: "#5fd02a" }, { name: "Sunset Orange", hex: "#ff7a1a" }, { name: "Matte Black", hex: "#1a1b1f" },
  { name: "Pearl White", hex: "#eef0f2" }, { name: "Empire Gold", hex: "#d4a72c" }, { name: "Hot Pink", hex: "#e2378f" },
];

/** Performance after upgrades (top speed never passes the 300 km/h cap). */
export function tuned<T extends CarSpec>(spec: T): T {
  const t = tuneOf(spec.model);
  return { ...spec, top: Math.min(300, spec.top + t.top * 18), accel: spec.accel * (1 + t.engine * 0.16) };
}
export const nitroDrain = (model: string) => 0.22 / (1 + tuneOf(model).nitro * 0.6);

/** Apply a purchase to a live car too, so the change is felt immediately. */
export function refreshCar(c: CarState, base: { top: number; accel: number }): void {
  const t = tuned({ ...c, top: base.top, accel: base.accel });
  c.top = t.top; c.accel = t.accel;
}

// Dev-only handle for scripted browser checks.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__garage = useGarage;
