# Sales Empire (MVP)

Every sale builds your empire. React Three Fiber client + Node/Express API (SQLite via `node:sqlite`, Node 22.13+).

## Run

```bash
npm install
cp .env.example .env      # set ADMIN_KEY / API_KEY (defaults work for local dev)
npm run dev               # web :5173, api :8787
```

- Game: http://localhost:5173/ (player `salik`)
- Scripted demo (PRD §65, isolated `demo` player): http://localhost:5173/?demo=1 → "Start demo"
- Admin: http://localhost:5173/admin (key = `ADMIN_KEY`)
- Production: `npm run build && npm start` (API serves `dist/`)
- Checks: `npm run typecheck`, `npm test`

## Explore mode

Press **Explore** (or W/A/S/D, or click the floor) to get up from the desk and walk around the office and the city
outside. **E** (or click) uses the nearest object: coffee, target wall, performance board, trophy shelf, plant,
Nova the AI companion. **Esc** walks back to the desk. Sales still react wherever you are; office upgrades and the
boss cut back to the desk first. Interactions only show server data — they never change revenue/XP.

- **Characters:** 👤 Character picks one of three playable characters (Salik, Soldier Boy, Aesthetic Boy; saved per
  player). Every other character from `charaters in glb` roams the streets (`src/game/world/Crowd.tsx`).
- **Streaming** (`src/game/world/streaming.ts`): only districts near the player (and ahead of a moving car) are
  loaded; each is decoded in workers, merged in idle slices, shader-compiled and texture-uploaded on a per-frame
  budget before it appears, and freed ~20 s after it's left behind. Downtown (the office) always stays loaded.
- **Open world:** a 10 x 10 km island (`src/game/world/layout.ts`): 13 districts built from the supplied city maps,
  the 33 km Empire Loop ring, two cross highways, a road into every district, forests, lamps, billboards that show
  your live level and revenue. Districts stream in as you approach. **M** opens the map (click = waypoint/GPS);
  🚕 fast-travels to any district.
- **Driving:** walk up to any parked car (office lot, every district entrance) and press **E**, or take a slow car
  from traffic with **E**. **W/S** gas/brake, **A/D** steer, **Space** handbrake drift, **Shift** nitro, **H** horn,
  **E** get out. Top speed is capped at 300 km/h (Supercar / Future Racer); off-road is slower. Crashes into
  buildings, props and traffic (`src/game/systems/drive.ts`). Synthesized engine, wind, tyre, crash and horn sounds.
- **On foot:** WASD move, mouse look (click the game to capture the mouse, Esc frees it; or drag), Shift sprint,
  Space jump, F or left-click punch, E use / enter car, M map. The camera eases in behind you when you run.
- **Wanted level:** assault, running people over, carjacking and ramming cops raise the stars
  (`src/game/systems/police.ts`, A* routing in `nav.ts`). Police cars chase and ram; get pinned and it's BUSTED
  (back at the office, street-cash fine). Stay out of sight to lose them. Missions and cabs are off while wanted.
- **Three protagonists (C):** switch between Salik, Soldier Boy and Aesthetic Boy with a sky-cam transition; each
  waits where you left them (`src/game/systems/switcher.ts`). **X** = their special ability: Focus Drive (slow-mo
  while driving), Rage (3x punches, little damage taken), Bullet Time (slow-mo on foot) (`abilities.ts`).
- **Day / night:** a 24-minute day (`src/game/world/clock.ts`): sunsets, stars, lit street lamps, headlights.
- **Music** (`src/game/music.ts`, files in `public/audio/music/` from the user's `songs/` folder): the game theme
  plays from the first click, at the desk and on foot; in a car it crossfades to **SALIK FM** (the user's songs,
  shuffled, **N** = next song). Music ducks under sale celebrations and WASTED / BUSTED.
- **Radio (Q while driving):** SALIK FM, then Empire FM, Non-Stop Sales, Lo-Fi Lounge (generated, `audio.ts`), then off.
- **Driving physics** (`src/game/systems/aero.ts` + `drive.ts`): aerodynamic drag ½ρCdAv², downforce ½ρClAv² (more
  grip and braking at speed), rolling resistance, engine power P/v (top speed is a real drag equilibrium), per-car
  mass / Cd / frontal area / tyre grip, slipstream behind traffic (−45% drag, shown on the speedo), momentum-shared
  car crashes, air drag in jumps, body pitch / roll from g-forces. Supercar 0–100 km/h ≈ 2.3 s, 0–300 ≈ 19 s.
- **Pause menu (Esc, GTA V style)** (`src/features/hud/PauseMenu.tsx`): freezes the world; tabs for Map, Missions,
  Stats (sales career + city stats from `src/game/systems/stats.ts`), Trophies, Character, Settings, Controls (F1);
  Resume, Fast travel, Log a sale, Back to desk. Backspace also goes back to the desk.
- **Help text** (`src/game/systems/help.ts`): GTA-style tips top left the first time you walk, drive or get wanted.
- **Audio settings:** master volume, music volume (theme + radio), theme music on/off (also the Music button on
  the desk dock), mute all.
- **UI:** desk card + dock at the desk; while roaming only the radar, money/level, cash/clock and context prompts
  (`src/ui.css`). The Low preset swaps live blur for solid panels.
- **V** cycles car cameras (near / far / hood). **Stunt jumps:** 8 ramps beside the highways, slow-mo in the air,
  $250 for each one found. **Empire Customs** (on Empire Avenue): drive in and stop to respray or upgrade engine,
  top speed and nitro with street cash (`src/game/systems/garage.ts`).
- **The office** opens onto Empire Avenue, a straight road to the highway; the six showpiece cars are parked nose-out.
- **People & fights:** pedestrians react (`src/game/systems/people.ts`): bump them and they shove back, **F** punches,
  they fight back or run, cars knock them over. Gunfire makes crowds scatter; people who are shot fall and bleed.
- **Guns** (`src/game/systems/weapons.ts`, models in `public/models/weapons/`): Pistol, Gusenberg SMG, Assault Rifle,
  Carbine, Sniper (scope), Plasma Pistol, Incinerator (explosive). **Right mouse** aim (over-the-shoulder zoom),
  **left mouse** fire, **R** reload, hold **Tab** for the weapon wheel, **1–8** quick select. You start with the
  pistol; the rest are pickups (Havana Street, the police station, Old Street, Wasteland) along with health packs and
  body armour. Cars take damage, smoke, catch fire and explode.
- **Firing & reactions:** left-click fires while right-click aims (mouse events, so the chorded click registers);
  empty clips reload by themselves; recoil rocks the arms and shoulders, spent cases fly out, the support hand
  swaps the magazine on reload. People hit by bullets flinch away from the impact, clutch the wound and leave a
  blood trail; fatal hits play one of three deaths (`dyingPose` in poses.ts: headshot drop, stagger-and-fold, thrown
  back), with exit-wound spatter on the ground and a pool under the body.
- **Vice City cheats** (`src/game/systems/cheats.ts`, type while playing): THUGSTOOLS / PROFESSIONALTOOLS /
  NUTTERTOOLS (weapon sets), ASPIRINE (health), PRECIOUSPROTECTION (armour), LEAVEMEALONE (no wanted level),
  YOUWONTTAKEMEALIVE (+2 stars), BIGBANG (blow up nearby cars). Never touch sales data or street cash.
- **Health & armour:** bars under the minimap (GTA V). Health regenerates to half on its own; armour soaks bullets.
  At zero it's **WASTED** (grey slow-motion, wake up outside the office, small street-cash hospital bill).
- **Police (GTA V style):** cruisers stop short of you on foot (never drive through you); officers get out and chase:
  one star = arrest (**BUSTED**), two stars and up = they shoot; from three stars they shoot at your car. Cars and
  cruisers are solid to people on foot (`src/game/systems/police.ts`).
- **Havana Street + police station:** the user's Havana street kit lines Empire Avenue outside the office; the
  police station faces it, with a rideable **police bike** outside (it leans into corners).
- **Holding things** (`placeHeld` in `src/game/world/Combat.tsx`, `src/game/character/ik.ts`, `grip()` in poses):
  fingers close round grips (per-rig curl axes measured from each hand), a lowered pistol hangs from the arm and
  swings with it, rifles sit at low ready with the support hand IK-placed on the handguard, aiming is a two-handed
  isosceles stance (pistol) or bladed shouldered stance (rifle); mugs stay upright until they reach the lips, the
  phone screen faces the eyes; hands at rest are relaxed, not flat. Officers use the same holds.
- **Movement:** speed-blended gait (`locomotion()` in `src/game/animations/poses.ts`): knee fold, hip sway, arm swing,
  lean into speed and turns, landing dip; NPCs and officers use the same model.
- **Settings ⚙** (`src/game/settings.ts`): Low / Medium / High / Ultra presets (suggested from your GPU), resolution
  scale with dynamic resolution, anti-aliasing, shadows, view distance, traffic and pedestrian density, effects,
  night lighting, FPS counter.
- **Missions:** 🎯 or yellow markers: First Wheels, Highway Rush, 300 Club, Street Fight, Grand Tour, Empire Loop GP
  (`src/game/systems/missions.ts`). They pay *street cash* stored in the browser only: never XP, revenue or rewards.
- Plain sales play out while you drive (toast, sound, XP); office upgrades and the boss cut back to the desk.

Code: `src/game/systems/explore.ts` (movement, collisions, interactables, travel), `src/game/world/` (maps, vehicles,
crowd, companion, interactions).

### Rebuilding assets (Blender, headless)

```bash
blender -b --factory-startup --python tools/blender/convert_world.py -- downtown towers pack future
```

```bash
blender -b --factory-startup --python tools/blender/convert_characters.py -- salik soldier aesthetic
```

`convert_world.py` bakes each map to metres, tiles + decimates it, exports a Draco GLB and a 0.5 m collision grid
(`public/models/world/<id>.grid.json`); cars are aligned, sized to real length and textures capped at 512 px.
`convert_characters.py` renames bones to the rig the game drives and auto-rigs static models (incl. the police officer).
`convert_props.py` turns the weapon, blood, police-station and police-bike GLBs (folder `new glb/`) into small props;
`render_weapon_icons.py` renders the HUD weapon icons.

## Send events (CRM / webhook)

```bash
curl -X POST http://localhost:8787/api/events -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"user_id":"salik","event_type":"deal_closed","amount":2500,"currency":"USD","source":"crm","external_id":"deal_789"}'
```

Repeating the same `source` + `external_id` is ignored (no double XP/revenue).

## Layout

- `shared/` — domain types + deterministic rules (levels, XP, office tier, boss HP); used by server and client
- `server/` — event pipeline (validate → duplicate → authorize → KPI map → reward → transaction → game event), admin API, SSE
- `src/game/` — avatar, office tiers, target wall, particles, camera, audio, director (prioritized reaction queue)
- `src/features/` — HUD, panels, demo, admin
- `public/models/props/office_props.glb` — prop kit (desks/chairs per tier, laptop, monitor, mug, plant, lamp, trophy, papers, AI companion), modelled by `tools/blender/build_office_props.py`; regenerate with `blender -b --factory-startup --python tools/blender/build_office_props.py`. If it fails to load, the office falls back to primitive furniture.
- `public/models/characters/<id>/` — character GLBs + thumbnails; `public/models/world/` maps; `public/models/vehicles/` cars; `public/draco/` decoder
- `docs/prd`, `docs/rules` — chunked PRD / project rules

## Not yet done (see docs/rules/done.md)

Real auth (Supabase Auth + RLS; currently key-based admin/webhook), logo upload, hosted deployment, Mixamo clips
(poses are procedural; drop GLB clips in `public/animations/` to replace them), sound assets (cues are synthesized).
