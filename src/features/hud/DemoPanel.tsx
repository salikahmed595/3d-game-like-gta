import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../../services/api.ts";
import { useGame } from "../../game/state/store.ts";
import { unlockAudio } from "../../game/audio.ts";
import { cutToDesk } from "../../game/systems/explore.ts";
import { exitCar } from "../../game/systems/drive.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Waits for the director to finish the current reaction chain before sending the next event.
async function waitIdle(extra = 600): Promise<void> {
  await sleep(500);
  for (let i = 0; i < 120 && useGame.getState().mode !== "idle"; i++) await sleep(250);
  await sleep(extra);
}

// PRD §65 demo sequence, driven through the real server pipeline on the isolated "demo" player.
export async function runDemo(): Promise<void> {
  const g = useGame.getState();
  exitCar();
  await cutToDesk(); // the pitch is staged at the desk
  g.set({ endScreen: false });
  const fresh = await api.demoReset();
  g.setPlayer(fresh);
  g.set({ shown: fresh, displayTier: 1, wallBroken: false, seated: true, anim: "typing", emotion: "neutral", mode: "idle", shot: "default" });
  await sleep(1500);
  const steps: { amount: number; wait: number }[] = [
    { amount: 1500, wait: 900 },   // celebrate, desk/progress
    { amount: 4000, wait: 900 },   // crosses $5,000 → Professional Office
    { amount: 18000, wait: 1800 }, // reaches $23,500 → near-target mode
    { amount: 1500, wait: 0 },     // final sale → boss defeated → Executive Office
  ];
  for (const s of steps) {
    await api.demoEvent({ event_type: "deal_closed", amount: s.amount });
    await waitIdle(s.wait);
  }
}

export function DemoPanel() {
  const [busy, setBusy] = useState(false);
  const endScreen = useGame((s) => s.endScreen);
  const brand = useGame((s) => s.config?.brand);
  const set = useGame((s) => s.set);
  const explore = useGame((s) => s.explore); // the demo is staged at the desk; keep the radar clear while roaming

  const start = async () => {
    unlockAudio();
    setBusy(true);
    try { await runDemo(); } catch (err) { console.error("[demo] failed", err instanceof Error ? err.message : err); }
    setBusy(false);
  };

  return (
    <>
      <div className="demo-panel" style={explore && !busy ? { display: "none" } : undefined}>
        <button className="primary" disabled={busy} onClick={start}>{busy ? "Demo running…" : "▶ Start demo"}</button>
      </div>
      <AnimatePresence>
        {endScreen && (
          <motion.div className="end-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="end-card">
              <div className="end-brand" style={{ color: brand?.primaryColor }}>{brand?.buildingName.toUpperCase()}</div>
              <h1>Your sales built this.</h1>
              <p>Turn your targets into a 3D empire.</p>
              <button className="primary" onClick={() => set({ endScreen: false })}>Replay the scene</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
