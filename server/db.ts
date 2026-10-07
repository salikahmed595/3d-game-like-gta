import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { DEFAULT_CONFIG } from "../shared/engine.ts";
import type { OrgConfig } from "../shared/domain.ts";

mkdirSync("data", { recursive: true });
export const db = new DatabaseSync(process.env.DB_PATH ?? "data/sales-empire.sqlite");
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0, meetings INTEGER NOT NULL DEFAULT 0, deals INTEGER NOT NULL DEFAULT 0,
  lifetime_revenue REAL NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, last_sale_day TEXT,
  boss_defeated_month TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS performance_events (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES players(id),
  event_type TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL,
  source TEXT NOT NULL, external_id TEXT NOT NULL, status TEXT NOT NULL,
  client_name TEXT, note TEXT, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL,
  submitted_by TEXT NOT NULL, reviewed_at TEXT, xp_awarded INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organization_id, source, external_id, user_id, event_type)
);
CREATE TABLE IF NOT EXISTS xp_transactions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE, xp INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS achievements (
  user_id TEXT NOT NULL, milestone_id TEXT NOT NULL, title TEXT NOT NULL, metric TEXT NOT NULL,
  value REAL NOT NULL, rarity TEXT NOT NULL, earned_at TEXT NOT NULL,
  PRIMARY KEY (user_id, milestone_id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL
);
`);

// Additive migration: the player's chosen 3D character (null = not chosen yet → client shows the picker).
const playerCols = db.prepare("PRAGMA table_info(players)").all() as { name: string }[];
if (!playerCols.some((c) => c.name === "avatar_id")) db.exec("ALTER TABLE players ADD COLUMN avatar_id TEXT");

export const ORG_ID = "org_default";
export const PLAYER_IDS = ["salik", "demo"] as const;

export function seed(): void {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO organizations (id, config_json, updated_at) VALUES (?, ?, ?)")
    .run(ORG_ID, JSON.stringify(DEFAULT_CONFIG), now);
  for (const id of PLAYER_IDS) {
    db.prepare("INSERT OR IGNORE INTO players (id, organization_id, name, created_at) VALUES (?, ?, ?, ?)")
      .run(id, ORG_ID, id === "demo" ? "Demo" : DEFAULT_CONFIG.brand.playerName, now);
  }
}

export function getConfig(): OrgConfig {
  const row = db.prepare("SELECT config_json FROM organizations WHERE id = ?").get(ORG_ID) as { config_json: string };
  return JSON.parse(row.config_json) as OrgConfig;
}

export function saveConfig(config: OrgConfig): void {
  db.prepare("UPDATE organizations SET config_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(config), new Date().toISOString(), ORG_ID);
}

export function audit(actor: string, action: string, detail?: unknown): void {
  db.prepare("INSERT INTO audit_logs (actor, action, detail, created_at) VALUES (?, ?, ?, ?)")
    .run(actor, action, detail === undefined ? null : JSON.stringify(detail), new Date().toISOString());
}

// Runs fn atomically; rolls back on any throw so rewards are never half-applied.
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function resetPlayer(userId: string): void {
  transaction(() => {
    db.prepare("DELETE FROM xp_transactions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM achievements WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM performance_events WHERE user_id = ?").run(userId);
    db.prepare(
      "UPDATE players SET xp=0, calls=0, meetings=0, deals=0, lifetime_revenue=0, streak=0, last_sale_day=NULL, boss_defeated_month=NULL WHERE id = ?",
    ).run(userId);
  });
}
