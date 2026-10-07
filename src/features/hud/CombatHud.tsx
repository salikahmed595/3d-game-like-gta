// GTA V-style combat HUD: weapon + ammo (top right), crosshair with hit markers, sniper scope, hurt / low-health
// screen effects, WASTED and BUSTED screens, the weapon wheel (hold Tab), and the area / vehicle name captions
// (bottom right). Per-frame values are written straight to the DOM from requestAnimationFrame, not React state.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGame } from "../../game/state/store.ts";
import { WEAPONS, WHEEL, gun, selectWeapon, useArsenal } from "../../game/systems/weapons.ts";
import type { WeaponId } from "../../game/systems/weapons.ts";
import { screenFx } from "../../game/systems/fx.ts";
import { fighter } from "../../game/systems/people.ts";
import { player } from "../../game/systems/explore.ts";
import { drivenCar } from "../../game/systems/drive.ts";
import { districtAt, nearestRoad } from "../../game/world/layout.ts";
import { normalTime, slowMo } from "../../game/systems/time.ts";

const icon = (id: WeaponId) => `/models/weapons/${id}.png`;

/** Top right: the weapon in hand with its ammo (clip / reserve), like GTA V. */
export function WeaponHud() {
  const current = useArsenal((s) => s.current);
  const ammo = useArsenal((s) => s.owned[s.current]);
  const def = WEAPONS[current];
  const reloadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); if (reloadRef.current) reloadRef.current.style.opacity = gun.reloadT > 0 ? "1" : "0"; };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="weapon-hud">
      {current === "fists" ? <div className="weapon-fist" aria-label="Fists">✊</div> : <img src={icon(current)} alt={def.name} />}
      {current !== "fists" && ammo && (
        <div className="weapon-ammo"><b className={ammo.clip === 0 ? "empty" : ""}>{ammo.clip}</b><span>{ammo.reserve}</span></div>
      )}
      <div ref={reloadRef} className="weapon-reload">RELOADING</div>
    </div>
  );
}

/** Centre: reticle (red over a person), hit / kill markers, the sniper scope; hurt flash and low-health greying. */
export function Crosshair() {
  const dot = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const scope = useRef<HTMLDivElement>(null);
  const hurt = useRef<HTMLDivElement>(null);
  const low = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const g = useGame.getState();
      const aiming = gun.held && (gun.aiming || gun.trigger) && !g.deathScreen;
      const sniper = aiming && gun.aiming && useArsenal.getState().current === "sniper";
      if (dot.current) {
        dot.current.style.display = aiming && !sniper ? "block" : "none";
        dot.current.classList.toggle("on-target", !!gun.target);
      }
      if (scope.current) scope.current.style.display = sniper ? "block" : "none";
      screenFx.hitMarker = Math.max(0, screenFx.hitMarker - dt * 5);
      screenFx.kill = Math.max(0, screenFx.kill - dt * 2.5);
      if (marker.current) {
        marker.current.style.opacity = String(Math.max(screenFx.hitMarker, screenFx.kill));
        marker.current.classList.toggle("kill", screenFx.kill > 0.05);
      }
      if (hurt.current) hurt.current.style.opacity = String(Math.min(1, screenFx.hurt));
      if (low.current) low.current.style.opacity = g.explore && !fighter.ko && fighter.hp < 30 ? String(0.35 + 0.25 * Math.sin(now / 260)) : "0";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <div ref={hurt} className="hurt-flash" aria-hidden />
      <div ref={low} className="low-health" aria-hidden />
      <div ref={scope} className="sniper-scope" aria-hidden><i /></div>
      <div ref={dot} className="reticle" aria-hidden />
      <div ref={marker} className="hit-marker" aria-hidden />
    </>
  );
}

/** WASTED / BUSTED: the world drains of colour behind the GTA caption. */
export function DeathScreen() {
  const screen = useGame((s) => s.deathScreen);
  return (
    <AnimatePresence>
      {screen && (
        <motion.div key={screen} className={`death-screen ${screen}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }}>
          <motion.div className="death-band" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.6, duration: 0.25 }}>
            <motion.span initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.75, duration: 0.35 }}>{screen === "wasted" ? "WASTED" : "BUSTED"}</motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Hold Tab: eight slots around a ring, the world slows; move the mouse toward a weapon and let go. */
export function WeaponWheel() {
  const open = useArsenal((s) => s.wheel);
  const owned = useArsenal((s) => s.owned);
  const current = useArsenal((s) => s.current);
  const [hi, setHi] = useState<number>(WHEEL.indexOf(current));
  const hiRef = useRef(hi);
  hiRef.current = hi;
  useEffect(() => {
    if (!open) return;
    const start = WHEEL.indexOf(useArsenal.getState().current);
    setHi(start);
    slowMo(0.25, 0.25);
    let ax = 0, ay = 0;
    const move = (e: PointerEvent) => {
      if (document.pointerLockElement) { ax += e.movementX; ay += e.movementY; }
      else { ax = e.clientX - innerWidth / 2; ay = e.clientY - innerHeight / 2; }
      const l = Math.hypot(ax, ay);
      if (l > 140) { ax = (ax / l) * 140; ay = (ay / l) * 140; }
      if (l < 30) return;
      // Slot 0 at the top, clockwise.
      const a = (Math.atan2(ax, -ay) + Math.PI * 2) % (Math.PI * 2);
      const i = Math.round(a / (Math.PI / 4)) % WHEEL.length;
      if (useArsenal.getState().owned[WHEEL[i]]) setHi(i);
    };
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("pointermove", move);
      normalTime();
      selectWeapon(WHEEL[hiRef.current]);
    };
  }, [open]);
  if (!open) return null;
  const sel = WHEEL[hi];
  return (
    <div className="weapon-wheel" role="dialog" aria-label="Weapon wheel">
      <div className="wheel-ring">
        {WHEEL.map((id, i) => {
          const a = (i / WHEEL.length) * Math.PI * 2;
          const have = owned[id];
          return (
            <button key={id} className={`wheel-slot ${i === hi ? "hi" : ""} ${have ? "" : "locked"}`} style={{ left: `calc(50% + ${Math.sin(a) * 172}px)`, top: `calc(50% - ${Math.cos(a) * 172}px)` }}
              onPointerEnter={() => have && setHi(i)} onClick={() => { if (have) { setHi(i); useArsenal.getState().set({ wheel: false }); } }}>
              {id === "fists" ? <span className="wheel-fist">✊</span> : <img src={icon(id)} alt="" />}
              {have && id !== "fists" && <small>{have.clip + have.reserve}</small>}
            </button>
          );
        })}
        <div className="wheel-centre">
          <b>{WEAPONS[sel].name}</b>
          {owned[sel] && sel !== "fists" ? <span>{owned[sel]!.clip} / {owned[sel]!.reserve}</span> : !owned[sel] ? <span>Not found yet</span> : null}
          <small>Release <kbd>Tab</kbd> to equip · <kbd>1</kbd>–<kbd>8</kbd> quick select</small>
        </div>
      </div>
    </div>
  );
}

/** Bottom right: the district (and street) when you enter it, and the vehicle's name when you get in — GTA V captions. */
export function PlaceCaption() {
  const [cap, setCap] = useState<{ id: number; title: string; sub?: string } | null>(null);
  const driving = useGame((s) => s.driving);
  useEffect(() => {
    let last: string | null = null, seq = 0;
    const id = setInterval(() => {
      const d = districtAt(player.pos.x, player.pos.z);
      const road = nearestRoad(player.pos.x, player.pos.z);
      const name = d ? d.name : road && road.dist < 14 ? road.road.name : "Countryside";
      if (name !== last) {
        last = name;
        setCap({ id: ++seq, title: name, sub: road && road.dist < 14 && road.road.name !== name ? road.road.name : undefined });
      }
    }, 700);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!driving) return;
    const car = drivenCar();
    if (car) setCap({ id: Date.now(), title: car.name, sub: undefined });
  }, [driving]);
  useEffect(() => {
    if (!cap) return;
    const t = setTimeout(() => setCap((c) => (c?.id === cap.id ? null : c)), 4200);
    return () => clearTimeout(t);
  }, [cap]);
  return (
    <AnimatePresence mode="wait">
      {cap && (
        <motion.div key={cap.id} className="place-caption" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
          <div className="place-title">{cap.title}</div>
          {cap.sub && <div className="place-sub">{cap.sub}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
