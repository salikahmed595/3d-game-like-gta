import { useState } from "react";
import type { FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGame } from "../../game/state/store.ts";
import { api, ApiClientError } from "../../services/api.ts";
import { enqueueGameEvent } from "../../game/systems/director.ts";
import { EVENT_TYPES } from "../../../shared/domain.ts";
import type { PerformanceEventType } from "../../../shared/domain.ts";
import { formatMoney } from "../../../shared/engine.ts";
import { CHARACTERS, DEFAULT_CHARACTER_ID, characterThumb } from "../../../shared/characters.ts";
import { DISTRICTS, ROADS, openSpot } from "../../game/world/layout.ts";
import { canStand, player, travelTo } from "../../game/systems/explore.ts";
import { MISSIONS, addCash, formatTime, startMission, useMissions } from "../../game/systems/missions.ts";
import { MAX, PAINTS, PRICE, refreshCar, tuneOf, useGarage } from "../../game/systems/garage.ts";
import type { Tune } from "../../game/systems/garage.ts";
import { drivenCar } from "../../game/systems/drive.ts";
import { vehicleModel } from "../../game/world/city.ts";
import { BigMap } from "./OpenWorldHud.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { PauseMenu } from "./PauseMenu.tsx";
import { useWanted } from "../../game/systems/police.ts";
import { playSound } from "../../game/audio.ts";

const NO_TROPHIES: never[] = [];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal" role="dialog" aria-label={title} initial={{ y: 20 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2><button onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </motion.div>
    </motion.div>
  );
}

export function Panels() {
  const panel = useGame((s) => s.panel);
  const set = useGame((s) => s.set);
  const close = () => set({ panel: "none", selectedTrophy: null });
  return (
    <AnimatePresence>
      {panel === "trophies" && <Modal key="t" title="Trophy Room" onClose={close}><TrophyRoom /></Modal>}
      {panel === "sale" && <Modal key="s" title="Log a sale" onClose={close}><SaleForm onDone={close} /></Modal>}
      {panel === "stats" && <Modal key="p" title="Performance board" onClose={close}><StatsPanel /></Modal>}
      {panel === "travel" && <Modal key="v" title="Fast travel" onClose={close}><TravelPanel /></Modal>}
      {panel === "customs" && <Modal key="cu" title="Empire Customs" onClose={close}><CustomsPanel /></Modal>}
      {panel === "missions" && <Modal key="ms" title="Missions" onClose={close}><MissionsPanel onDone={close} /></Modal>}
      {panel === "map" && <motion.div key="mp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><BigMap onClose={close} /></motion.div>}
      {panel === "character" && <Modal key="c" title="Choose your character" onClose={close}><CharacterPicker onDone={close} /></Modal>}
      {panel === "settings" && <Modal key="st" title="Settings" onClose={close}><SettingsPanel /></Modal>}
      {panel === "pause" && <PauseMenu key="pm" />}
    </AnimatePresence>
  );
}

export function TrophyRoom() {
  const trophies = useGame((s) => s.shown?.trophies ?? NO_TROPHIES);
  const selected = useGame((s) => s.selectedTrophy);
  const brand = useGame((s) => s.config?.brand);
  const set = useGame((s) => s.set);
  if (trophies.length === 0) return <p className="muted">No trophies yet. Close your first deal to fill the shelf.</p>;
  return (
    <div>
      <div className="trophy-grid">
        {trophies.map((t) => (
          <button key={t.id} className={`trophy r-${t.rarity} ${selected?.id === t.id ? "sel" : ""}`} onClick={() => set({ selectedTrophy: t })}>
            <span className="cup">🏆</span>{t.title}
          </button>
        ))}
      </div>
      {selected && brand && (
        <div className="trophy-detail">
          <h3>{selected.title}</h3>
          <div className="muted">{selected.rarity.toUpperCase()} · {selected.metric === "revenue" ? formatMoney(selected.value, brand) : `${selected.value} ${selected.metric}`}</div>
          <div className="muted">Earned {new Date(selected.earnedAt).toLocaleDateString()}</div>
        </div>
      )}
    </div>
  );
}

export function CharacterPicker({ onDone }: { onDone: () => void }) {
  const userId = useGame((s) => s.userId);
  const current = useGame((s) => s.player?.avatarId ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choose = async (id: string) => {
    setBusy(id); setError(null);
    try {
      const player = await api.setAvatar(userId, id);
      // Cosmetic only: update the avatar without replaying any progress.
      useGame.setState((s) => ({ player: s.player ? { ...s.player, avatarId: player.avatarId } : player, shown: s.shown ? { ...s.shown, avatarId: player.avatarId } : player }));
      onDone();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save. Try again.");
    } finally { setBusy(null); }
  };
  return (
    <div>
      <p className="muted">Your character sits in your office and celebrates your sales. The others walk around the city.</p>
      <div className="char-grid">
        {CHARACTERS.filter((c) => c.role === "player").map((c) => (
          <button key={c.id} className={`char ${(current ?? DEFAULT_CHARACTER_ID) === c.id ? "sel" : ""}`} disabled={!!busy} onClick={() => choose(c.id)}>
            <img src={characterThumb(c.id)} alt="" loading="lazy" />
            <span>{busy === c.id ? "Saving…" : c.name}</span>
          </button>
        ))}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}

function TravelPanel() {
  const run = useMissions((s) => s.run);
  const stars = useWanted((s) => s.stars);
  if (run || stars) return <p className="muted">{run ? "No cabs during a mission: finish it or quit it first." : "No cab will stop for you while the cops are after you. Lose them first."}</p>;
  const go = (x: number, z: number) => { playSound("ui"); void travelTo(x, z, (px, pz) => openSpot(px, pz, (a, b) => canStand(a, b))); };
  return (
    <div>
      <p className="muted">Take a cab across the island. Your office is in Downtown; a big sale still brings you back to celebrate.</p>
      <div className="map-grid">
        {DISTRICTS.map((d) => {
          const here = Math.hypot(player.pos.x - d.ox, player.pos.z - d.oz) < 200;
          // Arrive at the district entrance, by its parked car.
          const road = ROADS.find((r) => r.id === `to-${d.key}`);
          const at = d.key === "downtown" ? { x: 8, z: 6 } : road ? { x: road.pts[0][0], z: road.pts[0][1] } : { x: d.ox, z: d.oz };
          return (
            <button key={d.key} className={`map ${here ? "sel" : ""}`} disabled={here} onClick={() => go(at.x, at.z)}>
              <span>{d.name}</span>
              <small>{here ? "You are here" : d.key === "downtown" ? "Home · your office" : `${(Math.hypot(player.pos.x - d.ox, player.pos.z - d.oz) / 1000).toFixed(1)} km away`}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CustomsPanel() {
  const cash = useMissions((s) => s.cash);
  useGarage((s) => s.tunes); // re-render after a purchase
  const car = drivenCar();
  if (!car) return <p className="muted">Drive a car into the garage to work on it.</p>;
  const base = vehicleModel(car.model);
  const t = tuneOf(car.model);
  const buy = (price: number, next: Tune) => {
    if (cash < price) { playSound("ui"); return; }
    addCash(-price);
    useGarage.getState().set(car.model, next);
    refreshCar(car, base);
    playSound("cash");
  };
  const rows: { key: "engine" | "top" | "nitro"; label: string; what: string }[] = [
    { key: "engine", label: "Engine", what: "+16% acceleration per level" },
    { key: "top", label: "Top speed", what: "+18 km/h per level (up to the 300 km/h cap)" },
    { key: "nitro", label: "Nitro tank", what: "Nitro lasts longer per level" },
  ];
  return (
    <div className="customs">
      <div className="customs-head">
        <div><b>{base.name}</b><span>{Math.round(car.top)} km/h top · {car.accel.toFixed(1)} m/s² launch</span></div>
        <div className="customs-cash">${cash.toLocaleString()}</div>
      </div>
      <h3>Respray <small>${PRICE.paint}</small></h3>
      <div className="paint-grid">
        {PAINTS.map((p) => {
          const sel = (t.paint ?? "") === p.hex;
          return (
            <button key={p.name} className={sel ? "sel" : ""} disabled={sel || (p.hex !== "" && cash < PRICE.paint)} title={p.name}
              onClick={() => buy(p.hex ? PRICE.paint : 0, { ...t, paint: p.hex || null })}>
              <i style={{ background: p.hex || "linear-gradient(135deg,#888,#ddd)" }} />{p.name}
            </button>
          );
        })}
      </div>
      <h3>Performance</h3>
      {rows.map((r) => {
        const level = t[r.key], max = MAX[r.key], price = PRICE[r.key][level];
        return (
          <div key={r.key} className="tune-row">
            <div><b>{r.label}</b><small>{r.what}</small></div>
            <span className="dots">{Array.from({ length: max }, (_, i) => <i key={i} className={i < level ? "on" : ""} />)}</span>
            {level >= max ? <em>MAX</em> : <button disabled={cash < price} onClick={() => buy(price, { ...t, [r.key]: level + 1 })}>${price.toLocaleString()}</button>}
          </div>
        );
      })}
      <p className="muted">Paid with street cash (missions, stunt jumps) — it never touches your sales numbers.</p>
    </div>
  );
}

export function MissionsPanel({ onDone }: { onDone: () => void }) {
  const { cash, best, done, run } = useMissions();
  return (
    <div>
      <p className="muted">Street cash <b>${cash.toLocaleString()}</b> · earned from missions only (it never touches your sales, XP or targets).</p>
      <div className="mission-list">
        {MISSIONS.map((m) => (
          <div key={m.id} className={`mission-card ${done[m.id] ? "done" : ""}`}>
            <div className="mission-card-head"><b>{m.title}</b><span>${m.reward.toLocaleString()}{m.gold !== undefined ? ` · gold ${formatTime(m.gold)}` : ""}</span></div>
            <p>{m.blurb}</p>
            <div className="mission-card-foot">
              <small>{done[m.id] ? `✓ Passed · best ${best[m.id] !== undefined ? formatTime(best[m.id]) : "—"}` : "Not played yet"}</small>
              <button disabled={!!run} onClick={() => { useMissions.getState().set({ waypoint: m.start }); onDone(); }}>Set GPS</button>
              <button disabled={!!run} onClick={() => { onDone(); void startMission(m.id); }}>Play now</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsPanel() {
  const s = useGame((st) => st.shown);
  const brand = useGame((st) => st.config?.brand);
  if (!s || !brand) return null;
  const money = (n: number) => formatMoney(n, brand);
  const items: [string, string][] = [
    ["This month", `${money(s.monthlyRevenue)} / ${money(s.monthlyTarget)}`],
    ["Lifetime revenue", money(s.stats.lifetimeRevenue)],
    ["Deals closed", String(s.stats.deals)],
    ["Meetings", String(s.stats.meetings)],
    ["Calls", String(s.stats.calls)],
    ["Streak", `${s.streak} day${s.streak === 1 ? "" : "s"}`],
    ["Level", `${s.level} · ${s.rank}`],
    ["Trophies", String(s.trophies.length)],
  ];
  return (
    <div className="stats-grid">
      {items.map(([label, value]) => <div key={label} className="stat"><span>{label}</span><b>{value}</b></div>)}
    </div>
  );
}

function SaleForm({ onDone }: { onDone: () => void }) {
  const userId = useGame((s) => s.userId);
  const [type, setType] = useState<PerformanceEventType>("deal_closed");
  const [amount, setAmount] = useState("");
  const [client, setClient] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useGame((s) => s.showToast);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api.submitManual(userId, { event_type: type, amount: Number(amount) || 0, client_name: client || undefined, note: note || undefined });
      if (res.status === "pending") showToast({ title: "SUBMITTED", lines: ["Waiting for manager approval"], tone: "info" });
      else if (res.gameEvent) enqueueGameEvent(res.gameEvent, res.player); // fallback if SSE is down; deduped by event id
      onDone();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not submit. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="form">
      <label>Event type
        <select value={type} onChange={(e) => setType(e.target.value as PerformanceEventType)}>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <label>Amount
        <input inputMode="decimal" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2500" />
      </label>
      <label>Client (optional)<input value={client} onChange={(e) => setClient(e.target.value)} maxLength={120} /></label>
      <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? "Submitting…" : "Submit"}</button>
    </form>
  );
}
