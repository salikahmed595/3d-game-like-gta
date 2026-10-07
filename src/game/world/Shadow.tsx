// Soft contact shadow (a blurred dark disc) that grounds cars and people out in the open world, where the
// office's real shadow map doesn't reach. One shared texture/material for every instance.
import { useMemo } from "react";
import * as THREE from "three";

let shared: THREE.MeshBasicMaterial | null = null;
function material(): THREE.MeshBasicMaterial {
  if (shared) return shared;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  shared = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false });
  return shared;
}

export function Shadow({ size = 1, length }: { size?: number; length?: number }) {
  const mat = useMemo(material, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.07} material={mat} renderOrder={1}>
      <planeGeometry args={[size, length ?? size]} />
    </mesh>
  );
}
