// Single audio helper: synthesized cues (no asset files needed), with mute + volume.
import { create } from "zustand";
export type SoundCue = "phone" | "sale" | "coin" | "xp" | "levelup" | "upgrade" | "bigsale" | "trophy" | "boss-hit" | "boss-defeat" | "crumble" | "ui"
  // open world
  | "crash" | "crash-big" | "punch" | "whoosh" | "thud" | "checkpoint" | "mission-start" | "mission-passed" | "mission-failed" | "ko" | "cash" | "door" | "nitro" | "step"
  // combat
  | "shot-pistol" | "shot-smg" | "shot-rifle" | "shot-sniper" | "shot-plasma" | "shot-heavy" | "shot-distant" | "shot-none"
  | "reload" | "dry-fire" | "equip" | "ricochet" | "bullet-hit" | "explosion" | "wasted" | "pickup";

const STORAGE_KEY = "se-audio";
let ctx: AudioContext | null = null;
/** volume = master (everything), music = songs / theme / radio on top of master, theme = background theme on/off. */
let settings = { muted: false, volume: 0.6, music: 0.7, theme: true };

try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) settings = { ...settings, ...JSON.parse(saved) };
} catch { /* storage may be blocked; defaults are fine */ }

export const getAudioSettings = () => ({ ...settings });
export type AudioSettings = typeof settings;
/** React view of the settings: every control showing them (dock, pause menu) stays in sync. */
export const useAudioSettings = create<{ s: AudioSettings }>(() => ({ s: { ...settings } }));
export function setAudioSettings(next: Partial<typeof settings>): void {
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  settings = { ...settings, ...next, volume: clamp(next.volume ?? settings.volume), music: clamp(next.music ?? settings.music) };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  useAudioSettings.setState({ s: { ...settings } });
}

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

// Browsers block audio until a gesture; call once from any click.
export const unlockAudio = () => { audio(); };

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  // Cap peak level so cues are never extremely loud.
  const peak = gain * settings.volume * 0.35;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(start: number, dur: number, gain: number, lowpass = 1200): void {
  const c = audio();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const g = c.createGain();
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  g.gain.value = gain * settings.volume * 0.4;
  src.buffer = buf;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

export function playSound(cue: SoundCue): void {
  if (settings.muted) return;
  switch (cue) {
    case "phone": [0, 0.28].forEach((s) => { tone(880, s, 0.12, "square", 0.5); tone(1040, s + 0.13, 0.12, "square", 0.5); }); break;
    case "sale": tone(660, 0, 0.12, "triangle", 0.8); tone(880, 0.1, 0.12, "triangle", 0.8); tone(1320, 0.2, 0.3, "triangle", 0.8); break;
    case "coin": tone(1568, 0, 0.08, "square", 0.4); tone(2093, 0.07, 0.25, "square", 0.4); break;
    case "xp": tone(520, 0, 0.1, "sine", 0.6, 1040); break;
    case "levelup": [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.25, "triangle", 0.8)); break;
    case "upgrade": noise(0, 0.5, 0.6, 800); [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25 + i * 0.1, 0.35, "sawtooth", 0.4)); break;
    case "bigsale": [392, 523, 659, 784, 988, 1175].forEach((f, i) => tone(f, i * 0.08, 0.4, "triangle", 0.9)); break;
    case "trophy": tone(1175, 0, 0.15, "sine", 0.7); tone(1568, 0.12, 0.5, "sine", 0.7); break;
    case "boss-hit": noise(0, 0.25, 0.9, 600); tone(110, 0, 0.3, "sawtooth", 0.8, 50); break;
    case "boss-defeat": noise(0, 1.0, 1, 500); [262, 330, 392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4 + i * 0.12, 0.6, "triangle", 0.9)); break;
    case "crumble": noise(0, 1.2, 0.9, 400); break;
    case "ui": tone(700, 0, 0.05, "sine", 0.3); break;
    case "crash": noise(0, 0.35, 0.9, 900); tone(140, 0, 0.25, "sawtooth", 0.5, 60); tone(1900, 0.02, 0.18, "square", 0.12, 900); break;
    case "crash-big": noise(0, 0.9, 1, 700); noise(0.05, 0.6, 0.6, 3500); tone(90, 0, 0.6, "sawtooth", 0.8, 35); [2400, 3100, 1700].forEach((f, i) => tone(f, 0.05 + i * 0.07, 0.25, "square", 0.08, f * 0.6)); break;
    case "punch": noise(0, 0.09, 1, 1400); tone(95, 0, 0.14, "sine", 1, 55); break;
    case "whoosh": noise(0, 0.16, 0.35, 2600); break;
    case "thud": noise(0, 0.22, 0.9, 500); tone(70, 0, 0.25, "sine", 0.9, 40); break;
    case "checkpoint": tone(988, 0, 0.09, "square", 0.45); tone(1319, 0.08, 0.18, "square", 0.45); break;
    case "mission-start": [196, 247, 294, 392].forEach((f, i) => tone(f, i * 0.12, 0.3, "sawtooth", 0.35)); noise(0, 0.5, 0.2, 300); break;
    case "mission-passed": [392, 494, 587, 784, 988].forEach((f, i) => tone(f, i * 0.13, 0.45, "triangle", 0.9)); tone(1568, 0.7, 0.8, "sine", 0.5); break;
    case "mission-failed": [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.22, 0.4, "sawtooth", 0.5)); break;
    case "ko": tone(400, 0, 0.6, "sawtooth", 0.5, 80); noise(0.1, 0.4, 0.5, 400); break;
    case "cash": [1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.18, "square", 0.35)); break;
    case "door": noise(0, 0.08, 0.6, 1800); tone(220, 0.02, 0.08, "square", 0.3, 120); break;
    case "nitro": noise(0, 0.6, 0.5, 5000); tone(300, 0, 0.5, "sawtooth", 0.25, 900); break;
    case "step": noise(0, 0.05, 0.22, 700); break;
    // Gunshots: a sharp crack (bright noise), a body thump, and a short low tail standing in for the street echo.
    case "shot-pistol": noise(0, 0.07, 1, 5200); tone(160, 0, 0.09, "sine", 0.9, 60); noise(0.03, 0.35, 0.35, 700); break;
    case "shot-smg": noise(0, 0.05, 0.85, 4200); tone(130, 0, 0.07, "sine", 0.8, 55); noise(0.02, 0.18, 0.25, 600); break;
    case "shot-rifle": noise(0, 0.07, 1, 6500); tone(110, 0, 0.1, "sine", 1, 45); noise(0.03, 0.4, 0.4, 800); break;
    case "shot-sniper": noise(0, 0.12, 1, 7000); tone(70, 0, 0.3, "sine", 1, 30); noise(0.05, 1.1, 0.5, 600); break;
    case "shot-plasma": tone(1800, 0, 0.16, "sawtooth", 0.35, 220); tone(900, 0, 0.2, "square", 0.25, 120); noise(0, 0.08, 0.3, 3000); break;
    case "shot-heavy": noise(0, 0.25, 1, 2500); tone(60, 0, 0.45, "sawtooth", 0.9, 30); break;
    case "shot-distant": noise(0, 0.06, 0.45, 2200); noise(0.02, 0.3, 0.18, 500); break;
    case "shot-none": break;
    case "reload": noise(0, 0.04, 0.5, 3000); noise(0.35, 0.05, 0.6, 2400); tone(900, 0.36, 0.03, "square", 0.2); break;
    case "dry-fire": noise(0, 0.025, 0.5, 4000); tone(1400, 0, 0.02, "square", 0.15); break;
    case "equip": noise(0, 0.05, 0.45, 2600); tone(600, 0.04, 0.04, "square", 0.15); break;
    case "ricochet": tone(2600, 0, 0.25, "sine", 0.2, 900); break;
    case "bullet-hit": noise(0, 0.06, 0.8, 1600); tone(120, 0, 0.1, "sine", 0.7, 60); break;
    case "explosion": noise(0, 1.6, 1, 600); noise(0, 0.3, 1, 3000); tone(55, 0, 1.2, "sawtooth", 1, 25); break;
    case "wasted": tone(220, 0, 1.6, "sawtooth", 0.35, 55); tone(110, 0.1, 1.8, "sine", 0.6, 40); noise(0, 0.6, 0.3, 300); break;
    case "pickup": tone(880, 0, 0.08, "square", 0.35); tone(1320, 0.07, 0.15, "square", 0.35); break;
  }
}

// ---------------------------------------------------------------- continuous car sound (engine, wind, tyres, horn)
type Loop = { gain: GainNode; set: (p: EngineParams) => void; stop: () => void };
export type EngineParams = { rpm: number; throttle: number; speed: number; slip: number; boost: boolean };
let loops: Loop[] | null = null;
let horn: { osc: OscillatorNode[]; gain: GainNode } | null = null;

function noiseLoop(c: AudioContext): AudioBufferSourceNode {
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf; src.loop = true; src.start();
  return src;
}

function buildLoops(c: AudioContext): Loop[] {
  // Engine: two detuned oscillators through a soft clipper and a throttle-controlled low-pass.
  const o1 = c.createOscillator(), o2 = c.createOscillator(), o3 = c.createOscillator();
  o1.type = "sawtooth"; o2.type = "square"; o3.type = "sine";
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 2.4); }
  shaper.curve = curve;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 3;
  const eg = c.createGain(); eg.gain.value = 0;
  const mix = c.createGain(); mix.gain.value = 0.5;
  o1.connect(mix); o2.connect(mix); o3.connect(eg);
  mix.connect(shaper).connect(lp).connect(eg).connect(c.destination);
  [o1, o2, o3].forEach((o) => o.start());
  const engine: Loop = { gain: eg, stop: () => [o1, o2, o3].forEach((o) => o.stop()), set: (p) => {
    const t = c.currentTime;
    const f = 22 + (p.rpm / 60) * 1.6; // firing frequency-ish
    o1.frequency.setTargetAtTime(f, t, 0.04);
    o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    o3.frequency.setTargetAtTime(f * 0.25, t, 0.04);
    lp.frequency.setTargetAtTime(300 + p.throttle * 1500 + p.rpm * 0.12 + (p.boost ? 900 : 0), t, 0.05);
    eg.gain.setTargetAtTime((0.12 + p.throttle * 0.13) * settings.volume, t, 0.08);
  } };
  // Wind: band-passed noise, grows with the square of speed.
  const wn = noiseLoop(c);
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 0.6;
  const wg = c.createGain(); wg.gain.value = 0;
  wn.connect(bp).connect(wg).connect(c.destination);
  const wind: Loop = { gain: wg, stop: () => wn.stop(), set: (p) => {
    const k = Math.min(p.speed / 80, 1);
    bp.frequency.setTargetAtTime(500 + k * 1400, c.currentTime, 0.2);
    wg.gain.setTargetAtTime(k * k * 0.32 * settings.volume, c.currentTime, 0.15);
  } };
  // Tyres: a narrow squeal that follows lateral slip.
  const tn = noiseLoop(c);
  const tb = c.createBiquadFilter(); tb.type = "bandpass"; tb.frequency.value = 2300; tb.Q.value = 9;
  const tg = c.createGain(); tg.gain.value = 0;
  tn.connect(tb).connect(tg).connect(c.destination);
  const tyres: Loop = { gain: tg, stop: () => tn.stop(), set: (p) => {
    const k = Math.max(0, Math.min((p.slip - 2.5) / 7, 1));
    tb.frequency.setTargetAtTime(2000 + Math.sin(c.currentTime * 31) * 250, c.currentTime, 0.02);
    tg.gain.setTargetAtTime(k * 0.55 * settings.volume, c.currentTime, 0.05);
  } };
  return [engine, wind, tyres];
}

/** Call every frame while driving (null when not driving, which fades everything out). */
export function setEngine(p: EngineParams | null): void {
  const c = audio();
  if (!c) return;
  if (!p || settings.muted) {
    if (loops) {
      // Fade out, then stop the sources entirely so nothing keeps processing silence while you walk.
      const old = loops;
      loops = null;
      old.forEach((l) => l.gain.gain.setTargetAtTime(0, c.currentTime, 0.12));
      setTimeout(() => old.forEach((l) => l.stop()), 800);
    }
    return;
  }
  loops ??= buildLoops(c);
  loops.forEach((l) => l.set(p));
}

export function setHorn(on: boolean): void {
  const c = audio();
  if (!c) return;
  if (!horn) {
    const gain = c.createGain(); gain.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
    const osc = [392, 494].map((f) => { const o = c.createOscillator(); o.type = "square"; o.frequency.value = f; o.connect(lp); o.start(); return o; });
    lp.connect(gain).connect(c.destination);
    horn = { osc, gain };
  }
  horn.gain.gain.setTargetAtTime(on && !settings.muted ? 0.09 * settings.volume : 0, c.currentTime, 0.015);
}

// ---------------------------------------------------------------- ambience (city murmur / open-country wind)
let amb: { city: GainNode; country: GainNode; stop: () => void } | null = null;
export function setAmbient(city: number, country: number): void {
  const c = audio();
  if (!c) return;
  if (!amb) {
    if (city <= 0 && country <= 0) return;
    const srcs: AudioBufferSourceNode[] = [];
    const mk = (type: BiquadFilterType, f: number, q: number) => {
      const src = noiseLoop(c);
      srcs.push(src);
      const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(flt).connect(g).connect(c.destination);
      return g;
    };
    amb = { city: mk("bandpass", 380, 0.7), country: mk("lowpass", 420, 0.5), stop: () => srcs.forEach((x) => x.stop()) };
  }
  if (city <= 0 && country <= 0) {
    const old = amb;
    amb = null;
    old.city.gain.setTargetAtTime(0, c.currentTime, 0.3);
    old.country.gain.setTargetAtTime(0, c.currentTime, 0.3);
    setTimeout(() => old.stop(), 1500);
    return;
  }
  const v = settings.muted ? 0 : settings.volume;
  amb.city.gain.setTargetAtTime(city * 0.05 * v, c.currentTime, 0.8);
  amb.country.gain.setTargetAtTime(country * 0.035 * v, c.currentTime, 0.8);
}

// ---------------------------------------------------------------- police siren (two-tone wail, volume by distance)
let siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
export function setSiren(level: number): void {
  const c = audio();
  if (!c) return;
  if (!siren) {
    if (level <= 0) return;
    const osc = c.createOscillator(); osc.type = "square"; osc.frequency.value = 760;
    const lfo = c.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.55;
    const depth = c.createGain(); depth.gain.value = 260;
    lfo.connect(depth).connect(osc.frequency);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800;
    const gain = c.createGain(); gain.gain.value = 0;
    osc.connect(lp).connect(gain).connect(c.destination);
    osc.start(); lfo.start();
    siren = { osc, lfo, gain };
  }
  if (level <= 0) {
    const old = siren;
    siren = null;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.2);
    setTimeout(() => { old.osc.stop(); old.lfo.stop(); }, 1200);
    return;
  }
  siren.gain.gain.setTargetAtTime(settings.muted ? 0 : Math.min(level, 1) * 0.07 * settings.volume, c.currentTime, 0.2);
}

// ---------------------------------------------------------------- street voices (speech synthesis, throttled)
let lastBark = 0;
export function bark(lines: string[], pitch = 1): void {
  if (settings.muted || typeof speechSynthesis === "undefined") return;
  const now = performance.now();
  if (now - lastBark < 1800) return;
  lastBark = now;
  try {
    const u = new SpeechSynthesisUtterance(lines[Math.floor(Math.random() * lines.length)]);
    u.rate = 1.15; u.pitch = pitch; u.volume = Math.min(1, settings.volume * 1.4);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* voices are optional */ }
}

// ---------------------------------------------------------------- car radio (procedurally generated stations)
// Each station is a small sequencer: drums from filtered noise / pitched sines, a bassline, chords and a lead,
// following a four-bar progression. Notes are scheduled ~0.3 s ahead on the audio clock so timing stays tight.
type Station = {
  name: string; bpm: number; swing: number;
  kick: string; snare: string; hat: string; open?: string; // 16-step patterns ("x" = hit)
  prog: { root: number; minor: boolean }[]; // one chord per bar (MIDI root)
  bass: string; stab?: string; arp?: boolean; pad?: boolean; keys?: boolean; tone: number; // lead filter
};
export const STATIONS: Station[] = [
  { name: "EMPIRE FM", bpm: 100, swing: 0, kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x.", bass: "x.x.x.x.x.x.x.x.",
    prog: [{ root: 45, minor: true }, { root: 41, minor: false }, { root: 48, minor: false }, { root: 43, minor: false }], arp: true, pad: true, tone: 2600 },
  { name: "NON-STOP SALES", bpm: 122, swing: 0, kick: "x...x...x...x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", open: "..x...x...x...x.", bass: "..x...x...x...x.", stab: "...x.......x....",
    prog: [{ root: 41, minor: true }, { root: 37, minor: false }, { root: 44, minor: false }, { root: 39, minor: false }], tone: 3200 },
  { name: "LO-FI LOUNGE", bpm: 78, swing: 0.035, kick: "x......x..x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", bass: "x.....x.........",
    prog: [{ root: 41, minor: false }, { root: 40, minor: true }, { root: 38, minor: true }, { root: 36, minor: false }], keys: true, tone: 1400 },
];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
let radio: { out: GainNode; station: number; step: number; next: number; timer: ReturnType<typeof setInterval> } | null = null;
let noiseBuf: AudioBuffer | null = null;

function voice(c: AudioContext, out: AudioNode, f: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff = 4000) {
  const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
  o.type = type; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp).connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function hit(c: AudioContext, out: AudioNode, t: number, kind: "kick" | "snare" | "hat" | "open") {
  if (kind === "kick") {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.32);
    return;
  }
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf;
  f.type = kind === "snare" ? "bandpass" : "highpass";
  f.frequency.value = kind === "snare" ? 1800 : 7000;
  const len = kind === "snare" ? 0.18 : kind === "open" ? 0.22 : 0.05;
  g.gain.setValueAtTime(kind === "snare" ? 0.5 : 0.18, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + len + 0.02);
}

function scheduleStep(c: AudioContext, out: AudioNode, st: Station, step: number, t: number) {
  const s = step % 16, bar = Math.floor(step / 16) % st.prog.length;
  const ch = st.prog[bar];
  const third = ch.minor ? 3 : 4;
  const tones = [0, third, 7];
  if (st.kick[s] === "x") hit(c, out, t, "kick");
  if (st.snare[s] === "x") hit(c, out, t, "snare");
  if (st.hat[s] === "x") hit(c, out, t, "hat");
  if (st.open?.[s] === "x") hit(c, out, t, "open");
  const sixteenth = 60 / st.bpm / 4;
  if (st.bass[s] === "x") voice(c, out, midi(ch.root), t, sixteenth * 1.8, "sawtooth", 0.22, 500);
  if (st.stab?.[s] === "x") tones.forEach((n) => voice(c, out, midi(ch.root + 24 + n), t, sixteenth * 1.5, "square", 0.05, st.tone));
  if (st.arp) voice(c, out, midi(ch.root + 24 + tones[s % 3] + (s % 6 >= 3 ? 12 : 0)), t, sixteenth * 0.9, "square", 0.045, st.tone);
  if (st.pad && s === 0) tones.forEach((n) => voice(c, out, midi(ch.root + 12 + n), t, sixteenth * 16, "triangle", 0.06, 1800));
  if (st.keys && (s === 0 || s === 10)) [...tones, ch.minor ? 10 : 11].forEach((n) => voice(c, out, midi(ch.root + 12 + n) * (1 + (Math.random() - 0.5) * 0.004), t, sixteenth * 7, "sine", 0.07, st.tone));
  if (st.keys && s % 4 === 2 && Math.random() < 0.6) voice(c, out, midi(ch.root + 24 + tones[Math.floor(Math.random() * 3)]), t, sixteenth * 2, "triangle", 0.04, st.tone);
}

/** Tune the radio: a station index, or null for off. */
export function setRadio(station: number | null): void {
  const c = audio();
  if (!c) return;
  if (radio && (station === null || station !== radio.station)) {
    const r = radio;
    clearInterval(r.timer);
    r.out.gain.setTargetAtTime(0, c.currentTime, 0.05);
    setTimeout(() => r.out.disconnect(), 400);
    radio = null;
  }
  if (station === null || radio) return;
  const out = c.createGain();
  out.gain.value = settings.muted ? 0 : 0.32 * settings.volume * settings.music;
  out.connect(c.destination);
  const st = STATIONS[station];
  const r = { out, station, step: 0, next: c.currentTime + 0.1, timer: 0 as unknown as ReturnType<typeof setInterval> };
  r.timer = setInterval(() => {
    out.gain.setTargetAtTime(settings.muted ? 0 : 0.32 * settings.volume * settings.music, c.currentTime, 0.1);
    const sixteenth = 60 / st.bpm / 4;
    while (r.next < c.currentTime + 0.3) {
      scheduleStep(c, out, st, r.step, r.next + (r.step % 2 ? st.swing : 0));
      r.next += sixteenth;
      r.step++;
    }
  }, 60);
  radio = r;
}
