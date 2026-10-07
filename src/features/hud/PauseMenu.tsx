// GTA V pause menu (Esc while roaming): the world freezes behind a dark blur; a header with the brand, the
// character, the in-game time and street cash; tabs for Map, Missions, Stats, Trophies, Character, Settings and
// Controls; quick actions on the right. Replaces the row of buttons that used to sit on the game screen.
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useGame } from "../../game/state/store.ts";
import { useMissions } from "../../game/systems/missions.ts";
import { returnToDesk } from "../../game/systems/explore.ts";
import { exitCar } from "../../game/systems/drive.ts";
import { timeLabel } from "../../game/world/clock.ts";
import { playSound, unlockAudio } from "../../game/audio.ts";
import { stats } from "../../game/systems/stats.ts";
import { CONTROLS } from "../../game/systems/help.ts";
import { CHARACTERS, characterThumb, getCharacter } from "../../../shared/characters.ts";
import { BigMap } from "./OpenWorldHud.tsx";
import { CharacterPicker, MissionsPanel, StatsPanel, TrophyRoom } from "./Panels.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./Icon.tsx";

type Tab = ReturnType<typeof useGame.getState>["pauseTab"];
const TABS: [Tab, string][] = [["map", "Map"], ["missions", "Missions"], ["stats", "Stats"], ["trophies", "Trophies"], ["character", "Character"], ["settings", "Settings"], ["controls", "Controls"]];

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const hms = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };

function CityStats() {
  const rows: [string, string][] = [
    ["Time in the city", hms(stats.playTime)],
    ["Distance on foot", km(stats.walked)],
    ["Distance driven", km(stats.driven)],
    ["Top speed", `${Math.round(stats.topSpeed)} km/h`],
    ["Missions passed", String(stats.missions)],
    ["Shots fired", stats.shots.toLocaleString()],
    ["Kills", String(stats.kills)],
    ["Highest wanted level", stats.maxWanted ? "★".repeat(stats.maxWanted) : "—"],
    ["Wasted", String(stats.wasted)],
    ["Busted", String(stats.busted)],
    ["Pickups collected", String(stats.pickups)],
  ];
  return (
    <div className="pm-two">
      <section><h4>Sales career</h4><StatsPanel /></section>
      <section>
        <h4>In the city</h4>
        <div className="pm-rows">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      </section>
    </div>
  );
}

function Controls() {
  return (
    <div className="pm-controls">
      {CONTROLS.map((g) => (
        <section key={g.group}>
          <h4>{g.group}</h4>
          {g.keys.map(([k, what]) => <div key={k + what} className="pm-key"><kbd>{k}</kbd><span>{what}</span></div>)}
        </section>
      ))}
    </div>
  );
}

export function PauseMenu() {
  const tab = useGame((s) => s.pauseTab);
  const set = useGame((s) => s.set);
  const brand = useGame((s) => s.config?.brand);
  const avatarId = useGame((s) => s.player?.avatarId ?? null);
  const driving = useGame((s) => !!s.driving);
  const cash = useMissions((s) => s.cash);
  const char = getCharacter(avatarId);
  const clock = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => { if (clock.current) clock.current.textContent = timeLabel(); }, 1000);
    return () => clearInterval(id);
  }, []);
  const close = () => set({ panel: "none" });
  const resume = () => {
    close();
    // Clicking Resume is a user gesture: take the mouse straight back, like closing GTA's menu.
    try { void (document.querySelector(".game canvas") as HTMLCanvasElement | null)?.requestPointerLock?.()?.catch?.(() => undefined); } catch { /* not allowed here: a click on the game takes the mouse */ }
  };
  const go = (t: Tab) => { playSound("ui"); set({ pauseTab: t }); };
  const action = (icon: IconName, label: string, fn: () => void, disabled = false) => (
    <button className="pm-action" disabled={disabled} onClick={() => { unlockAudio(); playSound("ui"); fn(); }}><Icon name={icon} size={18} />{label}</button>
  );
  return (
    <motion.div className="pause" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} role="dialog" aria-label="Pause menu">
      <header className="pm-head">
        <div className="pm-title">
          <b>{brand?.companyName ?? "Sales Empire"}</b>
          <small>Paused</small>
        </div>
        <div className="pm-who">
          <div><b>{CHARACTERS.find((c) => c.id === char.id)?.name ?? char.name}</b><small><span ref={clock}>{timeLabel()}</span> · <em>${cash.toLocaleString()}</em></small></div>
          <img src={characterThumb(char.id)} alt="" />
        </div>
      </header>
      <nav className="pm-tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => go(id)}>{label}</button>)}
      </nav>
      <div className="pm-body">
        <main className={`pm-main ${tab === "map" ? "is-map" : ""}`}>
          {tab === "map" && <BigMap onClose={close} embedded />}
          {tab === "missions" && <MissionsPanel onDone={close} />}
          {tab === "stats" && <CityStats />}
          {tab === "trophies" && <TrophyRoom />}
          {tab === "character" && <CharacterPicker onDone={() => go("map")} />}
          {tab === "settings" && <SettingsPanel />}
          {tab === "controls" && <Controls />}
        </main>
        <aside className="pm-side">
          <button className="pm-resume" onClick={resume}><Icon name="play" size={18} />Resume</button>
          {action("car", "Fast travel", () => set({ panel: "travel" }), driving)}
          {action("plus", "Log a sale", () => set({ panel: "sale" }))}
          {action("desk", "Back to desk", () => { close(); if (driving) exitCar(); returnToDesk(); })}
        </aside>
      </div>
      <footer className="pm-foot"><span><kbd>Esc</kbd> Resume</span><span><kbd>M</kbd> Map</span><span><kbd>F1</kbd> Controls</span></footer>
    </motion.div>
  );
}
