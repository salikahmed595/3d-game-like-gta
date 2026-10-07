import { AnimatePresence, motion } from "framer-motion";
import { useProgress } from "@react-three/drei";
import { useGame } from "../../game/state/store.ts";
import { formatMoney } from "../../../shared/engine.ts";
import { playSound, setAudioSettings, unlockAudio, useAudioSettings } from "../../game/audio.ts";
import { useEffect, useRef, useState } from "react";
import { interact, startExplore } from "../../game/systems/explore.ts";
import { exitCar } from "../../game/systems/drive.ts";
import { useHelp } from "../../game/systems/help.ts";
import { OpenWorldHud } from "./OpenWorldHud.tsx";
import { dynRes, useGraphics } from "../../game/settings.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./Icon.tsx";

// Loading screen tips (GTA shows one per load).
const TIPS = [
  "Every sale you log shows up in your office: bigger deals, bigger celebrations.",
  "Press Esc while exploring for the pause menu: map, missions, stats and settings.",
  "Slow PC? Settings › Graphics › Low keeps the city smooth on laptop graphics.",
  "Tuck in behind traffic on the highway: the slipstream cuts your drag almost in half.",
  "Street cash comes from missions only. It never touches your real revenue or XP.",
  "Turn the theme music off from the Music button; SALIK FM still plays in cars.",
];
const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
const firstLoad = { done: false };

export function Loader() {
  const { progress, active } = useProgress();
  const config = useGame((s) => s.config);
  const loadError = useGame((s) => s.loadError);
  const avatarReady = useGame((s) => s.avatarReady);
  // The office is playable as soon as the player's character is in; the city keeps streaming behind it. After the
  // first load, districts stream in silently (no loading bar popping up mid-game).
  if (config && (avatarReady || !active)) {
    if (!active) firstLoad.done = true;
    return active && !firstLoad.done ? <div className="city-loading" role="status"><i style={{ width: `${progress}%` }} /><span>Loading city {Math.round(progress)}%</span></div> : null;
  }
  return (
    <div className="loader" role="status">
      <div className="loader-mark">SALES <b>EMPIRE</b></div>
      <div className="loader-title">{loadError ? "Could not reach the server" : "Every sale builds your empire"}</div>
      {loadError ? <div className="loader-sub">{loadError} Is the API running?</div> : (
        <>
          <div className="loader-bar"><div style={{ width: `${config ? progress : 5}%` }} /></div>
          <div className="loader-tip">{tip}</div>
        </>
      )}
    </div>
  );
}

export function Hud() {
  const shown = useGame((s) => s.shown);
  const config = useGame((s) => s.config);
  const connection = useGame((s) => s.connection);
  const explore = useGame((s) => s.explore);
  useFirstRunCharacterPicker();
  if (!shown || !config) return null;
  const money = (n: number) => formatMoney(n, config.brand);
  const targetRatio = Math.min(shown.monthlyRevenue / Math.max(shown.monthlyTarget, 1), 1);
  const near = targetRatio >= 0.85 && targetRatio < 1;
  const over = shown.monthlyRevenue >= shown.monthlyTarget;
  return (
    <>
      {/* At the desk: one compact card, top left. The office is the hero; the HUD only frames it. */}
      {!explore && (
        <div className={`desk-card ${near ? "near" : ""}`} style={{ ["--brand" as string]: config.brand.primaryColor }}>
          <div className="dc-brand"><i />{config.brand.companyName}<span>{config.brand.playerTitle}</span></div>
          <div className="dc-rev" aria-label={`Monthly target ${Math.round(targetRatio * 100)} percent`}>
            {money(shown.monthlyRevenue)}<span>/ {money(shown.monthlyTarget)}</span>{over && <em>Target hit</em>}
          </div>
          <div className="dc-bar"><motion.div animate={{ width: `${targetRatio * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} /></div>
          <div className="dc-level"><b>LV {shown.level}</b>{shown.rank}<span>{shown.xp.toLocaleString()} XP</span></div>
          <div className="dc-bar xp"><motion.div animate={{ width: `${shown.levelProgress.ratio * 100}%` }} transition={{ duration: 0.8 }} /></div>
          <div className="dc-next">
            {shown.nextUnlock ? <>Next: {shown.nextUnlock.name} · <b>{money(shown.nextUnlock.revenueLeft)} to go</b></> : "All offices unlocked"}
          </div>
        </div>
      )}
      {!explore && shown.streak > 0 && <div className="streak-chip" title="Sales-day streak"><Icon name="fire" size={15} />{shown.streak} day streak</div>}
      {!explore && <Dock />}
      {connection === "offline" && <div className="chip warn offline-chip" role="status">Reconnecting…</div>}
      <ExploreHud />
    </>
  );
}

/** Onboarding: a player who has never chosen a character is offered the picker once (not in the scripted demo). */
function useFirstRunCharacterPicker() {
  const needsPick = useGame((s) => s.userId !== "demo" && !!s.player && s.player.avatarId === null);
  const offered = useRef(false);
  useEffect(() => {
    if (!needsPick || offered.current) return;
    offered.current = true;
    if (useGame.getState().panel === "none") useGame.getState().set({ panel: "character" });
  }, [needsPick]);
}

/** Interaction prompt, GTA help text and the mouse hint while roaming; the fade used for cinematic cuts. */
function ExploreHud() {
  const explore = useGame((s) => s.explore);
  const prompt = useGame((s) => s.prompt);
  const fade = useGame((s) => s.fade);
  const driving = useGame((s) => s.driving);
  const deathScreen = useGame((s) => s.deathScreen);
  const paused = useGame((s) => s.panel !== "none");
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const f = () => setLocked(!!document.pointerLockElement);
    document.addEventListener("pointerlockchange", f);
    return () => document.removeEventListener("pointerlockchange", f);
  }, []);
  return (
    <>
      <AnimatePresence>
        {explore && prompt && !deathScreen && !paused && (
          <motion.button key={prompt.id} className="prompt" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={() => { unlockAudio(); interact(prompt.id); }}>
            <kbd>E</kbd> {prompt.label}
          </motion.button>
        )}
      </AnimatePresence>
      {explore && !paused && <HelpText />}
      {explore && !locked && !deathScreen && !paused && <div className="lock-chip">Click to look around · <kbd>Esc</kbd> menu</div>}
      {driving && !paused && <button className="getout" onClick={() => exitCar()}><kbd>E</kbd> Get out</button>}
      <OpenWorldHud />
      <FpsMeter />
      <div className={`fade ${fade ? "on" : ""}`} aria-hidden />
    </>
  );
}

/** GTA V help box: one short tip at a time, top left, gone after a few seconds. */
function HelpText() {
  const text = useHelp((s) => s.text);
  const id = useHelp((s) => s.id);
  return (
    <AnimatePresence>
      {text && (
        <motion.div key={id} className="help-text" role="status" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Optional frame-rate readout (Settings > Show FPS), with the live resolution scale. */
function FpsMeter() {
  const show = useGraphics((s) => s.showFps);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => { if (ref.current) ref.current.textContent = `${Math.round(dynRes.fps)} FPS · ${Math.round(useGraphics.getState().resolution * dynRes.scale * 100)}%`; }, 500);
    return () => clearInterval(id);
  }, [show]);
  return show ? <div ref={ref} className="fps-meter">— FPS</div> : null;
}

type PanelName = ReturnType<typeof useGame.getState>["panel"];

/** The desk dock: one clean row of icon buttons with labels. Music and sound are one click away. */
function Dock() {
  const audio = useAudioSettings((s) => s.s);
  const set = useGame((s) => s.set);
  const trophies = useGame((s) => s.shown?.trophies.length ?? 0);
  const busy = useGame((s) => s.mode !== "idle");
  const open = (panel: PanelName) => { unlockAudio(); playSound("ui"); set({ panel, selectedTrophy: null }); };
  const btn = (icon: IconName, label: string, onClick: () => void, o: { title?: string; disabled?: boolean; cls?: string; badge?: number; pressed?: boolean } = {}) => (
    <button className={`dock-btn ${o.cls ?? ""}`} title={o.title ?? label} aria-label={label} aria-pressed={o.pressed} disabled={o.disabled} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
      {!!o.badge && <b className="dock-badge">{o.badge}</b>}
    </button>
  );
  return (
    <nav className="dock" aria-label="Game menu">
      {btn("walk", "Explore", () => { unlockAudio(); playSound("ui"); startExplore(); }, { cls: "primary", disabled: busy, title: "Get up and explore the city (W)" })}
      <i className="dock-sep" />
      {btn("target", "Missions", () => open("missions"))}
      {btn("map", "Map", () => open("map"), { title: "Map (M)" })}
      {btn("car", "Travel", () => open("travel"), { disabled: busy, title: "Fast travel to a district" })}
      {btn("user", "Character", () => open("character"))}
      {btn("trophy", "Trophies", () => open("trophies"), { badge: trophies })}
      <i className="dock-sep" />
      {btn("plus", "Log sale", () => { unlockAudio(); set({ panel: "sale" }); }, { cls: "accent" })}
      {btn(audio.theme ? "music" : "musicOff", "Music", () => { unlockAudio(); setAudioSettings({ theme: !audio.theme }); }, { pressed: !audio.theme, title: audio.theme ? "Turn the theme music off" : "Turn the theme music on" })}
      {btn(audio.muted ? "mute" : "volume", "Sound", () => { unlockAudio(); setAudioSettings({ muted: !audio.muted }); }, { pressed: audio.muted, title: audio.muted ? "Unmute" : "Mute everything" })}
      {btn("gear", "Settings", () => open("settings"), { title: "Graphics, sound and music" })}
    </nav>
  );
}

export function ToastView() {
  const toast = useGame((s) => s.toast);
  return (
    <div className="toast-wrap" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} className={`toast tone-${toast.tone}`} initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
            <div className="toast-title">{toast.title}</div>
            {toast.amount && <div className="toast-amount">{toast.amount}</div>}
            {toast.lines.map((l) => <div key={l} className="toast-line">{l}</div>)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
