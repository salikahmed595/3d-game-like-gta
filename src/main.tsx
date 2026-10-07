import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import "./ui.css";
import { useGame } from "./game/state/store.ts";

// Dev-only handle for poking game state from the console.
if (import.meta.env.DEV) (window as unknown as { __game: typeof useGame }).__game = useGame;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
