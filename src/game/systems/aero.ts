// Vehicle physics constants and the aerodynamics behind the driving model (drive.ts):
//   drag      F = ½ ρ Cd A v²      — grows with the square of speed, so top speed is where engine power runs out
//   downforce F = ½ ρ Cl A v²      — presses the tyres down: more cornering grip and braking at speed
//   rolling   F = Crr m g          — tyre losses, constant
//   power     a = P / (m v)        — full thrust off the line (traction-limited), fading as speed climbs
//   slipstream: tucked in behind another car, the air is already moving — drag drops by ~45%
// Each car's engine power is derived from its listed top speed, so the top speed is a real equilibrium.
import { vehicleModel } from "../world/city.ts";

export const RHO = 1.225; // air density, kg/m³ (sea level)
export const G = 9.81;
const CRR = 0.013;

export type Body = { mass: number; cd: number; area: number; cl: number; mu: number };

const BODIES: Record<string, Body> = {
  // Supercars and racers: low drag, real downforce, sticky tyres.
  pack_8: { mass: 1350, cd: 0.32, area: 1.9, cl: 0.9, mu: 1.25 },
  future: { mass: 1250, cd: 0.28, area: 1.85, cl: 1.15, mu: 1.3 },
  concept: { mass: 1300, cd: 0.3, area: 1.9, cl: 0.95, mu: 1.25 },
  vintage: { mass: 900, cd: 0.45, area: 1.6, cl: 0.3, mu: 1.15 },
  // Road cars.
  classic: { mass: 1250, cd: 0.38, area: 2.0, cl: 0.05, mu: 1.0 },
  rusty: { mass: 1500, cd: 0.42, area: 2.2, cl: 0, mu: 0.9 },
  pack_3: { mass: 1900, cd: 0.38, area: 3.0, cl: 0, mu: 0.95 }, // van
  pack_4: { mass: 1900, cd: 0.42, area: 2.9, cl: 0, mu: 0.95 }, // pickup
  pack_7: { mass: 1850, cd: 0.45, area: 2.8, cl: 0, mu: 0.95 }, // jeep
  pack_5: { mass: 1850, cd: 0.36, area: 2.6, cl: 0, mu: 1.0 }, // SUV
  // Motorbike + rider: tiny frontal area but very draggy shape, little mass.
  cop_bike: { mass: 330, cd: 0.6, area: 0.75, cl: 0, mu: 1.15 },
};
const DEFAULT: Body = { mass: 1450, cd: 0.32, area: 2.2, cl: 0.05, mu: 1.0 };

export const bodyOf = (model: string): Body => BODIES[model] ?? DEFAULT;

/** Deceleration (m/s²) from air drag at speed v. */
export const dragAcc = (b: Body, v: number) => (0.5 * RHO * b.cd * b.area * v * v) / b.mass;
/** Downforce as a fraction of the car's weight (0.5 = half its weight again pressing it down). */
export const downforce = (b: Body, v: number) => (0.5 * RHO * b.cl * b.area * v * v) / (b.mass * G);
export const rolling = () => CRR * G;

/** Engine power per kg (W/kg) so the listed top speed is ~where power meets drag (a little headroom so it's reachable). */
export function powerPerKg(model: string, topKmh: number): number {
  const b = bodyOf(model);
  const v = (topKmh / 3.6) * 1.18;
  return v * (dragAcc(b, v) + rolling());
}

export const isBike = (model: string) => !!vehicleModel(model)?.bike;
