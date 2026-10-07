import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiClientError } from "../../services/api.ts";
import { CURRENCIES, EVENT_TYPES } from "../../../shared/domain.ts";
import type { OrgConfig, PendingEvent, PerformanceEventType, PlayerState } from "../../../shared/domain.ts";
import { formatMoney } from "../../../shared/engine.ts";

type Tab = "overview" | "add" | "settings" | "integration";
const KEY = "se-admin-key";
const readKey = () => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } };

export function Admin() {
  const [key, setKey] = useState(readKey);
  const [data, setData] = useState<{ config: OrgConfig; players: PlayerState[]; pending: PendingEvent[] } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (k: string) => {
    try {
      setData(await api.admin.overview(k));
      setError(null);
      try { sessionStorage.setItem(KEY, k); } catch { /* optional */ }
    } catch (err) {
      setData(null);
      setError(err instanceof ApiClientError ? err.message : "Failed to load.");
    }
  }, []);

  useEffect(() => { if (key) void load(key); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setNotice(ok); setError(null); await load(key); }
    catch (err) { setError(err instanceof ApiClientError ? err.message : "Action failed."); }
  };

  if (!data) {
    return (
      <div className="admin login">
        <h1>Sales Empire — Admin</h1>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); void load(key); }} className="form">
          <label>Admin key<input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoFocus /></label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="primary">Sign in</button>
        </form>
        <p className="muted">Set <code>ADMIN_KEY</code> in the server environment. Replace with Supabase Auth for production.</p>
      </div>
    );
  }

  const { config } = data;
  return (
    <div className="admin">
      <header>
        <h1>{config.brand.companyName} — Admin</h1>
        <nav>
          {(["overview", "add", "settings", "integration"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => { setTab(t); setNotice(null); }}>
              {t === "add" ? "Add event" : t[0].toUpperCase() + t.slice(1)}{t === "overview" && data.pending.length > 0 ? ` (${data.pending.length})` : ""}
            </button>
          ))}
          <a href="/">Open game ↗</a>
        </nav>
      </header>
      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error" role="alert">{error}</div>}

      {tab === "overview" && <Overview data={data} onAct={act} adminKey={key} />}
      {tab === "add" && <AddEvent players={data.players} adminKey={key} onAct={act} />}
      {tab === "settings" && <Settings config={config} adminKey={key} onAct={act} />}
      {tab === "integration" && <Integration />}
    </div>
  );
}

type ActFn = (fn: () => Promise<unknown>, ok: string) => Promise<void>;

function Overview({ data, onAct, adminKey }: { data: { config: OrgConfig; players: PlayerState[]; pending: PendingEvent[] }; onAct: ActFn; adminKey: string }) {
  const { config, players, pending } = data;
  const money = (n: number) => formatMoney(n, config.brand);
  return (
    <>
      <h2>Players</h2>
      <table>
        <thead><tr><th>Player</th><th>Level / Rank</th><th>Month revenue</th><th>Progress</th><th>Deals</th><th>Calls</th><th>Meetings</th><th>Streak</th><th>Office</th><th /></tr></thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.userId}>
              <td>{p.userId}</td><td>{p.level} · {p.rank}</td><td>{money(p.monthlyRevenue)}</td>
              <td>{Math.round((p.monthlyRevenue / Math.max(p.monthlyTarget, 1)) * 100)}%</td>
              <td>{p.stats.deals}</td><td>{p.stats.calls}</td><td>{p.stats.meetings}</td><td>{p.streak}</td><td>{p.officeTier}</td>
              <td><button onClick={() => { if (confirm(`Reset all progress for "${p.userId}"?`)) void onAct(() => api.admin.resetPlayer(adminKey, p.userId), "Player reset.") }}>Reset</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Pending approvals</h2>
      {pending.length === 0 ? (
        <p className="muted">No pending sales. Players' manual submissions appear here when approval is required (see Settings).</p>
      ) : (
        <table>
          <thead><tr><th>Type</th><th>Amount</th><th>Client</th><th>Note</th><th>Submitted</th><th /></tr></thead>
          <tbody>
            {pending.map((e) => (
              <tr key={e.id}>
                <td>{e.eventType.replaceAll("_", " ")}</td><td>{money(e.amount)}</td><td>{e.clientName ?? "—"}</td><td>{e.note ?? "—"}</td>
                <td>{new Date(e.createdAt).toLocaleString()}</td>
                <td className="row">
                  <button className="primary" onClick={() => void onAct(() => api.admin.review(adminKey, e.id, "approve"), "Approved — reward triggered.")}>Approve</button>
                  <button onClick={() => void onAct(() => api.admin.review(adminKey, e.id, "reject"), "Rejected.")}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function AddEvent({ players, adminKey, onAct }: { players: PlayerState[]; adminKey: string; onAct: ActFn }) {
  const [userId, setUserId] = useState(players[0]?.userId ?? "salik");
  const [type, setType] = useState<PerformanceEventType>("deal_closed");
  const [amount, setAmount] = useState("");
  const [client, setClient] = useState("");
  const [note, setNote] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onAct(() => api.admin.addEvent(adminKey, {
      user_id: userId, event_type: type, amount: Number(amount) || 0, source: "admin", external_id: crypto.randomUUID(),
      client_name: client || undefined, note: note || undefined,
    }), "Event recorded. The game reacts live.");
  };
  return (
    <form className="form" onSubmit={submit}>
      <h2>Add performance event</h2>
      <label>Player<select value={userId} onChange={(e) => setUserId(e.target.value)}>{players.map((p) => <option key={p.userId}>{p.userId}</option>)}</select></label>
      <label>Event type<select value={type} onChange={(e) => setType(e.target.value as PerformanceEventType)}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}</select></label>
      <label>Amount<input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Client (optional)<input value={client} onChange={(e) => setClient(e.target.value)} /></label>
      <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button className="primary">Record event</button>
    </form>
  );
}

function Settings({ config, adminKey, onAct }: { config: OrgConfig; adminKey: string; onAct: ActFn }) {
  const [c, setC] = useState<OrgConfig>(config);
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const save = (e: FormEvent) => { e.preventDefault(); void onAct(() => api.admin.saveConfig(adminKey, c), "Settings saved."); };
  return (
    <form className="form wide" onSubmit={save}>
      <h2>Targets & rewards</h2>
      <label>Monthly target<input type="number" min={1} value={c.monthlyTarget} onChange={(e) => setC({ ...c, monthlyTarget: num(e.target.value) })} /></label>
      <label>XP per 100 revenue<input type="number" min={0} value={c.xpPer100Revenue} onChange={(e) => setC({ ...c, xpPer100Revenue: num(e.target.value) })} /></label>
      <label>Big deal threshold<input type="number" min={0} value={c.bigDealThreshold} onChange={(e) => setC({ ...c, bigDealThreshold: num(e.target.value) })} /></label>
      <label className="check"><input type="checkbox" checked={c.approvalRequired} onChange={(e) => setC({ ...c, approvalRequired: e.target.checked })} /> Require manager approval for player-submitted sales</label>

      <h2>Office unlocks (lifetime revenue)</h2>
      {c.officeTiers.map((t, i) => (
        <div className="row" key={t.tier}>
          <label>Tier {t.tier} name<input value={t.name} onChange={(e) => setC({ ...c, officeTiers: c.officeTiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></label>
          <label>Revenue required<input type="number" min={0} disabled={t.tier === 1} value={t.revenueRequired} onChange={(e) => setC({ ...c, officeTiers: c.officeTiers.map((x, j) => (j === i ? { ...x, revenueRequired: num(e.target.value) } : x)) })} /></label>
        </div>
      ))}

      <h2>XP rules</h2>
      <table><thead><tr><th>Event</th><th>XP</th><th>Adds revenue</th></tr></thead><tbody>
        {c.kpiRules.map((r, i) => (
          <tr key={r.eventType}>
            <td>{r.eventType.replaceAll("_", " ")}</td>
            <td><input type="number" min={0} value={r.xp} onChange={(e) => setC({ ...c, kpiRules: c.kpiRules.map((x, j) => (j === i ? { ...x, xp: num(e.target.value) } : x)) })} /></td>
            <td><input type="checkbox" checked={r.revenueCounts} onChange={(e) => setC({ ...c, kpiRules: c.kpiRules.map((x, j) => (j === i ? { ...x, revenueCounts: e.target.checked } : x)) })} /></td>
          </tr>
        ))}
      </tbody></table>

      <h2>Milestones</h2>
      <table><thead><tr><th>Title</th><th>Metric</th><th>Value</th><th>Rarity</th></tr></thead><tbody>
        {c.milestones.map((m, i) => (
          <tr key={m.id}>
            <td><input value={m.title} onChange={(e) => setC({ ...c, milestones: c.milestones.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /></td>
            <td>{m.metric}</td>
            <td><input type="number" min={0} value={m.value} onChange={(e) => setC({ ...c, milestones: c.milestones.map((x, j) => (j === i ? { ...x, value: num(e.target.value) } : x)) })} /></td>
            <td>{m.rarity}</td>
          </tr>
        ))}
      </tbody></table>

      <h2>Branding</h2>
      <label>Company name<input value={c.brand.companyName} onChange={(e) => setC({ ...c, brand: { ...c.brand, companyName: e.target.value } })} /></label>
      <label>Player name<input value={c.brand.playerName} onChange={(e) => setC({ ...c, brand: { ...c.brand, playerName: e.target.value } })} /></label>
      <label>Player title<input value={c.brand.playerTitle} onChange={(e) => setC({ ...c, brand: { ...c.brand, playerTitle: e.target.value } })} /></label>
      <label>Building name<input value={c.brand.buildingName} onChange={(e) => setC({ ...c, brand: { ...c.brand, buildingName: e.target.value } })} /></label>
      <label>Boss name<input value={c.brand.bossName} onChange={(e) => setC({ ...c, brand: { ...c.brand, bossName: e.target.value } })} /></label>
      <label>Brand color<input type="color" value={c.brand.primaryColor} onChange={(e) => setC({ ...c, brand: { ...c.brand, primaryColor: e.target.value } })} /></label>
      <label>Currency<select value={c.brand.currency} onChange={(e) => setC({ ...c, brand: { ...c.brand, currency: e.target.value as OrgConfig["brand"]["currency"] } })}>{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Rank names (comma separated)<input value={c.brand.rankNames.join(", ")} onChange={(e) => setC({ ...c, brand: { ...c.brand, rankNames: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} /></label>
      <button className="primary">Save settings</button>
    </form>
  );
}

function Integration() {
  const sample = `curl -X POST ${location.origin}/api/events \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: <API_KEY>" \\
  -d '{
    "user_id": "salik",
    "event_type": "deal_closed",
    "amount": 2500,
    "currency": "USD",
    "source": "crm",
    "external_id": "deal_789"
  }'`;
  return (
    <div>
      <h2>Generic webhook / REST API</h2>
      <p className="muted">Send performance events from any CRM. Repeating the same <code>source</code> + <code>external_id</code> never double-awards XP or revenue.</p>
      <pre>{sample}</pre>
      <p className="muted">Event types: {EVENT_TYPES.join(", ")}</p>
    </div>
  );
}
