// Open-world HUD (only while roaming): GTA-style radar with GPS line, health / nitro bars, street cash, speedometer
// with gear, mission objective + timer, big mission banners, knock-out screen, and the full island map (M) where a
// click drops a waypoint. Everything that changes per frame draws into canvases or refs, never React state.
import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGame } from "../../game/state/store.ts";
import { player } from "../../game/systems/explore.ts";
import { cars, drivenCar } from "../../game/systems/drive.ts";
import { fighter, people } from "../../game/systems/people.ts";
import { MISSIONS, cancelMission, currentObjective, formatTime, gpsTarget, missionById, showBanner, useMissions } from "../../game/systems/missions.ts";
import { view } from "../../game/camera/CameraRig.tsx";
import { cops, useWanted } from "../../game/systems/police.ts";
import { formatMoney } from "../../../shared/engine.ts";
import { DISTRICTS, GARAGE, ROADS, WORLD_HALF } from "../../game/world/layout.ts";
import { ability, ABILITIES, useAbility } from "../../game/systems/abilities.ts";
import { PLAYABLE, switchCharacter, useSwitch } from "../../game/systems/switcher.ts";
import { timeLabel } from "../../game/world/clock.ts";
import { STATIONS } from "../../game/audio.ts";
import { CHARACTERS, characterThumb, getCharacter } from "../../../shared/characters.ts";
import { Crosshair, DeathScreen, PlaceCaption, WeaponHud, WeaponWheel } from "./CombatHud.tsx";
import { SALIK_FM, useMusic } from "../../game/music.ts";
import { Icon } from "./Icon.tsx";

type Ctx = CanvasRenderingContext2D;

/** Draw the island into a context already transformed to world units. */
// GTA V-style map palette: muted dark land, light roads, gold highways (easy to read at a glance, never garish).
const PAL = { beach: "#4b4a3f", land: "#34402f", city: "#4a4f58", downtown: "#565c66", casing: "#1a1d22", road: "#b9bec7", highway: "#e2b53e" };

function drawWorld(c: Ctx, scale: number, labels: boolean) {
  c.fillStyle = PAL.beach;
  c.fillRect(-WORLD_HALF - 300, -WORLD_HALF - 300, (WORLD_HALF + 300) * 2, (WORLD_HALF + 300) * 2);
  c.fillStyle = PAL.land;
  c.fillRect(-WORLD_HALF - 60, -WORLD_HALF - 60, (WORLD_HALF + 60) * 2, (WORLD_HALF + 60) * 2);
  for (const d of DISTRICTS) {
    c.fillStyle = d.key === "downtown" ? PAL.downtown : PAL.city;
    c.fillRect(d.ox + d.bounds.minX, d.oz + d.bounds.minZ, d.bounds.maxX - d.bounds.minX, d.bounds.maxZ - d.bounds.minZ);
  }
  c.lineCap = "round"; c.lineJoin = "round";
  for (const pass of [0, 1]) {
    for (const r of ROADS) {
      c.strokeStyle = pass === 0 ? PAL.casing : r.kind === "highway" ? PAL.highway : PAL.road;
      c.lineWidth = Math.max(r.width * (pass === 0 ? 1.6 : 0.8), (pass === 0 ? 5 : 2.5) / scale);
      c.beginPath();
      r.pts.forEach(([x, z], i) => (i ? c.lineTo(x, z) : c.moveTo(x, z)));
      if (r.loop) c.closePath();
      c.stroke();
    }
  }
  if (labels) {
    c.font = `600 ${12 / scale}px Inter, system-ui, sans-serif`;
    c.textAlign = "center";
    for (const d of DISTRICTS) {
      c.fillStyle = "rgba(0,0,0,0.7)";
      c.fillText(d.name, d.ox + 1 / scale, d.oz + d.bounds.minZ - 8 / scale + 1 / scale);
      c.fillStyle = "#fff";
      c.fillText(d.name, d.ox, d.oz + d.bounds.minZ - 8 / scale);
    }
  }
}

function blip(c: Ctx, x: number, y: number, r: number, fill: string, stroke = "#111") {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = stroke; c.stroke();
}

function arrow(c: Ctx, x: number, y: number, angle: number, size: number, color: string) {
  c.save(); c.translate(x, y); c.rotate(angle);
  c.beginPath(); c.moveTo(0, -size); c.lineTo(size * 0.7, size * 0.8); c.lineTo(0, size * 0.35); c.lineTo(-size * 0.7, size * 0.8); c.closePath();
  c.fillStyle = color; c.fill(); c.lineWidth = 1.5; c.strokeStyle = "#111"; c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- radar
const RADAR_W = 250, RADAR_H = 160;
const RADAR_PX = typeof window === "undefined" ? 1 : Math.min(2, Math.max(1, Math.round(window.devicePixelRatio * 2) / 2));
function Radar() {
  const ref = useRef<HTMLCanvasElement>(null);
  const hp = useRef<HTMLDivElement>(null);
  const armor = useRef<HTMLDivElement>(null);
  const nitro = useRef<HTMLDivElement>(null);
  const special = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return;
      last = now;
      const cv = ref.current;
      if (!cv) return;
      const c = cv.getContext("2d")!;
      // GTA V minimap: a rectangle, player a little below the middle, map rotating with the camera.
      c.setTransform(RADAR_PX, 0, 0, RADAR_PX, 0, 0); // drawn at the screen's pixel density: crisp roads and blips
      const W = RADAR_W, H = RADAR_H, R = H / 2, CX = W / 2, CY = H * 0.56;
      const car = drivenCar();
      const range = car ? 260 + Math.min(Math.abs(car.speed), 83) * 6 : 200; // metres from centre to the top/bottom edge
      const scale = R / range;
      const h = view.heading;
      c.clearRect(0, 0, W, H);
      c.save();
      c.beginPath(); c.roundRect(0, 0, W, H, 10); c.clip();
      // World → radar: rotate so the camera's forward points up.
      c.save();
      c.translate(CX, CY);
      c.rotate(Math.PI + h);
      c.scale(scale, scale);
      c.translate(-player.pos.x, -player.pos.z);
      drawWorld(c, scale, false);
      c.restore();
      const toScreen = (x: number, z: number) => {
        const dx = x - player.pos.x, dz = z - player.pos.z;
        const fx = Math.sin(h), fz = Math.cos(h);
        const rx = -Math.cos(h), rz = Math.sin(h);
        return { sx: CX + (dx * rx + dz * rz) * scale, sy: CY - (dx * fx + dz * fz) * scale };
      };
      const inside = (p: { sx: number; sy: number }) => p.sx > 6 && p.sx < W - 6 && p.sy > 6 && p.sy < H - 6;
      const clampEdge = (p: { sx: number; sy: number }) => {
        if (inside(p)) return { ...p, edge: false };
        // Pin to the frame along the line from the player.
        const dx = p.sx - CX, dy = p.sy - CY;
        const k = Math.min(Math.abs((dx > 0 ? W - 9 - CX : CX - 9) / (dx || 1e-6)), Math.abs((dy > 0 ? H - 9 - CY : CY - 9) / (dy || 1e-6)));
        return { sx: CX + dx * k, sy: CY + dy * k, edge: true };
      };
      // GPS: line to the target, target blip pinned to the rim when off-radar.
      const target = gpsTarget();
      if (target) {
        const t = toScreen(target.x, target.z);
        c.setLineDash([6, 5]); c.lineWidth = 3; c.strokeStyle = useMissions.getState().run ? "#ffd23f" : "#b46cff";
        c.beginPath(); c.moveTo(CX, CY); c.lineTo(t.sx, t.sy); c.stroke(); c.setLineDash([]);
        const e = clampEdge(t);
        blip(c, e.sx, e.sy, 6, useMissions.getState().run ? "#ffd23f" : "#b46cff");
      }
      if (!useMissions.getState().run) {
        for (const m of MISSIONS) {
          const e = clampEdge(toScreen(m.start.x, m.start.z));
          if (!e.edge || Math.hypot(m.start.x - player.pos.x, m.start.z - player.pos.z) < 2500) blip(c, e.sx, e.sy, e.edge ? 4 : 5.5, "#ffc93c");
        }
      }
      {
        const gp = clampEdge(toScreen(GARAGE.x, GARAGE.z));
        if (!gp.edge) { blip(c, gp.sx, gp.sy, 6, "#2fd3a0"); c.fillStyle = "#06261c"; c.font = "900 9px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("$", gp.sx, gp.sy + 0.5); }
      }
      for (const car2 of cars.values()) {
        if (car2 === car) continue;
        const p = toScreen(car2.x, car2.z);
        if (inside(p) && !car2.wreck) blip(c, p.sx, p.sy, 3.2, "#5bb8ff");
      }
      for (const p of people.values()) {
        if ((p.state !== "fight" && !p.rival && !p.cop) || p.state === "dead") continue;
        const s = toScreen(p.x, p.z);
        if (inside(s)) blip(c, s.sx, s.sy, p.cop ? 3.4 : 3.6, p.cop ? (Math.floor(now / 250) % 2 ? "#ff2a3a" : "#2a5bff") : "#ff4040", p.cop ? "#fff" : "#111");
      }
      const flash = Math.floor(now / 250) % 2 === 0;
      for (const cop of cops) {
        const e = clampEdge(toScreen(cop.x, cop.z));
        blip(c, e.sx, e.sy, e.edge ? 4 : 5, flash ? "#ff2a3a" : "#2a5bff", "#fff");
      }
      // North marker on the rim.
      const n = clampEdge(toScreen(player.pos.x, player.pos.z - 1e6));
      c.font = "700 10px Inter, system-ui"; c.textAlign = "center"; c.textBaseline = "middle";
      blip(c, n.sx, n.sy, 7, "rgba(12,14,18,0.9)", "rgba(255,255,255,0.6)"); c.fillStyle = "#fff"; c.fillText("N", n.sx, n.sy + 0.5);
      // The player: an arrow showing which way they face relative to the camera.
      arrow(c, CX, CY, -(player.yaw - h), 8, "#ffffff");
      c.restore();
      // Soft inner edge instead of a hard frame.
      const vg = c.createRadialGradient(CX, CY, R * 0.9, CX, CY, W * 0.75);
      vg.addColorStop(0, "rgba(8,10,14,0)"); vg.addColorStop(1, "rgba(8,10,14,0.55)");
      c.fillStyle = vg; c.fillRect(0, 0, W, H);
      if (hp.current) { hp.current.style.width = `${Math.max(0, fighter.hp)}%`; hp.current.classList.toggle("low", fighter.hp < 25); }
      if (armor.current) armor.current.style.width = `${Math.max(0, fighter.armor)}%`;
      if (nitro.current) {
        nitro.current.parentElement!.style.visibility = car ? "visible" : "hidden";
        nitro.current.style.width = `${(car?.nitro ?? 0) * 100}%`;
      }
      if (special.current) {
        special.current.style.width = `${ability.meter * 100}%`;
        special.current.parentElement!.classList.toggle("active", !!ability.active);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="radar">
      <div className="radar-bar nitro" title="Nitro (Shift)"><div ref={nitro} /></div>
      <canvas ref={ref} width={RADAR_W * RADAR_PX} height={RADAR_H * RADAR_PX} />
      <div className="radar-bars">
        <div className="radar-bar hp" title="Health"><div ref={hp} /></div>
        <div className="radar-bar armor" title="Body armour"><div ref={armor} /></div>
        <div className="radar-bar special" title="Special ability (X)"><div ref={special} /></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- speedometer
function Speedo() {
  const kmh = useRef<HTMLSpanElement>(null);
  const gear = useRef<HTMLSpanElement>(null);
  const rpm = useRef<HTMLDivElement>(null);
  const gee = useRef<HTMLSpanElement>(null);
  const draft = useRef<HTMLSpanElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const c = drivenCar();
      if (!c || !kmh.current || !gear.current || !rpm.current) return;
      kmh.current.textContent = String(Math.round(Math.abs(c.speed) * 3.6));
      gear.current.textContent = c.gear === 0 ? "R" : String(c.gear);
      rpm.current.style.width = `${Math.min(100, (c.rpm / 7200) * 100)}%`;
      rpm.current.classList.toggle("red", c.rpm > 6500);
      if (gee.current) gee.current.textContent = `${Math.hypot(c.gLong, c.gLat).toFixed(1)} G`;
      if (draft.current) draft.current.style.opacity = c.drafting ? "1" : "0";
      // Speed sensation: a vignette that closes in above ~150 km/h (and more on nitro).
      if (fx.current) fx.current.style.opacity = String(Math.min(0.85, Math.max(0, (Math.abs(c.speed) * 3.6 - 150) / 170) + (c.boosting ? 0.25 : 0)));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <div ref={fx} className="speed-fx" aria-hidden />
      <div className="speedo2" aria-live="off">
        <div className="speedo2-row"><span ref={kmh} className="speedo2-kmh">0</span><span className="speedo2-unit">km/h</span><span ref={gear} className="speedo2-gear">1</span></div>
        <div className="speedo2-rpm"><div ref={rpm} /></div>
        <div className="speedo2-foot"><span ref={gee} title="G-force">0.0 G</span><span ref={draft} className="speedo2-draft">SLIPSTREAM</span></div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- mission objective, timer, distance
function MissionLine() {
  const run = useMissions((s) => s.run);
  const time = useRef<HTMLDivElement>(null);
  const dist = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const r = useMissions.getState().run;
      const def = r ? missionById(r.id) : null;
      if (time.current && r && def) {
        const left = def.timeLimit ? def.timeLimit - r.elapsed : null;
        time.current.textContent = left !== null ? formatTime(Math.max(0, left)) : formatTime(r.elapsed);
        time.current.classList.toggle("hurry", left !== null && left < 15);
      }
      const t = gpsTarget();
      if (dist.current) {
        const d = t ? Math.hypot(t.x - player.pos.x, t.z - player.pos.z) : 0;
        dist.current.textContent = t ? (d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`) : "";
      }
    }, 100);
    return () => clearInterval(id);
  }, []);
  if (!run) return null;
  const def = missionById(run.id)!;
  const o = currentObjective();
  return (
    <>
      <div className="mission-timer">
        <div className="mission-name">{def.title.toUpperCase()}</div>
        <div ref={time} className="mission-time">0:00.0</div>
        <button onClick={() => cancelMission()}>Quit mission</button>
      </div>
      {o && <div className="mission-objective">{o.text} <span ref={dist} className="mission-dist" /></div>}
    </>
  );
}

function WaypointLine() {
  const waypoint = useMissions((s) => s.waypoint);
  const run = useMissions((s) => s.run);
  const dist = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const w = useMissions.getState().waypoint;
      if (dist.current && w) {
        const d = Math.hypot(w.x - player.pos.x, w.z - player.pos.z);
        dist.current.textContent = d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
        if (d < 25) useMissions.getState().set({ waypoint: null });
      }
    }, 150);
    return () => clearInterval(id);
  }, []);
  if (!waypoint || run) return null;
  return <div className="mission-objective waypoint">Waypoint <span ref={dist} className="mission-dist" /></div>;
}

function Banner() {
  const banner = useMissions((s) => s.banner);
  return (
    <AnimatePresence>
      {banner && (
        <motion.div key={banner.id} className={`mbanner ${banner.tone}`} initial={{ opacity: 0, scale: 1.25 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          <div className="mbanner-title">{banner.title}</div>
          {banner.sub && <div className="mbanner-sub">{banner.sub}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Cash() {
  const cash = useMissions((s) => s.cash);
  return <div className="street-cash" title="Street cash: earned from missions (separate from your sales)">${cash.toLocaleString()}</div>;
}

function WantedStars() {
  const stars = useWanted((s) => s.stars);
  const seen = useWanted((s) => s.seen);
  // GTA V only shows the stars while you're wanted.
  if (!stars) return null;
  return (
    <div className={`wanted ${!seen ? "evading" : ""}`} aria-label={`Wanted level ${stars}`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= stars ? "on" : ""}>★</span>)}
    </div>
  );
}

/** The business stays on screen while roaming, but small: revenue toward target and level. */
function BusinessMini() {
  const shown = useGame((s) => s.shown);
  const brand = useGame((s) => s.config?.brand);
  if (!shown || !brand) return null;
  const ratio = Math.min(shown.monthlyRevenue / Math.max(shown.monthlyTarget, 1), 1);
  return (
    <div className="biz-mini">
      <button className="biz-menu" title="Pause menu (Esc)" aria-label="Pause menu" onClick={() => useGame.getState().set({ panel: "pause", pauseTab: "map" })}><Icon name="menu" size={16} /></button>
      <div className="biz-mini-row"><b>{formatMoney(shown.monthlyRevenue, brand)}</b><span>/ {formatMoney(shown.monthlyTarget, brand)}</span><em>LV {shown.level}</em></div>
      <div className="biz-mini-bar"><div style={{ width: `${ratio * 100}%`, background: brand.primaryColor }} /></div>
    </div>
  );
}

// ---------------------------------------------------------------- full map (M)
export function BigMap({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fit = useRef({ scale: 1, ox: 0, oy: 0 });
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      if (!cv) return;
      const w = cv.clientWidth, h = cv.clientHeight;
      const px = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * px) || cv.height !== Math.round(h * px)) { cv.width = Math.round(w * px); cv.height = Math.round(h * px); }
      const c = cv.getContext("2d")!;
      c.setTransform(px, 0, 0, px, 0, 0);
      const span = (WORLD_HALF + 350) * 2;
      const scale = Math.min(w, h) / span;
      fit.current = { scale, ox: w / 2, oy: h / 2 };
      c.fillStyle = "#16242e"; c.fillRect(0, 0, w, h); // sea
      c.save(); c.translate(w / 2, h / 2); c.scale(scale, scale);
      drawWorld(c, scale, scale > 0.035); // names only when there is room for them
      c.restore();
      const S = (x: number, z: number) => ({ x: w / 2 + x * scale, y: h / 2 + z * scale });
      c.font = "600 12px Inter, system-ui"; c.textAlign = "left"; c.textBaseline = "middle";
      if (!useMissions.getState().run) for (const m of MISSIONS) {
        const p = S(m.start.x, m.start.z);
        blip(c, p.x, p.y, 7, useMissions.getState().done[m.id] ? "#c9a24b" : "#ffc93c");
        if (scale > 0.035) { c.fillStyle = "#111"; c.fillText(m.title, p.x + 11, p.y + 1); c.fillStyle = "#fff"; c.fillText(m.title, p.x + 10, p.y); }
      }
      { const gp = S(GARAGE.x, GARAGE.z); blip(c, gp.x, gp.y, 6, "#2fd3a0"); c.fillStyle = "#fff"; c.fillText("Empire Customs", gp.x + 10, gp.y + 14); }
      const t = gpsTarget();
      if (t) { const p = S(t.x, t.z); blip(c, p.x, p.y, 8, useMissions.getState().run ? "#ffd23f" : "#b46cff"); }
      const me = S(player.pos.x, player.pos.z);
      arrow(c, me.x, me.y, Math.PI - player.yaw, 10, "#ffffff");
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  const click = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const { scale, ox, oy } = fit.current;
    const x = (e.clientX - r.left - ox) / scale, z = (e.clientY - r.top - oy) / scale;
    if (Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF) return;
    useMissions.getState().set({ waypoint: { x, z } });
  };
  return (
    <div className={`bigmap ${embedded ? "embedded" : ""}`}>
      <canvas ref={ref} onClick={click} onContextMenu={(e) => { e.preventDefault(); useMissions.getState().set({ waypoint: null }); }} />
      <div className="bigmap-help">Click to set a waypoint · right-click to clear{!embedded && <> · <kbd>M</kbd> or <button onClick={onClose}>Close</button></>}</div>
    </div>
  );
}

// ---------------------------------------------------------------- composition
function Clock() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = setInterval(() => { if (ref.current) ref.current.textContent = timeLabel(); }, 500);
    return () => clearInterval(id);
  }, []);
  return <div ref={ref} className="game-clock">{timeLabel()}</div>;
}

/** GTA shows the station name for a moment when you tune in. */
function RadioName() {
  const radio = useGame((s) => s.radio);
  const driving = useGame((s) => s.driving);
  const song = useMusic((s) => s.song);
  const name = radio === null ? "RADIO OFF" : radio === 0 ? SALIK_FM : STATIONS[radio - 1].name;
  return (
    <AnimatePresence>
      {driving && (
        <motion.div key={`${radio ?? "off"}-${radio === 0 ? song : ""}`} className="radio-name" initial={{ opacity: 0, y: -8 }} animate={{ opacity: [0, 1, 1, 0], y: 0 }} transition={{ duration: 3.5, times: [0, 0.1, 0.78, 1] }}>
          <small>RADIO · Q{radio === 0 ? " · N next song" : ""}</small>{name}
          {radio === 0 && song && <em className="radio-song">♪ {song}</em>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Character wheel (C): the three playable characters; picking one triggers the sky-cam switch. */
function SwitchWheel() {
  const open = useSwitch((s) => s.open);
  const current = getCharacter(useGame((s) => s.player?.avatarId ?? null)).id;
  if (!open) return null;
  const pick = async (id: string) => {
    const why = await switchCharacter(id);
    if (why) showBanner(why.toUpperCase(), "fail", undefined, 2400);
  };
  return (
    <div className="switch-wheel" role="dialog" aria-label="Switch character">
      {PLAYABLE.map((id) => {
        const def = CHARACTERS.find((c) => c.id === id)!;
        const ab = ABILITIES[id];
        return (
          <button key={id} className={id === current ? "sel" : ""} onClick={() => void pick(id)}>
            <img src={characterThumb(id)} alt="" />
            <b>{def.name}</b>
            {ab && <small>{ab.name}: {ab.blurb}</small>}
          </button>
        );
      })}
      <div className="switch-help">Pick a character · <kbd>C</kbd> to close · <kbd>X</kbd> uses their special ability</div>
    </div>
  );
}

function AbilityTint() {
  const active = useAbility((s) => s.active);
  return <div className={`ability-tint ${active ?? ""}`} aria-hidden />;
}

export function OpenWorldHud() {
  const explore = useGame((s) => s.explore);
  const driving = useGame((s) => s.driving);
  const paused = useGame((s) => s.panel === "pause");
  if (!explore) return <Banner />;
  if (paused) return null; // the pause menu has the map, cash and time; the game HUD steps aside
  return (
    <>
      <Crosshair />
      <Radar />
      {/* GTA V top right: weapon + ammo, wanted stars, cash, then the clock and the active mission. */}
      <div className="gta-top">
        {!driving && <WeaponHud />}
        <WantedStars />
        <Cash />
        <Clock />
        <MissionLine />
      </div>
      {/* The business never leaves the screen: small, top left. */}
      <div className="biz-corner"><BusinessMini /></div>
      <RadioName />
      <SwitchWheel />
      <WeaponWheel />
      <AbilityTint />
      {driving && <Speedo />}
      <WaypointLine />
      <PlaceCaption />
      <Banner />
      <DeathScreen />
    </>
  );
}
