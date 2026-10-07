import type {
  ApiResponse, BootstrapData, EventResult, OrgConfig, PendingEvent, PlayerState, PerformanceEventType,
} from "../../shared/domain.ts";

export class ApiClientError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit & { adminKey?: string }): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init?.adminKey) headers["x-admin-key"] = init.adminKey;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiClientError("NETWORK", "Cannot reach the server. Check your connection.");
  }
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json) throw new ApiClientError("BAD_RESPONSE", "Unexpected server response.");
  if (!json.success) throw new ApiClientError(json.error.code, json.error.message);
  return json.data;
}

export const api = {
  bootstrap: (userId: string) => request<BootstrapData>(`/bootstrap/${userId}`),
  submitManual: (userId: string, body: { event_type: PerformanceEventType; amount: number; client_name?: string; note?: string }) =>
    request<EventResult>(`/player/${userId}/manual-event`, { method: "POST", body: JSON.stringify(body) }),
  setAvatar: (userId: string, avatarId: string) =>
    request<PlayerState>(`/player/${userId}/avatar`, { method: "PUT", body: JSON.stringify({ avatarId }) }),
  demoReset: () => request<PlayerState>("/demo/reset", { method: "POST" }),
  demoEvent: (body: { event_type: PerformanceEventType; amount: number }) =>
    request<EventResult>("/demo/event", { method: "POST", body: JSON.stringify(body) }),
  admin: {
    overview: (adminKey: string) =>
      request<{ config: OrgConfig; players: PlayerState[]; pending: PendingEvent[] }>("/admin/overview", { adminKey }),
    saveConfig: (adminKey: string, config: OrgConfig) =>
      request<OrgConfig>("/admin/config", { method: "PUT", body: JSON.stringify(config), adminKey }),
    addEvent: (adminKey: string, body: Record<string, unknown>) =>
      request<EventResult>("/events", { method: "POST", body: JSON.stringify(body), adminKey }),
    review: (adminKey: string, id: string, decision: "approve" | "reject") =>
      request<EventResult>(`/admin/events/${id}/${decision}`, { method: "POST", adminKey }),
    resetPlayer: (adminKey: string, userId: string) =>
      request<PlayerState>(`/admin/players/${userId}/reset`, { method: "POST", adminKey }),
  },
};
