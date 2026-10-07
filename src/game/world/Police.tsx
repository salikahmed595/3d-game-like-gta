// Police cars: the user's black SUV with a flashing red/blue light bar on the roof (driven by systems/police.ts).
import { Suspense, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { cops } from "../systems/police.ts";
import type { Cop } from "../systems/police.ts";
import { DRACO_PATH } from "./CityMap.tsx";
import { vehicleUrl } from "./city.ts";
import { Shadow } from "./Shadow.tsx";

const MODEL = "pack_5";
const RED = new THREE.MeshBasicMaterial({ color: "#ff2030", toneMapped: false });
const BLUE = new THREE.MeshBasicMaterial({ color: "#2050ff", toneMapped: false });
const OFF = new THREE.MeshBasicMaterial({ color: "#222630" });

function CopCar({ cop }: { cop: Cop }) {
  const { scene } = useGLTF(vehicleUrl(MODEL), DRACO_PATH);
  const model = useMemo(() => scene.clone(true), [scene]);
  const height = useMemo(() => new THREE.Box3().setFromObject(scene).max.y, [scene]);
  const ref = useRef<THREE.Group>(null);
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    g.position.set(cop.x, 0, cop.z);
    g.rotation.y = cop.yaw;
    const phase = Math.floor(clock.elapsedTime * 6) % 2 === 0;
    if (left.current) left.current.material = phase ? RED : OFF;
    if (right.current) right.current.material = phase ? OFF : BLUE;
  });
  return (
    <group ref={ref}>
      <primitive object={model} />
      <group position-y={height + 0.06}>
        <mesh position={[0, 0, 0]}><boxGeometry args={[1.3, 0.1, 0.3]} /><meshStandardMaterial color="#111" /></mesh>
        <mesh ref={left} position={[0.36, 0.1, 0]} material={RED}><boxGeometry args={[0.55, 0.13, 0.26]} /></mesh>
        <mesh ref={right} position={[-0.36, 0.1, 0]} material={BLUE}><boxGeometry args={[0.55, 0.13, 0.26]} /></mesh>
      </group>
      <Shadow size={2.6} length={5.2} />
    </group>
  );
}

export function Police() {
  const version = useGame((s) => s.copsVersion);
  const list = useMemo(() => [...cops], [version]); // eslint-disable-line react-hooks/exhaustive-deps
  return <group>{list.map((c) => <Suspense key={c.id} fallback={null}><CopCar cop={c} /></Suspense>)}</group>;
}
