// AI companion (PRD §21): hovers near the player, celebrates sales, points at the target when it is close,
// and gives real-data tips when clicked. Never interrupts on its own.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { tint, useProp } from "../environment/props.tsx";
import { interact, lerpAngle, player } from "../systems/explore.ts";
import { companionPos, companionSignal } from "./interactions.ts";
import { gun } from "../systems/weapons.ts";

const EYE = { idle: new THREE.Color("#4dc4ff"), party: new THREE.Color("#ffd34d"), focus: new THREE.Color("#ff8a2a"), talk: new THREE.Color("#7cff6b") };
const DESK_SPOT = new THREE.Vector3(-0.95, 1.55, -0.25);
const WALL_SPOT = new THREE.Vector3(0.75, 1.9, -1.45);

export function Companion() {
  const model = useProp("companion");
  const ref = useRef<THREE.Group>(null);
  const eyes = useMemo(() => {
    const mats: THREE.MeshStandardMaterial[] = [];
    tint(model, "companion_eye", (m) => mats.push(m));
    return mats;
  }, [model]);
  const fallbackEye = useRef<THREE.MeshStandardMaterial>(null);
  const s = useRef({ t: 0, party: 0, talk: 0, seenParty: companionSignal.celebrate, seenTalk: companionSignal.talk, spin: 0, eye: EYE.idle.clone() });
  const tmp = useMemo(() => ({ home: new THREE.Vector3(), off: new THREE.Vector3() }), []);

  useFrame((_, dtRaw) => {
    const o = ref.current;
    if (!o) return;
    const dt = Math.min(dtRaw, 0.05);
    const st = s.current;
    const g = useGame.getState();
    st.t += dt;
    if (companionSignal.celebrate !== st.seenParty) { st.seenParty = companionSignal.celebrate; st.party = 2.4; }
    if (companionSignal.talk !== st.seenTalk) { st.seenTalk = companionSignal.talk; st.talk = 2.2; }
    st.party = Math.max(0, st.party - dt);
    st.talk = Math.max(0, st.talk - dt);

    const shown = g.shown;
    const ratio = shown && shown.monthlyTarget > 0 ? shown.monthlyRevenue / shown.monthlyTarget : 0;
    const pointing = !g.explore && !g.wallBroken && ratio >= 0.85 && ratio < 1 && st.party === 0;

    // Where to hover: over the player's right shoulder while roaming, beside the desk otherwise.
    if (g.explore) {
      // Holding a gun: drift up over the left shoulder, out of the aiming camera's line of sight.
      if (gun.held) tmp.off.set(1.1, 2.5, -0.6); else tmp.off.set(-0.6, 1.7, -0.35);
      tmp.off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, player.yaw);
      tmp.home.copy(player.pos).add(tmp.off);
    } else tmp.home.copy(pointing ? WALL_SPOT : DESK_SPOT);
    if (st.party > 0) tmp.home.y += 0.35 + Math.abs(Math.sin(st.t * 9)) * 0.25;
    o.position.lerp(tmp.home, 1 - Math.exp(-dt * (g.explore ? 3.5 : 2.5)));
    o.position.y += Math.sin(st.t * 2.2) * 0.0025; // gentle bob
    companionPos.copy(o.position);

    // Face: target wall when pointing, otherwise the player (party = happy spins).
    const look = pointing ? { x: -0.2, z: -2.05 } : g.explore ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0.2 };
    let yaw = Math.atan2(look.x - o.position.x, look.z - o.position.z);
    if (st.party > 0) { st.spin += dt * 9; yaw += st.spin; } else st.spin = 0;
    o.rotation.y = st.party > 0 ? yaw : lerpAngle(o.rotation.y, yaw, 1 - Math.exp(-dt * 5));
    o.rotation.z = Math.sin(st.t * 1.3) * 0.06 + (st.talk > 0 ? Math.sin(st.t * 14) * 0.12 : 0);

    const want = st.party > 0 ? EYE.party : st.talk > 0 ? EYE.talk : pointing ? EYE.focus : EYE.idle;
    st.eye.lerp(want, 1 - Math.exp(-dt * 6));
    const pulse = pointing ? 3 + Math.sin(st.t * 6) * 2 : st.party > 0 ? 6 : 4;
    for (const m of eyes) { m.emissive.copy(st.eye); m.color.copy(st.eye); m.emissiveIntensity = pulse; }
    if (fallbackEye.current) { fallbackEye.current.emissive.copy(st.eye); fallbackEye.current.emissiveIntensity = pulse * 0.3; }
  });

  return (
    <group ref={ref} position={DESK_SPOT.toArray()}
      onClick={(e) => { e.stopPropagation(); interact("companion"); }}
      onPointerOver={() => { document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}>
      {model ? <primitive object={model} /> : (
        <>
          <mesh castShadow><sphereGeometry args={[0.15, 20, 14]} /><meshStandardMaterial color="#eef1f6" roughness={0.3} /></mesh>
          <mesh position={[0, 0.03, 0.12]}><sphereGeometry args={[0.05, 12, 8]} /><meshStandardMaterial ref={fallbackEye} color="#4dc4ff" emissive="#4dc4ff" /></mesh>
        </>
      )}
      {/* Generous invisible hit area: the bot is small and moving. */}
      <mesh><sphereGeometry args={[0.32, 8, 6]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    </group>
  );
}
