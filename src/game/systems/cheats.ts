// GTA Vice City PC cheats: type the code while playing (no console, no Enter), exactly like the original.
// Weapons, police, health and armour only. Cheats never touch sales, XP, revenue or street cash.
import { playSound } from "../audio.ts";
import { WEAPONS, giveWeapon } from "./weapons.ts";
import type { WeaponId } from "./weapons.ts";
import { fighter, MAX_HP } from "./people.ts";
import { setWanted, wantedLevel } from "./police.ts";
import { cars, damageCar } from "./drive.ts";
import { player } from "./explore.ts";
import { showHelp } from "./help.ts";

const full = (ids: WeaponId[]) => ids.forEach((id) => giveWeapon(id, WEAPONS[id].maxAmmo));

export const CHEATS: { code: string; what: string; run: () => void }[] = [
  { code: "THUGSTOOLS", what: "Weapon set 1", run: () => full(["pistol", "smg", "rifle"]) },
  { code: "PROFESSIONALTOOLS", what: "Weapon set 2", run: () => full(["pistol", "smg", "carbine", "sniper"]) },
  { code: "NUTTERTOOLS", what: "Weapon set 3", run: () => full(["pistol", "smg", "rifle", "carbine", "sniper", "plasma", "incinerator"]) },
  { code: "ASPIRINE", what: "Full health", run: () => { fighter.hp = MAX_HP; } },
  { code: "PRECIOUSPROTECTION", what: "Full armour", run: () => { fighter.armor = 100; } },
  { code: "LEAVEMEALONE", what: "Wanted level cleared", run: () => setWanted(0) },
  { code: "YOUWONTTAKEMEALIVE", what: "Wanted level +2", run: () => setWanted(wantedLevel() + 2) },
  {
    code: "BIGBANG", what: "Nearby cars blown up",
    run: () => { for (const c of cars.values()) if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 60) damageCar(c.id, 9999, true); },
  },
];

let typed = "";
let lastKeyAt = 0;
const longest = Math.max(...CHEATS.map((c) => c.code.length));

/**
 * Feed every key typed while roaming. "done": a cheat just completed; "typing": these keys are clearly spelling a
 * cheat (2+ letters typed in quick succession matching the start of one), so the game shouldn't also act on them (M would open the map
 * halfway through YOUWONTTAKEMEALIVE); "none": an ordinary key.
 */
export function cheatKey(key: string): "done" | "typing" | "none" {
  if (!/^[a-z]$/i.test(key)) { typed = ""; return "none"; }
  // Typing, not playing: letters a second or more apart start a fresh code.
  const now = performance.now();
  if (now - lastKeyAt > 1200) typed = "";
  lastKeyAt = now;
  typed = (typed + key.toUpperCase()).slice(-longest);
  const hit = CHEATS.find((c) => typed.endsWith(c.code));
  if (hit) {
    typed = "";
    hit.run();
    playSound("pickup");
    showHelp(`Cheat activated: ${hit.what}`, 3);
    return "done";
  }
  for (let n = Math.min(typed.length, longest); n >= 2; n--) {
    const tail = typed.slice(-n);
    if (CHEATS.some((c) => c.code.startsWith(tail))) return "typing";
  }
  return "none";
}
