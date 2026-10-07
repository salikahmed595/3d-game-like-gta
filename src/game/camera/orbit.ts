// Third-person camera input for roaming (GTA-style): click the game to capture the mouse (pointer lock) and look
// around freely; left mouse fires (or punches with fists), right mouse aims; Esc frees the mouse. Without capture,
// drag to look. The wheel zooms (or swaps weapons while aiming). Touch keeps tap-to-walk. CameraRig reads `orbit`.
import { useGame } from "../state/store.ts";
import { cycleWeapon, gun } from "../systems/weapons.ts";

export const orbit = {
  az: 0, // azimuth of the camera around the player (radians; 0 = camera on the +z side)
  pol: 1.2, // angle from straight up
  dist: 4.4,
  lastInput: -99, // performance.now() of the last mouse look (auto-recentre waits for a pause)
  lookOff: 0, // driving: temporary look-around offset that springs back
  carMode: 0, // driving camera: 0 near chase, 1 far chase, 2 hood (V cycles)
  init: false,
};

const SENS = 0.0026;
export const pointerLocked = () => typeof document !== "undefined" && !!document.pointerLockElement;

function onLook(dx: number, dy: number) {
  const g = useGame.getState();
  orbit.lastInput = performance.now();
  if (g.driving) { orbit.lookOff = Math.max(-2.6, Math.min(2.6, orbit.lookOff - dx * SENS)); return; }
  const k = gun.aiming ? 0.55 : 1; // finer control while aiming down the sights
  orbit.az -= dx * SENS * k;
  orbit.pol = Math.max(0.45, Math.min(1.75, orbit.pol - dy * SENS * k));
}

/** Attach to the WebGL canvas; returns a cleanup. */
export function attachOrbitInput(canvas: HTMLCanvasElement): () => void {
  let dragging = false;
  let pressAt = 0, moved = 0;
  // Mouse events, not pointer events: with one button already held (right = aim), pressing the other (left = fire)
  // is a "chorded" press that fires no pointerdown — which is why you couldn't shoot while aiming.
  const down = (e: MouseEvent) => {
    const g = useGame.getState();
    if (!g.explore || g.panel !== "none" || g.driving) return;
    if ((e as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents) return; // touch keeps tap-to-walk
    if (e.button === 2) { gun.aiming = true; return; }
    if (e.button !== 0) return;
    if (pointerLocked() || gun.aiming) { gun.trigger = true; return; } // aiming: a click always shoots
    // Not captured yet: this click captures the mouse (and, if the browser refuses, dragging looks around).
    dragging = true; pressAt = performance.now(); moved = 0;
    try { void (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => undefined); } catch { /* drag-to-look still works */ }
  };
  const move = (e: PointerEvent) => {
    if (!useGame.getState().explore) return;
    // Without capture: drag with either button to look (right-drag aims and looks at once, like GTA).
    if (dragging) moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (pointerLocked() || (dragging && e.buttons & 1) || (gun.aiming && e.buttons & 2)) onLook(e.movementX, e.movementY);
  };
  const up = (e: MouseEvent) => {
    if (e.button === 0) {
      // Mouse not captured (some browsers / embedded views refuse): a quick click without dragging still fires.
      const tap = dragging && !pointerLocked() && moved < 6 && performance.now() - pressAt < 280;
      dragging = false; gun.trigger = false;
      if (tap && gun.held) { gun.trigger = true; setTimeout(() => { gun.trigger = false; }, 70); }
    }
    if (e.button === 2) gun.aiming = false;
  };
  const wheel = (e: WheelEvent) => {
    const g = useGame.getState();
    if (!g.explore || g.driving) return;
    if (gun.aiming) { cycleWeapon(e.deltaY > 0 ? 1 : -1); return; }
    orbit.dist = Math.max(2.2, Math.min(9, orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
  };
  const menu = (e: Event) => { if (useGame.getState().explore) e.preventDefault(); };
  canvas.addEventListener("mousedown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("mouseup", up);
  canvas.addEventListener("wheel", wheel, { passive: true });
  canvas.addEventListener("contextmenu", menu);
  // Free the mouse whenever the player leaves roaming or opens a panel.
  const unsub = useGame.subscribe((s, prev) => {
    if ((!s.explore && prev.explore) || (s.panel !== "none" && prev.panel === "none")) { if (pointerLocked()) document.exitPointerLock(); gun.trigger = false; gun.aiming = false; }
    if (s.explore && !prev.explore) orbit.init = false;
  });
  const lockChange = () => { if (!pointerLocked()) { gun.trigger = false; gun.aiming = false; dragging = false; } };
  document.addEventListener("pointerlockchange", lockChange);
  return () => {
    canvas.removeEventListener("mousedown", down);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("mouseup", up);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("contextmenu", menu);
    document.removeEventListener("pointerlockchange", lockChange);
    unsub();
  };
}
