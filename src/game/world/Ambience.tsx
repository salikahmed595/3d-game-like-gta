// Background sound bed while roaming: a city murmur inside districts, open-country wind between them.
import { useEffect } from "react";
import { useGame } from "../state/store.ts";
import { setAmbient } from "../audio.ts";
import { player } from "../systems/explore.ts";
import { districtAt } from "./layout.ts";

export function Ambience() {
  useEffect(() => {
    const id = setInterval(() => {
      if (!useGame.getState().explore) { setAmbient(0, 0); return; }
      const inTown = !!districtAt(player.pos.x, player.pos.z, 60);
      setAmbient(inTown ? 1 : 0.15, inTown ? 0.2 : 1);
    }, 500);
    return () => { clearInterval(id); setAmbient(0, 0); };
  }, []);
  return null;
}
