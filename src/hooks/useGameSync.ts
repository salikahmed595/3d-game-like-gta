import { useEffect } from "react";
import type { GameEvent, PlayerState } from "../../shared/domain.ts";
import { api } from "../services/api.ts";
import { useGame } from "../game/state/store.ts";
import { enqueueGameEvent, scheduleIdleLife } from "../game/systems/director.ts";

// Loads authoritative state, then listens for server-confirmed events (SSE; EventSource auto-reconnects).
export function useGameSync(): void {
  useEffect(() => {
    const userId = useGame.getState().userId;
    let source: EventSource | null = null;
    let cancelled = false;

    const refresh = async (first: boolean) => {
      try {
        const data = await api.bootstrap(userId);
        if (cancelled) return;
        const g = useGame.getState();
        if (first) g.setBootstrap(data.config, data.player);
        else {
          // Reconcile after a dropped connection without replaying events (no double rewards).
          g.set({ config: data.config });
          g.setPlayer(data.player);
          if (g.mode === "idle") g.commitShown(data.player);
        }
        g.set({ loadError: null });
      } catch (err) {
        if (!cancelled) useGame.getState().set({ loadError: err instanceof Error ? err.message : "Failed to load." });
      }
    };

    const connect = () => {
      source = new EventSource(`/api/stream/${userId}`);
      let wasOffline = false;
      source.onopen = () => {
        useGame.getState().set({ connection: "online" });
        if (wasOffline) void refresh(false);
        wasOffline = false;
      };
      source.onerror = () => { wasOffline = true; useGame.getState().set({ connection: "offline" }); };
      source.addEventListener("game", (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent<string>).data) as { player: PlayerState; gameEvent: GameEvent };
          enqueueGameEvent(payload.gameEvent, payload.player);
        } catch (err) {
          console.error("[sync] bad event payload", err instanceof Error ? err.message : err);
        }
      });
    };

    void refresh(true).then(() => { if (!cancelled) { connect(); scheduleIdleLife(); } });
    return () => { cancelled = true; source?.close(); };
  }, []);
}
