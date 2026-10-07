import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGame } from "../state/store.ts";
import { STATIONS, playSound, setRadio, unlockAudio } from "../audio.ts";
import { duckMusic, setMusicMode, skipSong } from "../music.ts";
import { interact, keys, nearestInteractable, player, registerInteractables, returnToDesk, startExplore, stepExplore } from "./explore.ts";
import { INTERACTABLES } from "../world/interactions.ts";
import { drivenCar, exitCar, stepCarDamage, stepDrive } from "./drive.ts";
import { WHEEL, reload, selectWeapon, stepWeapons, useArsenal } from "./weapons.ts";
import { fighter, playerPunch, stepFighter } from "./people.ts";
import { stepPolice, useWanted } from "./police.ts";
import { cheatKey } from "./cheats.ts";
import { pause, stepTime, time } from "./time.ts";
import { bumpStat, maxStat } from "./stats.ts";
import { helpOnce } from "./help.ts";
import { stepClock } from "../world/clock.ts";
import { stepAbility, toggleAbility } from "./abilities.ts";
import { switchCam, useSwitch } from "./switcher.ts";
import { orbit } from "../camera/orbit.ts";
import { getCharacter } from "../../../shared/characters.ts";

let lockReleasedAt = 0;
/** Radio slots: 0 = SALIK FM (music.ts), 1.. = the generated stations (audio.ts), null = off. */
export const RADIO_COUNT = 1 + STATIONS.length;
function tuneRadio(st: number | null, driving: boolean) {
  setRadio(st !== null && st > 0 ? st - 1 : null);
  setMusicMode(st === 0 ? "radio" : driving ? "silent" : "theme");
}

/** Career stats (pause menu) and first-time help tips, from what the player is doing this frame. */
const last = { x: 0, z: 0, ok: false, wanted: 0 };
function trackStats(dt: number, gs: ReturnType<typeof useGame.getState>) {
  if (!gs.explore || pause.on) { last.ok = false; return; }
  bumpStat("playTime", dt);
  const car = drivenCar();
  const x = car ? car.x : player.pos.x, z = car ? car.z : player.pos.z;
  if (last.ok) {
    const d = Math.hypot(x - last.x, z - last.z);
    if (d < 30) bumpStat(car ? "driven" : "walked", d); // ignore fast travel / respawn jumps
  }
  last.x = x; last.z = z; last.ok = true;
  if (car) {
    maxStat("topSpeed", Math.abs(car.speed) * 3.6);
    helpOnce("drive", "W / S to drive and brake, A / D to steer. Space is the handbrake, Shift is nitro. Q changes the radio, N skips the song.");
  } else helpOnce("walk", "WASD to walk, Shift to sprint, mouse to look. Esc opens the pause menu — map, missions, stats, settings. F1 lists every control.", 10);
  const stars = useWanted.getState().stars;
  if (stars > 0 && last.wanted === 0) helpOnce("wanted", "You are wanted by the police. Get out of their sight and stay hidden until the stars stop flashing to lose them.");
  last.wanted = stars;
}

const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

const typingInField = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};

/** Keyboard input, per-frame movement and the "press E" prompt. Lives inside the Canvas. */
export function ExploreController() {
  const { camera } = useThree();
  const promptT = useRef(0);

  useEffect(() => registerInteractables(INTERACTABLES), []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typingInField(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const g = useGame.getState();
      // Vice City cheats: just type them while playing. Keys that are spelling one don't also do their usual job.
      if (g.explore && g.panel === "none" && !e.repeat) { const c = cheatKey(k); if (c !== "none" && !MOVE_KEYS.has(k)) return; }
      if (k === "m" && (g.panel === "none" || g.panel === "map")) { e.preventDefault(); g.set({ panel: g.panel === "map" ? "none" : "map" }); return; }
      if (k === "f1") { e.preventDefault(); g.set({ panel: g.panel === "pause" ? "none" : "pause", pauseTab: "controls" }); return; }
      // Esc closes any menu (resumes from the pause menu) — but not the Esc that just opened it by freeing the mouse.
      if (k === "escape" && g.panel !== "none") { if (performance.now() - lockReleasedAt > 400) g.set({ panel: "none" }); return; }
      if (g.panel !== "none") return;
      if (fighter.ko || switchCam.phase !== "idle" || g.deathScreen) return;

      if (g.explore && !e.repeat) {
        // GTA keys: C character wheel, X special ability, V car camera, Q radio station (while driving).
        if (k === "c") { useSwitch.getState().set({ open: !useSwitch.getState().open }); return; }
        if (k === "x") { toggleAbility(getCharacter(g.player?.avatarId).id, !!g.driving); return; }
        if (k === "v" && g.driving) { orbit.carMode = (orbit.carMode + 1) % 3; playSound("ui"); return; }
        if (k === "q" && g.driving) {
          // Stations: SALIK FM (the user's songs), the generated stations, then off.
          const next = g.radio === null ? 0 : g.radio + 1 < RADIO_COUNT ? g.radio + 1 : null;
          g.set({ radio: next }); tuneRadio(next, true); return;
        }
        if (k === "n" && g.driving && g.radio === 0) { skipSong(); return; }
      }
      if (MOVE_KEYS.has(k)) {
        e.preventDefault();
        unlockAudio();
        if (!g.explore) startExplore(); // pressing W at the desk gets up and walks
      }
      if (k === "e" && g.driving) exitCar();
      else if (k === "e" && g.explore && g.prompt) interact(g.prompt.id);
      if (k === " " && g.explore) e.preventDefault(); // handbrake / jump, not page scroll
      if (k === "f" && !e.repeat && !g.driving) {
        if (!g.explore) startExplore();
        playerPunch();
      }
      if (g.explore && !g.driving) {
        // GTA weapon keys: R reload, Tab (hold) weapon wheel, 1-8 pick a slot directly.
        if (k === "r" && !e.repeat) reload();
        if (k === "tab") { e.preventDefault(); if (!e.repeat) useArsenal.getState().set({ wheel: true }); return; }
        const slot = Number(k);
        if (slot >= 1 && slot <= WHEEL.length && !e.repeat) selectWeapon(WHEEL[slot - 1]);
      }
      // Esc is the pause menu, GTA-style. (With the mouse captured the browser eats Esc to free it: the
      // pointer-lock handler below opens the menu then.) Going back to the desk is Backspace / the pause menu.
      if (k === "escape" && g.explore && performance.now() - lockReleasedAt > 400 && !document.pointerLockElement) { g.set({ panel: "pause", pauseTab: "map" }); return; }
      if (k === "backspace" && g.explore && !g.driving) { e.preventDefault(); returnToDesk(); }
      keys.add(k);
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.delete(k);
      if (k === "tab") useArsenal.getState().set({ wheel: false }); // releasing Tab equips the highlighted weapon
    };
    const clear = () => { keys.clear(); useArsenal.getState().set({ wheel: false }); };
    const lock = () => {
      if (document.pointerLockElement) return;
      lockReleasedAt = performance.now();
      // Esc while the mouse is captured pauses the game, like GTA. Losing the mouse because you clicked another
      // window doesn't: the game keeps running (the window still having focus is how we tell Esc apart).
      setTimeout(() => {
        const g = useGame.getState();
        if (!document.hasFocus() || document.pointerLockElement) return;
        if (g.explore && g.panel === "none" && !g.deathScreen && !fighter.ko) g.set({ panel: "pause", pauseTab: "map" });
      }, 60);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("pointerlockchange", lock);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clear); document.removeEventListener("pointerlockchange", lock); };
  }, []);

  const wasDriving = useRef(false);
  useFrame((_, dtRaw) => {
    const dt = Math.max(0, Math.min(dtRaw, 0.05)); // never negative (out-of-order frame timestamps)
    const gs = useGame.getState();
    // Pause menu (and the full map while roaming) freeze the world.
    pause.on = gs.explore && (gs.panel === "pause" || gs.panel === "map");
    stepTime(dt);
    if (!pause.on) stepClock(dt);
    trackStats(dt, gs);
    // Music: SALIK FM (the user's songs) when you get in a car; the theme on foot and at the desk.
    if (!!gs.driving !== wasDriving.current) {
      wasDriving.current = !!gs.driving;
      const st = gs.driving ? 0 : null;
      gs.set({ radio: st }); tuneRadio(st, !!gs.driving);
    }
    // Music ducks under sale celebrations and the WASTED / BUSTED screens.
    duckMusic(gs.deathScreen ? 0.2 : gs.mode !== "idle" ? 0.3 : pause.on ? 0.55 : 1);
    if (pause.on) return;
    stepAbility(dt, !!gs.driving);
    if (gs.driving) stepDrive(dt);
    else if (!fighter.ko && switchCam.phase === "idle") stepExplore(dt * time.self, camera);
    stepFighter(dt * time.self);
    stepWeapons(dt * time.self, camera);
    stepCarDamage(dt * time.world);
    stepPolice(dt * time.world);
    promptT.current -= dt;
    if (promptT.current > 0) return;
    promptT.current = 0.15;
    const g = useGame.getState();
    const near = g.explore && !g.driving && g.mode === "idle" ? nearestInteractable() : null;
    const label = near?.label() ?? null;
    if ((near?.id ?? null) !== (g.prompt?.id ?? null) || label !== (g.prompt?.label ?? null)) {
      g.set({ prompt: near && label ? { id: near.id, label } : null });
    }
  });

  return null;
}
