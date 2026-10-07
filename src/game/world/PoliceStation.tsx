// The user's police station model on Empire Avenue (solid footprint lives in layout.ts). Wanted-level patrols are
// themed by it; the police bike parked outside is drivable.
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { DRACO_PATH } from "./CityMap.tsx";
import { POLICE_STATION } from "./layout.ts";

export function PoliceStation() {
  const { scene } = useGLTF("/models/props/police_station.glb", DRACO_PATH);
  const model = useMemo(() => {
    const o = scene.clone(true);
    // Scanned model, slimmed for laptops: draw both faces so decimation gaps don't show the sky through the walls.
    o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; (m.material as THREE.Material).side = THREE.DoubleSide; } });
    return o;
  }, [scene]);
  return (
    <group position={[POLICE_STATION.x, 0, POLICE_STATION.z]} rotation-y={POLICE_STATION.rot}>
      <primitive object={model} />
    </group>
  );
}
