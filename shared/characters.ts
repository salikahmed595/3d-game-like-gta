// Character roster. Models are produced by tools/blender/convert_characters.py into
// public/models/characters/<id>/<id>.glb (+ thumb.png). Shared so the server can validate a player's choice.

export type CharacterDef = {
  id: string;
  name: string;
  /** Standing height in metres the model is scaled to. */
  height: number;
  /** "player": selectable; "npc": roams the city; "idle": stands in place (no usable legs); "statue": no skeleton;
   *  "cop": police officer on foot (spawned by the wanted system only). */
  role: "player" | "npc" | "idle" | "statue" | "cop";
};

export const CHARACTERS: readonly CharacterDef[] = [
  // Playable (the only three the player can pick).
  { id: "salik", name: "Salik", height: 1.78, role: "player" },
  { id: "soldier", name: "Soldier Boy", height: 1.85, role: "player" },
  { id: "aesthetic", name: "Aesthetic Boy", height: 1.8, role: "player" },
  // Public: roam the city.
  { id: "saeed", name: "Saeed", height: 1.78, role: "npc" },
  { id: "arian", name: "Arian", height: 1.76, role: "npc" },
  { id: "franklin", name: "Franklin", height: 1.8, role: "npc" },
  { id: "trevor", name: "Trevor", height: 1.82, role: "npc" },
  { id: "lucia", name: "Lucia", height: 1.68, role: "npc" },
  { id: "ceaser", name: "Ceaser", height: 1.8, role: "npc" },
  { id: "scott", name: "Scott", height: 1.55, role: "idle" },
  { id: "spanner", name: "Spanner Boy", height: 1.4, role: "statue" },
  // Police officer (the user's police pack), auto-rigged.
  { id: "cop", name: "Police Officer", height: 1.83, role: "cop" },
];

export const PLAYABLE_IDS = CHARACTERS.filter((c) => c.role === "player").map((c) => c.id);
export const DEFAULT_CHARACTER_ID = "salik";

export const characterUrl = (id: string) => `/models/characters/${id}/${id}.glb`;
export const characterThumb = (id: string) => `/models/characters/${id}/thumb.png`;
export const characterDef = (id: string): CharacterDef | undefined => CHARACTERS.find((c) => c.id === id);
/** The player's character: a playable id, or the default (also covers ids that are no longer playable). */
export const getCharacter = (id: string | null | undefined): CharacterDef =>
  CHARACTERS.find((c) => c.id === id && c.role === "player") ?? CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER_ID)!;
