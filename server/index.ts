import express from "express";
import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { z } from "zod";
import { CURRENCIES, EVENT_TYPES } from "../shared/domain.ts";
import type { ApiResponse, BootstrapData } from "../shared/domain.ts";
import { ORG_ID, db, getConfig, resetPlayer, saveConfig, audit, seed } from "./db.ts";
import {
  ApiError, getPlayerState, listPending, onGameEvent, reviewEvent, setAvatar, submitEvent,
} from "./pipeline.ts";
import { PLAYABLE_IDS } from "../shared/characters.ts";

seed();
const app = express();
app.use(express.json({ limit: "100kb" }));

const ADMIN_KEY = process.env.ADMIN_KEY ?? "change-me-admin";
const API_KEY = process.env.API_KEY ?? "change-me-webhook";
const DEMO_MODE = process.env.DEMO_MODE !== "false";

const ok = <T,>(res: Response, data: T) => res.json({ success: true, data } satisfies ApiResponse<T>);
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const keyOf = (req: Request, header: string) => String(req.header(header) ?? "");

// Basic per-IP rate limit; replace with a shared store when scaling beyond one process.
const hits = new Map<string, { n: number; reset: number }>();
app.use("/api", (req, _res, next) => {
  const now = Date.now();
  const rec = hits.get(req.ip ?? "?");
  if (!rec || rec.reset < now) hits.set(req.ip ?? "?", { n: 1, reset: now + 60_000 });
  else if (++rec.n > 300) return next(new ApiError(429, "RATE_LIMITED", "Too many requests."));
  next();
});

const requireAdmin = (req: Request, _res: Response, next: NextFunction) =>
  safeEqual(keyOf(req, "x-admin-key"), ADMIN_KEY) ? next() : next(new ApiError(401, "UNAUTHORIZED", "Admin key required."));
const requireApiOrAdmin = (req: Request, _res: Response, next: NextFunction) =>
  safeEqual(keyOf(req, "x-api-key"), API_KEY) || safeEqual(keyOf(req, "x-admin-key"), ADMIN_KEY)
    ? next() : next(new ApiError(401, "UNAUTHORIZED", "API key required."));
const requireDemo = (_req: Request, _res: Response, next: NextFunction) =>
  DEMO_MODE ? next() : next(new ApiError(403, "DEMO_DISABLED", "Demo mode is disabled."));

// ---- Player-facing (read + manual submit) ----
app.get("/api/bootstrap/:userId", (req, res) => {
  ok(res, { config: getConfig(), player: getPlayerState(String(req.params.userId)) } satisfies BootstrapData);
});

app.post("/api/player/:userId/manual-event", (req, res) => {
  const body = { ...req.body, user_id: String(req.params.userId), source: "manual", external_id: `manual-${crypto.randomUUID()}` };
  ok(res, submitEvent(body, { actor: `player:${req.params.userId}`, requireApproval: true }));
});

const avatarSchema = z.object({ avatarId: z.enum(PLAYABLE_IDS as [string, ...string[]]) });
app.put("/api/player/:userId/avatar", (req, res) => {
  const parsed = avatarSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Unknown character.");
  ok(res, setAvatar(String(req.params.userId), parsed.data.avatarId));
});

// Server-Sent Events: persist first, then celebrate.
app.get("/api/stream/:userId", (req, res) => {
  const userId = String(req.params.userId);
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  res.write(": connected\n\n");
  const off = onGameEvent((uid, payload) => { if (uid === userId) res.write(`event: game\ndata: ${JSON.stringify(payload)}\n\n`); });
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => { off(); clearInterval(ping); });
});

// ---- Generic performance event API (CRM / webhook) ----
app.post("/api/events", requireApiOrAdmin, (req, res) => {
  const isAdmin = safeEqual(keyOf(req, "x-admin-key"), ADMIN_KEY);
  ok(res, submitEvent(req.body, { actor: isAdmin ? "admin" : "api", requireApproval: false }));
});

// ---- Admin ----
app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  const players = (db.prepare("SELECT id FROM players WHERE organization_id = ?").all(ORG_ID) as { id: string }[])
    .map((p) => getPlayerState(p.id));
  ok(res, { config: getConfig(), players, pending: listPending() });
});

const configSchema = z.object({
  monthlyTarget: z.number().positive().max(1e9),
  xpPer100Revenue: z.number().min(0).max(100000),
  bigDealThreshold: z.number().min(0).max(1e9),
  approvalRequired: z.boolean(),
  brand: z.object({
    companyName: z.string().min(1).max(60), playerName: z.string().min(1).max(40), playerTitle: z.string().max(40),
    buildingName: z.string().min(1).max(60), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    currency: z.enum(CURRENCIES), locale: z.string().max(12), bossName: z.string().max(40),
    rankNames: z.array(z.string().min(1).max(30)).min(1).max(20),
  }),
  kpiRules: z.array(z.object({ eventType: z.enum(EVENT_TYPES), xp: z.number().min(0).max(1e6), revenueCounts: z.boolean() })),
  officeTiers: z.array(z.object({ tier: z.union([z.literal(1), z.literal(2), z.literal(3)]), name: z.string().max(40), revenueRequired: z.number().min(0) })).length(3),
  milestones: z.array(z.object({
    id: z.string().max(40), title: z.string().max(60), metric: z.enum(["deals", "revenue", "calls", "meetings", "streak"]),
    value: z.number().min(0), rarity: z.enum(["common", "rare", "epic", "legendary"]),
  })).max(30),
});

app.put("/api/admin/config", requireAdmin, (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  saveConfig(parsed.data);
  audit("admin", "config.updated");
  ok(res, getConfig());
});

app.post("/api/admin/events/:id/:decision", requireAdmin, (req, res) => {
  const decision = req.params.decision === "approve" ? "approve" : req.params.decision === "reject" ? "reject" : null;
  if (!decision) throw new ApiError(400, "VALIDATION_ERROR", "Decision must be approve or reject.");
  ok(res, reviewEvent(String(req.params.id), decision, "admin"));
});

app.post("/api/admin/players/:userId/reset", requireAdmin, (req, res) => {
  resetPlayer(String(req.params.userId));
  audit("admin", "player.reset", { userId: req.params.userId });
  ok(res, getPlayerState(String(req.params.userId)));
});

// ---- Demo user (isolated "demo" player; same pipeline, no admin key in the browser) ----
app.post("/api/demo/reset", requireDemo, (_req, res) => { resetPlayer("demo"); ok(res, getPlayerState("demo")); });
app.post("/api/demo/event", requireDemo, (req, res) => {
  const body = { ...req.body, user_id: "demo", source: "demo", external_id: `demo-${crypto.randomUUID()}` };
  ok(res, submitEvent(body, { actor: "demo", requireApproval: false }));
});

// Serve the production build when present.
if (existsSync("dist")) {
  app.use(express.static("dist"));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile("index.html", { root: "dist" }));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } } satisfies ApiResponse<never>);
  }
  console.error("[api] unhandled error", err instanceof Error ? err.message : err);
  res.status(500).json({ success: false, error: { code: "INTERNAL", message: "Something went wrong." } } satisfies ApiResponse<never>);
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`[api] listening on :${port}`));
