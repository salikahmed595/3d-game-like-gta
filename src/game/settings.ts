// Graphics settings (like GTA's Settings > Graphics): a preset plus every individual option, saved per browser.
// Low runs on integrated laptop GPUs (e.g. Intel HD 520); Ultra is for gaming PCs. First run picks a preset
// from the GPU name. Purely presentation: nothing here touches game or sales data.
import { create } from "zustand";

export type Preset = "low" | "medium" | "high" | "ultra" | "custom";
export type Graphics = {
  preset: Preset;
  /** Render resolution as a fraction of the screen's (0.5 = half). */
  resolution: number;
  /** Lower the resolution automatically when the frame rate drops (keeps it playable on slow PCs). */
  dynamicRes: boolean;
  antialias: boolean;
  shadows: boolean;
  /** Far haze / how far districts, props and people are drawn (metres). */
  viewDistance: number;
  /** Highway cars around the player. */
  traffic: number;
  /** Extra pedestrians on top of the cast. */
  crowd: number;
  /** Blood, sparks, tyre smoke. */
  effects: "low" | "high";
  /** Lamp light pools, headlight beams at night. */
  nightLights: boolean;
  showFps: boolean;
};

export const PRESETS: Record<Exclude<Preset, "custom">, Omit<Graphics, "preset" | "showFps" | "dynamicRes">> = {
  low: { resolution: 0.85, antialias: false, shadows: false, viewDistance: 900, traffic: 8, crowd: 0, effects: "low", nightLights: false },
  medium: { resolution: 1, antialias: false, shadows: false, viewDistance: 1500, traffic: 14, crowd: 2, effects: "high", nightLights: true },
  high: { resolution: 1, antialias: true, shadows: true, viewDistance: 2200, traffic: 18, crowd: 4, effects: "high", nightLights: true },
  ultra: { resolution: 1.5, antialias: true, shadows: true, viewDistance: 3200, traffic: 26, crowd: 8, effects: "high", nightLights: true },
};

const KEY = "se-graphics";
const VERSION = 2;

/** Weak integrated GPUs start on Low, other integrated ones on Medium, discrete cards on High. */
export function detectPreset(): Exclude<Preset, "custom"> {
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    if (!gl) return "low";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    if (/hd graphics|uhd graphics|hd \d{3}|mali|adreno|powervr|swiftshader|llvmpipe|basic render/.test(name)) return "low";
    if (/intel|iris|apple m1|radeon\(tm\) graphics|vega \d/.test(name)) return "medium";
    if (/rtx|rx 6|rx 7|rx 9|apple m[2-9]/.test(name)) return "ultra";
    return "high";
  } catch { return "medium"; }
}

function initial(): Graphics {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const g = JSON.parse(saved) as Partial<Graphics> & { v?: number };
      const base = PRESETS[g.preset && g.preset !== "custom" ? g.preset : "medium"];
      // Saves from before v2 (blurrier Low preset): a named preset picks up its new values.
      if (g.v !== VERSION && g.preset && g.preset !== "custom") return { showFps: false, dynamicRes: true, ...g, ...base, preset: g.preset };
      return { preset: "medium", showFps: false, dynamicRes: true, ...base, ...g };
    }
  } catch { /* storage blocked or bad JSON: detect again */ }
  const preset = detectPreset();
  return { preset, showFps: false, dynamicRes: true, ...PRESETS[preset] };
}

type Store = Graphics & {
  set: (patch: Partial<Graphics>) => void;
  applyPreset: (p: Exclude<Preset, "custom">) => void;
};

const save = (g: Graphics) => {
  try {
    const { preset, resolution, dynamicRes, antialias, shadows, viewDistance, traffic, crowd, effects, nightLights, showFps } = g;
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, preset, resolution, dynamicRes, antialias, shadows, viewDistance, traffic, crowd, effects, nightLights, showFps }));
  } catch { /* ignore */ }
};

export const useGraphics = create<Store>((set, get) => ({
  ...initial(),
  // Changing any single option turns the preset into "custom" (the UI shows it, like GTA).
  set: (patch) => { set({ ...patch, preset: "preset" in patch ? patch.preset! : patch.showFps !== undefined || patch.dynamicRes !== undefined ? get().preset : "custom" }); save(get()); },
  applyPreset: (p) => { set({ preset: p, ...PRESETS[p] }); save(get()); },
}));

/** Non-React readers (per-frame code) use this. */
export const gfx = () => useGraphics.getState();

/** Dynamic resolution: the live scale the renderer actually uses (≤ the chosen resolution). */
export const dynRes = { scale: 1, fps: 60 };

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gfx = { useGraphics, dynRes, detectPreset };
