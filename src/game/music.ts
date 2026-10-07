// Music (the user's own tracks, public/audio/music): the game theme plays from the moment the game opens, at the
// desk and while walking around; get in a car and it crossfades into SALIK FM — the user's songs, shuffled — then
// back to the theme when you get out. Music ducks under sale celebrations and the WASTED / BUSTED screens.
// Plain HTMLAudio (streamed, not decoded into memory), volume/mute follow the game's audio settings.
import { create } from "zustand";
import { getAudioSettings } from "./audio.ts";

const DIR = "/audio/music/";
export const THEME = { file: "theme.mp3", title: "Sales Empire Theme" };
export const SONGS = [
  { file: "arz-kiya-hai.mp3", title: "Arz Kiya Hai" },
  { file: "chittiyaan-kalaiyaan.mp3", title: "Chittiyaan Kalaiyaan" },
  { file: "husn-hai-suhana.mp3", title: "Husn Hai Suhana" },
  { file: "husn.mp3", title: "Husn" },
  { file: "kashmir-main-tu-kanyakumari.mp3", title: "Kashmir Main Tu Kanyakumari" },
  { file: "kisi-disco-mein-jaaye.mp3", title: "Kisi Disco Mein Jaaye" },
  { file: "main-na-mirza-na-mir.mp3", title: "Main Na Mirza Na Mir" },
  { file: "raat-bhar.mp3", title: "Raat Bhar" },
  { file: "teri-akhiyaan-gulaab.mp3", title: "Teri Akhiyaan Gulaab" },
];
export const SALIK_FM = "SALIK FM";

export type MusicMode = "theme" | "radio" | "silent";
type MusicStore = { song: string | null; set: (p: Partial<MusicStore>) => void };
/** Current SALIK FM track (the HUD shows it when it changes). */
export const useMusic = create<MusicStore>((set) => ({ song: null, set: (p) => set(p) }));

const THEME_LEVEL = 0.42, RADIO_LEVEL = 0.75;
const state = { mode: "theme" as MusicMode, duck: 1, started: false, order: [] as number[], pos: -1 };
let theme: HTMLAudioElement | null = null;
let song: HTMLAudioElement | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function make(src: string, loop: boolean): HTMLAudioElement {
  const a = new Audio(src);
  a.loop = loop; a.preload = "auto"; a.volume = 0;
  return a;
}

function shuffle() {
  state.order = SONGS.map((_, i) => i).sort(() => Math.random() - 0.5);
  state.pos = -1;
}

function nextSong() {
  if (!state.order.length || state.pos >= state.order.length - 1) shuffle();
  state.pos++;
  const t = SONGS[state.order[state.pos]];
  if (!song) {
    song = make(DIR + t.file, false);
    song.addEventListener("ended", () => { if (state.mode === "radio") nextSong(); });
    song.addEventListener("error", () => { if (state.mode === "radio") setTimeout(nextSong, 500); });
  } else song.src = DIR + t.file;
  song.volume = 0;
  void song.play().catch(() => undefined);
  useMusic.getState().set({ song: t.title });
}

/** Volume fades toward the targets every 50 ms (smooth crossfades, ducking, mute). */
function tick() {
  const s = getAudioSettings();
  const master = s.muted ? 0 : s.volume * s.music; // Settings > Audio: master volume x music volume
  const fade = (a: HTMLAudioElement | null, target: number) => {
    if (!a) return;
    const v = a.volume + (target - a.volume) * 0.12;
    a.volume = Math.max(0, Math.min(1, Math.abs(target - v) < 0.004 ? target : v));
    if (a.volume === 0 && target === 0 && !a.paused) a.pause();
    if (target > 0 && a.paused) void a.play().catch(() => undefined);
  };
  fade(theme, state.mode === "theme" && s.theme ? THEME_LEVEL * master * state.duck : 0); // the theme can be switched off
  fade(song, state.mode === "radio" ? RADIO_LEVEL * master * state.duck : 0);
}

/** Browsers only allow sound after a click / key press: the theme starts on the first one. */
export function startMusic(): void {
  if (state.started) return;
  state.started = true;
  theme = make(DIR + THEME.file, true);
  void theme.play().catch(() => { state.started = false; theme = null; }); // try again on the next gesture
  timer ??= setInterval(tick, 50);
}

export function setMusicMode(mode: MusicMode): void {
  if (mode === state.mode) return;
  state.mode = mode;
  if (mode === "radio") {
    // Resume the current song if one was playing, else start the next one.
    if (!song || song.ended || !song.src) nextSong();
    else void song.play().catch(() => undefined);
  }
}

export const skipSong = () => { if (state.mode === "radio") nextSong(); };
/** 1 = full, lower = ducked under something more important (a sale, a death screen). */
export const duckMusic = (k: number) => { state.duck = k; };

if (typeof window !== "undefined") {
  const kick = () => startMusic();
  window.addEventListener("pointerdown", kick);
  window.addEventListener("keydown", kick);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__music = { state, startMusic, setMusicMode, skipSong, get theme() { return theme; }, get song() { return song; } };
}
