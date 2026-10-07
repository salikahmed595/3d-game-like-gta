// In-game clock: a full day every 24 real minutes (1 game minute per real second), starting mid-morning.
// Drives the sun, sky colour, street lamps and headlights (Terrain.tsx Atmosphere, CarFx).
export const clock = { minutes: 10 * 60 };
const SPEED = 1; // game minutes per real second

export function stepClock(dt: number): void { clock.minutes = (clock.minutes + dt * SPEED) % (24 * 60); }

/** Sun height: 1 at noon, 0 at 06:00 / 18:00, -1 at midnight. */
export const sunHeight = () => Math.sin(((clock.minutes / 60 - 6) / 24) * Math.PI * 2);
/** 0 = full night … 1 = full day (smooth through dawn and dusk). */
export const daylight = () => Math.min(1, Math.max(0, (sunHeight() + 0.12) / 0.4));
export const isNight = () => daylight() < 0.35;

export function timeLabel(): string {
  const h = Math.floor(clock.minutes / 60), m = Math.floor(clock.minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Dev-only handle for scripted browser checks.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__clock = clock;
