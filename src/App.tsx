import { Scene } from "./game/Scene.tsx";
import { Hud, Loader, ToastView } from "./features/hud/Hud.tsx";
import { Panels } from "./features/hud/Panels.tsx";
import { DemoPanel } from "./features/hud/DemoPanel.tsx";
import { Admin } from "./features/admin/Admin.tsx";
import { useGameSync } from "./hooks/useGameSync.ts";
import { useGame } from "./game/state/store.ts";
import { useGraphics } from "./game/settings.ts";

function Game() {
  useGameSync();
  const isDemo = useGame((s) => s.userId === "demo");
  const lite = useGraphics((s) => s.preset === "low"); // Low: no live blur behind panels
  return (
    <div className={`game ${lite ? "lite" : ""}`}>
      <Scene />
      <div className="vignette" aria-hidden />
      <Hud />
      <ToastView />
      <Panels />
      {isDemo && <DemoPanel />}
      <Loader />
    </div>
  );
}

export default function App() {
  return location.pathname.startsWith("/admin") ? <Admin /> : <Game />;
}
