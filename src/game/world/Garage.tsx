// Empire Customs building on Empire Avenue. Drive in and stop: the customs menu opens (respray, engine, top speed,
// nitro) — paid with street cash from missions and stunt jumps.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { drivenCar } from "../systems/drive.ts";
import { GARAGE, inGarageBay } from "./layout.ts";

function signTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#101318"; c.fillRect(0, 0, 512, 128);
  c.fillStyle = "#ffd23f"; c.font = "900 64px Impact, system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("EMPIRE CUSTOMS", 256, 66);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Garage() {
  const { w, d, h } = GARAGE;
  const sign = useMemo(signTexture, []);
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a4f58", roughness: 0.8 }), []);
  const inside = useRef({ t: 0, latched: false });
  useFrame((_, dt) => {
    const g = useGame.getState();
    const car = drivenCar();
    const st = inside.current;
    const inBay = !!car && inGarageBay(car.x, car.z);
    if (!inBay) { st.t = 0; st.latched = false; return; }
    // Stopped in the bay: open the menu once (drive out and back in to reopen).
    if (Math.abs(car!.speed) < 2.5 && !st.latched && g.panel === "none") {
      st.t += dt;
      if (st.t > 0.5) { st.latched = true; g.set({ panel: "customs" }); }
    }
  });
  return (
    <group position={[GARAGE.x, 0, GARAGE.z]}>
      <mesh position={[0, h / 2, d / 2]} material={wall}><boxGeometry args={[w, h, 0.3]} /></mesh>
      <mesh position={[-w / 2, h / 2, 0]} material={wall}><boxGeometry args={[0.3, h, d]} /></mesh>
      <mesh position={[w / 2, h / 2, 0]} material={wall}><boxGeometry args={[0.3, h, d]} /></mesh>
      <mesh position={[0, h, 0]} material={wall}><boxGeometry args={[w + 0.4, 0.3, d + 0.4]} /></mesh>
      <mesh position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}><planeGeometry args={[w, d]} /><meshStandardMaterial color="#2b2e33" roughness={0.6} /></mesh>
      {/* Sign over the open front (facing the avenue, i.e. -z). */}
      <mesh position={[0, h + 0.9, -d / 2 - 0.05]} rotation-y={Math.PI}><planeGeometry args={[w * 0.9, 1.5]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
      {/* Ceiling strip light (emissive, not a real light: every extra light costs every material). */}
      <mesh position={[0, h - 0.18, 0]}><boxGeometry args={[w * 0.6, 0.06, 0.3]} /><meshBasicMaterial color="#fff2d0" toneMapped={false} /></mesh>
    </group>
  );
}
