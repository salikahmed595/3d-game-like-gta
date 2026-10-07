import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { makeSkylineTexture, makeTextTexture } from "./textures.ts";
import { PropKitProvider, tint, useProp } from "./props.tsx";
import { DOOR, OFFICE, floorClick, interact } from "../systems/explore.ts";
import { formatMoney } from "../../../shared/engine.ts";
import type { ThreeEvent } from "@react-three/fiber";
import type { Rarity } from "../../../shared/domain.ts";

const NO_TROPHIES: never[] = [];

type V3 = [number, number, number];
function B({ p, s, c, rough = 0.7, metal = 0, emissive, ei = 0, shadow = true }: {
  p: V3; s: V3; c: string; rough?: number; metal?: number; emissive?: string; ei?: number; shadow?: boolean;
}) {
  return (
    <mesh position={p} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={rough} metalness={metal} emissive={emissive ?? "#000"} emissiveIntensity={ei} />
    </mesh>
  );
}

const TIER_STYLE = {
  1: { floor: "#8d7b66", wall: "#b9b3a6", desk: "#a9916b", deskLeg: "#6d6a63", chair: "#6b6f76" },
  2: { floor: "#6f5a45", wall: "#cfd6df", desk: "#5a3d2b", deskLeg: "#222831", chair: "#1d2229" },
  3: { floor: "#2e2a2b", wall: "#e4dfd6", desk: "#26211f", deskLeg: "#c9a24b", chair: "#3b2418" },
} as const;

const RARITY_COLOR: Record<Rarity, string> = { common: "#cd7f32", rare: "#c9d1d9", epic: "#ffcc33", legendary: "#7ee7ff" };

function Room({ tier }: { tier: 1 | 2 | 3 }) {
  const st = TIER_STYLE[tier];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow onClick={floorClick}>
        <planeGeometry args={[5.4, 5]} />
        <meshStandardMaterial color={st.floor} roughness={tier === 3 ? 0.35 : 0.85} />
      </mesh>
      {/* back wall (z=-2.5) and left wall (x=-2.7); front/right are glass so the camera sees in */}
      <B p={[0, 1.5, -2.55]} s={[5.4, 3, 0.1]} c={st.wall} shadow={false} />
      <B p={[-2.75, 1.5, 0]} s={[0.1, 3, 5]} c={st.wall} shadow={false} />
      <B p={[0, 0.06, -2.48]} s={[5.4, 0.12, 0.05]} c="#ece8df" shadow={false} />
      <B p={[-2.68, 0.06, 0]} s={[0.05, 0.12, 5]} c="#ece8df" shadow={false} />
      <GlassWalls />
    </group>
  );
}

// Storefront glazing with a door on the street side. No corner post: it would sit in the default sightline.
function GlassWalls() {
  const frame = "#b8c0cb"; // light aluminium: reads as glazing without cutting through the demo shot
  const glass = <meshStandardMaterial color="#a9d2f0" transparent opacity={0.1} roughness={0.05} metalness={0.2} depthWrite={false} side={THREE.DoubleSide} />;
  const rz0 = OFFICE.minZ, rz1 = OFFICE.maxZ;
  const seg = (a: number, b: number) => ({ c: (a + b) / 2, l: b - a });
  const southOfDoor = seg(rz0, DOOR.z0), northOfDoor = seg(DOOR.z1, rz1);
  return (
    <group>
      {/* front (z = 2.5) */}
      <mesh position={[0, 1.5, rz1]}><planeGeometry args={[5.5, 3]} />{glass}</mesh>
      <B p={[0, 0.04, rz1]} s={[5.5, 0.08, 0.08]} c={frame} shadow={false} />
      <B p={[0, 2.98, rz1]} s={[5.5, 0.06, 0.06]} c={frame} shadow={false} />
      {/* right (x = 2.7) with door gap */}
      {[southOfDoor, northOfDoor].map((s, i) => (
        <group key={i}>
          <mesh position={[OFFICE.maxX, 1.5, s.c]} rotation-y={Math.PI / 2}><planeGeometry args={[s.l, 3]} />{glass}</mesh>
          <B p={[OFFICE.maxX, 0.04, s.c]} s={[0.08, 0.08, s.l]} c={frame} shadow={false} />
        </group>
      ))}
      <mesh position={[OFFICE.maxX, 2.6, (DOOR.z0 + DOOR.z1) / 2]} rotation-y={Math.PI / 2}><planeGeometry args={[DOOR.z1 - DOOR.z0, 0.8]} />{glass}</mesh>
      <B p={[OFFICE.maxX, 2.98, 0]} s={[0.06, 0.06, 5]} c={frame} shadow={false} />
      <B p={[OFFICE.maxX, 1.1, DOOR.z0]} s={[0.035, 2.2, 0.035]} c={frame} shadow={false} />
      <B p={[OFFICE.maxX, 1.1, DOOR.z1]} s={[0.035, 2.2, 0.035]} c={frame} shadow={false} />
      <B p={[OFFICE.maxX, 2.2, (DOOR.z0 + DOOR.z1) / 2]} s={[0.035, 0.035, DOOR.z1 - DOOR.z0]} c={frame} shadow={false} />
      {/* doormat */}
      <mesh rotation-x={-Math.PI / 2} position={[OFFICE.maxX + 0.45, 0.005, (DOOR.z0 + DOOR.z1) / 2]}><planeGeometry args={[0.7, 1.2]} /><meshStandardMaterial color="#26292f" roughness={1} /></mesh>
    </group>
  );
}

/** Live KPI board on the back wall (server values only). Click/E opens the full panel. */
function StatsBoard() {
  const shown = useGame((s) => s.shown);
  const brand = useGame((s) => s.config?.brand);
  const tex = useMemo(() => {
    if (!shown || !brand) return null;
    return makeTextTexture([
      { text: "PERFORMANCE", size: 54, color: brand.primaryColor ?? "#ffb020", weight: 800 },
      { text: `${shown.stats.deals} deals  ·  ${shown.stats.meetings} meetings`, size: 44, color: "#ffffff", weight: 700 },
      { text: `${shown.stats.calls} calls  ·  ${shown.streak}-day streak`, size: 44, color: "#ffffff", weight: 700 },
      { text: `Lifetime ${formatMoney(shown.stats.lifetimeRevenue, brand)}`, size: 44, color: "#7ee7ff", weight: 700 },
    ], 768, 420, "#141922");
  }, [shown, brand]);
  if (!tex) return null;
  return (
    <group position={[1.95, 1.25, -2.49]}
      onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); interact("stats"); }}
      onPointerOver={() => { document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}>
      <B p={[0, 0, 0]} s={[1.16, 0.68, 0.03]} c="#0d1016" shadow={false} />
      <mesh position={[0, 0, 0.017]}><planeGeometry args={[1.1, 0.62]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
    </group>
  );
}

function WindowView({ tier }: { tier: 1 | 2 | 3 }) {
  const sky = useMemo(() => makeSkylineTexture(), []);
  if (tier === 1) {
    return (
      <group position={[-2.68, 1.7, 1.4]}>
        <B p={[0, 0, 0]} s={[0.04, 0.7, 0.6]} c="#9aa6b5" ei={0.3} emissive="#9aa6b5" shadow={false} />
      </group>
    );
  }
  const big = tier === 3;
  const w = big ? 3.2 : 1.3, h = big ? 1.9 : 1.0;
  return (
    <group position={[-2.68, big ? 1.55 : 1.7, big ? 0.3 : 1.3]} rotation-y={Math.PI / 2}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={sky} toneMapped={false} />
      </mesh>
      <B p={[0, h / 2 + 0.03, 0.02]} s={[w + 0.12, 0.06, 0.06]} c="#20242b" shadow={false} />
      <B p={[0, -h / 2 - 0.03, 0.02]} s={[w + 0.12, 0.06, 0.06]} c="#20242b" shadow={false} />
      <B p={[-w / 2 - 0.03, 0, 0.02]} s={[0.06, h, 0.06]} c="#20242b" shadow={false} />
      <B p={[w / 2 + 0.03, 0, 0.02]} s={[0.06, h, 0.06]} c="#20242b" shadow={false} />
      <B p={[0, 0, 0.02]} s={[0.04, h, 0.04]} c="#20242b" shadow={false} />
    </group>
  );
}

// Top-surface height of each modelled desk (top thickness differs per tier); primitives sit at 0.765.
const DESK_SURFACE = { 1: 0.76, 2: 0.765, 3: 0.775 } as const;

function Desk({ tier }: { tier: 1 | 2 | 3 }) {
  const w = tier === 1 ? 1.3 : tier === 2 ? 1.6 : 2.0;
  const d = tier === 1 ? 0.65 : 0.8;
  const model = useProp(`desk_t${tier}`);
  return (
    <group position={[0, 0, 0.95]}>
      {model ? <primitive object={model} /> : <DeskPrimitive tier={tier} w={w} d={d} />}
      <Laptop tier={tier} />
      {tier >= 2 && <Monitors tier={tier} />}
      <Mug tier={tier} />
      <Papers tier={tier} />
    </group>
  );
}

function DeskPrimitive({ tier, w, d }: { tier: 1 | 2 | 3; w: number; d: number }) {
  const st = TIER_STYLE[tier];
  return (
    <>
      <B p={[0, 0.74, 0]} s={[w, 0.05, d]} c={st.desk} rough={tier === 3 ? 0.3 : 0.65} />
      {tier === 1 ? (
        <>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <B key={i} p={[sx * (w / 2 - 0.05), 0.36, sz * (d / 2 - 0.05)]} s={[0.04, 0.72, 0.04]} c={st.deskLeg} metal={0.5} />
          ))}
        </>
      ) : (
        <>
          <B p={[-(w / 2 - 0.03), 0.36, 0]} s={[0.05, 0.72, d - 0.05]} c={st.deskLeg} metal={tier === 3 ? 0.8 : 0.2} />
          <B p={[w / 2 - 0.03, 0.36, 0]} s={[0.05, 0.72, d - 0.05]} c={st.deskLeg} metal={tier === 3 ? 0.8 : 0.2} />
          <B p={[0, 0.5, d / 2 - 0.04]} s={[w - 0.1, 0.45, 0.03]} c={st.desk} />
        </>
      )}
    </>
  );
}

function Laptop({ tier }: { tier: 1 | 2 | 3 }) {
  const old = tier === 1;
  const model = useProp("laptop");
  useMemo(() => tint(model, "screen", (m) => m.emissive.set(old ? "#6f8aa3" : "#4fb3ff")), [model, old]);
  if (model) {
    return <primitive object={model} position={[tier === 3 ? 0.3 : 0, DESK_SURFACE[tier], 0.05]} />;
  }
  return (
    <group position={[tier === 3 ? 0.3 : 0, 0.77, 0.05]}>
      <B p={[0, 0, 0]} s={[0.34, 0.02, 0.24]} c={old ? "#8a8d92" : "#aeb4bb"} metal={0.6} />
      <group position={[0, 0.01, -0.12]} rotation-x={-0.25}>
        <B p={[0, 0.11, 0]} s={[0.34, 0.22, 0.015]} c={old ? "#7c8086" : "#9aa1a9"} metal={0.6} />
        <mesh position={[0, 0.11, 0.009]}>
          <planeGeometry args={[0.3, 0.18]} />
          <meshBasicMaterial color={old ? "#6f8aa3" : "#4fb3ff"} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Monitors({ tier }: { tier: 1 | 2 | 3 }) {
  const screens: { x: number; ry: number; w: number }[] =
    tier === 2 ? [{ x: -0.35, ry: 0, w: 0.6 }] : [{ x: -0.55, ry: 0.3, w: 0.5 }, { x: 0, ry: 0, w: 0.55 }, { x: 0.55, ry: -0.3, w: 0.5 }];
  const kit = useProp("monitor");
  if (kit) {
    return (
      <group position={[0, DESK_SURFACE[tier], 0.25]}>
        {screens.map((m, i) => <MonitorModel key={i} x={m.x} ry={m.ry} scale={m.w / 0.6} color={i === 1 ? "#2a8cff" : "#3a6df0"} />)}
      </group>
    );
  }
  return (
    <group position={[0, 0.77, 0.25]}>
      {screens.map((m, i) => (
        <group key={i} position={[m.x, 0, 0]} rotation-y={m.ry}>
          <B p={[0, 0.02, 0]} s={[0.2, 0.02, 0.14]} c="#15181d" metal={0.5} />
          <B p={[0, 0.15, 0]} s={[0.04, 0.26, 0.04]} c="#15181d" metal={0.5} />
          <B p={[0, 0.38, 0]} s={[m.w, m.w * 0.56, 0.025]} c="#0f1216" />
          <mesh position={[0, 0.38, -0.014]} rotation-y={Math.PI}>
            <planeGeometry args={[m.w - 0.04, m.w * 0.56 - 0.04]} />
            <meshBasicMaterial color={i === 1 ? "#2a8cff" : "#3a6df0"} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function MonitorModel({ x, ry, scale, color }: { x: number; ry: number; scale: number; color: string }) {
  const model = useProp("monitor");
  useMemo(() => tint(model, "screen", (m) => m.emissive.set(color)), [model, color]);
  return model ? <primitive object={model} position={[x, 0, 0]} rotation-y={ry} scale={scale} /> : null;
}

function Mug({ tier }: { tier: 1 | 2 | 3 }) {
  const model = useProp("mug");
  const inHand = useGame((s) => s.emote === "drink"); // the avatar is holding it
  const click = {
    onClick: (e: ThreeEvent<MouseEvent>) => { if (e.delta > 6) return; e.stopPropagation(); interact("coffee"); },
    onPointerOver: () => { document.body.style.cursor = "pointer"; },
    onPointerOut: () => { document.body.style.cursor = ""; },
  };
  if (model) return <primitive object={model} position={[0.55, DESK_SURFACE[tier], 0]} rotation-y={-0.6} visible={!inHand} {...click} />;
  return (
    <group position={[0.55, 0.8, 0.0]} visible={!inHand} {...click}>
      <mesh castShadow><cylinderGeometry args={[0.04, 0.035, 0.09, 16]} /><meshStandardMaterial color="#e9e9e9" /></mesh>
    </group>
  );
}
function Papers({ tier }: { tier: 1 | 2 | 3 }) {
  const model = useProp("papers");
  // The executive desk has a leather pad under the paper stack.
  if (model) return <primitive object={model} position={[-0.5, DESK_SURFACE[tier] + (tier === 3 ? 0.006 : 0), -0.05]} />;
  return <B p={[-0.5, 0.77, -0.05]} s={[0.21, 0.01, 0.3]} c="#f4f1e8" />;
}

function Chair({ tier }: { tier: 1 | 2 | 3 }) {
  const ref = useRef<THREE.Group>(null);
  const st = TIER_STYLE[tier];
  const model = useProp(`chair_t${tier}`);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const game = useGame.getState();
    const seated = game.seated && !game.explore;
    // Chair rolls out of the way when the player stands.
    g.position.x = THREE.MathUtils.lerp(g.position.x, seated ? 0 : -0.55, 1 - Math.exp(-dt * 4));
    g.position.z = THREE.MathUtils.lerp(g.position.z, seated ? -0.1 : -0.5, 1 - Math.exp(-dt * 4));
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, seated ? 0 : 0.6, 1 - Math.exp(-dt * 4));
  });
  const tall = tier === 3;
  if (model) return <group ref={ref} position={[0, 0, -0.1]}><primitive object={model} /></group>;
  return (
    <group ref={ref} position={[0, 0, -0.1]}>
      <B p={[0, 0.05, 0]} s={[0.5, 0.04, 0.08]} c="#1a1a1a" />
      <B p={[0, 0.05, 0]} s={[0.08, 0.04, 0.5]} c="#1a1a1a" />
      <B p={[0, 0.25, 0]} s={[0.06, 0.4, 0.06]} c="#2a2a2a" metal={0.6} />
      <B p={[0, 0.46, 0]} s={[0.46, 0.08, 0.46]} c={st.chair} />
      <B p={[0, tall ? 0.95 : 0.78, -0.22]} s={[0.44, tall ? 0.85 : 0.5, 0.07]} c={st.chair} />
      {tier >= 2 && (<><B p={[-0.26, 0.64, 0]} s={[0.04, 0.04, 0.34]} c="#111" /><B p={[0.26, 0.64, 0]} s={[0.04, 0.04, 0.34]} c="#111" /></>)}
    </group>
  );
}

function TrophyShelf({ tier }: { tier: 1 | 2 | 3 }) {
  const trophies = useGame((s) => s.shown?.trophies ?? NO_TROPHIES);
  const select = (i: number) => useGame.getState().set({ selectedTrophy: trophies[i], panel: "trophies" });
  const rows = tier === 3 ? 2 : 1;
  return (
    <group position={[-2.55, 0, -1.5]}>
      {Array.from({ length: rows }).map((_, r) => (
        <B key={r} p={[0, 1.25 + r * 0.55, 0]} s={[0.3, 0.04, 1.5]} c={tier === 3 ? "#2b2624" : "#7a6a55"} />
      ))}
      <B p={[-0.1, 1.5, 0]} s={[0.04, 1.2, 1.5]} c="#40372f" shadow={false} />
      {trophies.slice(0, rows * 5).map((t, i) => {
        const row = Math.floor(i / 5), col = i % 5;
        const color = RARITY_COLOR[t.rarity];
        return (
          <group key={t.id} position={[0, 1.27 + row * 0.55, -0.6 + col * 0.3]}
            onClick={(e) => { e.stopPropagation(); select(i); }}
            onPointerOver={() => { document.body.style.cursor = "pointer"; }}
            onPointerOut={() => { document.body.style.cursor = ""; }}>
            <TrophyCup rarity={t.rarity} color={color} />
          </group>
        );
      })}
    </group>
  );
}

function TrophyCup({ rarity, color }: { rarity: Rarity; color: string }) {
  const model = useProp("trophy");
  useMemo(() => tint(model, "trophy_metal", (m) => {
    m.color.set(color);
    m.emissive.set(color);
    m.emissiveIntensity = rarity === "legendary" ? 0.6 : 0.12;
  }), [model, color, rarity]);
  if (model) return <primitive object={model} />;
  return (
    <>
      <mesh position={[0, 0.03, 0]} castShadow><cylinderGeometry args={[0.07, 0.08, 0.05, 12]} /><meshStandardMaterial color="#222" /></mesh>
      <mesh position={[0, 0.08, 0]}><cylinderGeometry args={[0.015, 0.015, 0.08, 8]} /><meshStandardMaterial color={color} metalness={0.8} roughness={0.25} /></mesh>
      <mesh position={[0, 0.19, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.03, 0.13, 14]} />
        <meshStandardMaterial color={color} metalness={0.85} roughness={0.2} emissive={color} emissiveIntensity={rarity === "legendary" ? 0.6 : 0.12} />
      </mesh>
    </>
  );
}

function BrandSign({ tier }: { tier: 1 | 2 | 3 }) {
  const brand = useGame((s) => s.config?.brand);
  const tex = useMemo(
    () => makeTextTexture([{ text: (brand?.companyName ?? "").toUpperCase(), size: 110, color: "#ffffff" }, { text: tier === 3 ? (brand?.buildingName ?? "").toUpperCase() : (brand?.playerTitle ?? "").toUpperCase(), size: 48, color: brand?.primaryColor ?? "#ffb020", weight: 600 }], 1024, 256),
    [brand?.companyName, brand?.buildingName, brand?.playerTitle, brand?.primaryColor, tier],
  );
  if (tier === 1) return null;
  return (
    <group position={[1.35, 2.1, -2.48]}>
      <B p={[0, 0, -0.01]} s={[2.0, 0.55, 0.03]} c={tier === 3 ? "#16181d" : "#2d3440"} shadow={false} />
      <mesh position={[0, 0, 0.012]}><planeGeometry args={[1.95, 0.49]} /><meshBasicMaterial map={tex} transparent toneMapped={false} /></mesh>
    </group>
  );
}

function Decor({ tier }: { tier: 1 | 2 | 3 }) {
  const plant = useProp("plant");
  const lamp = useProp("floor_lamp");
  return (
    <group>
      {tier >= 2 && plant && (
        <primitive object={plant} position={[2.0, 0, -1.6]}
          onClick={(e: ThreeEvent<MouseEvent>) => { if (e.delta > 6) return; e.stopPropagation(); interact("plant"); }}
          onPointerOver={() => { document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { document.body.style.cursor = ""; }} />
      )}
      {tier >= 2 && !plant && (
        <group position={[2.0, 0, -1.6]}>
          <mesh castShadow position={[0, 0.2, 0]}><cylinderGeometry args={[0.16, 0.12, 0.4, 12]} /><meshStandardMaterial color="#d8d2c4" /></mesh>
          <mesh castShadow position={[0, 0.65, 0]}><icosahedronGeometry args={[0.28, 1]} /><meshStandardMaterial color="#2f7d4a" roughness={0.9} /></mesh>
        </group>
      )}
      {tier === 3 && (
        <>
          <mesh position={[0.1, 0.012, 0.9]} rotation-x={-Math.PI / 2} receiveShadow>
            <planeGeometry args={[3.2, 2.4]} /><meshStandardMaterial color="#5b1f2b" roughness={1} />
          </mesh>
          {lamp ? <primitive object={lamp} position={[-2.1, 0, 1.9]} /> : (
            <group position={[-2.1, 0, 1.9]}>
              <B p={[0, 0.9, 0]} s={[0.04, 1.8, 0.04]} c="#c9a24b" metal={0.9} />
              <mesh position={[0, 1.85, 0]}><coneGeometry args={[0.25, 0.3, 16, 1, true]} /><meshStandardMaterial color="#f5e6c8" emissive="#ffd28a" emissiveIntensity={0.8} side={THREE.DoubleSide} /></mesh>
            </group>
          )}
        </>
      )}
      {tier === 2 && <B p={[-2.66, 1.9, -0.7]} s={[0.04, 0.5, 0.7]} c="#d9c7a0" />}
    </group>
  );
}

function Lights({ tier }: { tier: 1 | 2 | 3 }) {
  const pulseRef = useRef<THREE.PointLight>(null);
  const lastPulse = useRef(0);
  const energy = useRef(0);
  const warm = tier === 1 ? 0.55 : tier === 2 ? 0.9 : 1.2;
  useFrame((_, dt) => {
    const p = useGame.getState().pulse;
    if (p !== lastPulse.current) { lastPulse.current = p; energy.current = 1; }
    energy.current = Math.max(0, energy.current - dt * 1.4);
    if (pulseRef.current) pulseRef.current.intensity = energy.current * 18;
  });
  return (
    <>
      <ambientLight intensity={tier === 1 ? 0.35 : 0.5} />
      <hemisphereLight args={["#cfe3ff", "#6a5a48", 0.45 * warm]} />
      <directionalLight position={[3, 5, 3]} intensity={warm * 1.3} castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} shadow-bias={-0.0004} />
      <pointLight position={[-1.5, 2.4, 0.6]} intensity={tier === 1 ? 3 : 8} color={tier === 3 ? "#ffe2b0" : "#fff1d6"} distance={8} />
      <pointLight ref={pulseRef} position={[0, 1.6, 0.5]} color="#ffd36b" intensity={0} distance={7} />
    </>
  );
}

export function Office() {
  const tier = useGame((s) => s.displayTier);
  return (
    <group>
      <Lights tier={tier} />
      <Room tier={tier} />
      <WindowView tier={tier} />
      <BrandSign tier={tier} />
      <StatsBoard />
      <PropKitProvider>
        <Desk tier={tier} />
        <Chair tier={tier} />
        <TrophyShelf tier={tier} />
        <Decor tier={tier} />
      </PropKitProvider>
    </group>
  );
}
