import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import type { BurstKind } from "../../types/game.ts";

const POOL = 700;
const PALETTES: Record<BurstKind, string[]> = {
  sale: ["#ffd34d", "#ffb020", "#fff2b0"],
  confetti: ["#ff4d6d", "#ffd34d", "#4dd2ff", "#7cff6b", "#c77dff", "#ffffff"],
  dust: ["#b9b2a5", "#8f897d", "#d6d0c3"],
  xp: ["#6fd3ff", "#b6f0ff"],
};

// One pooled instanced system for all bursts; intensity scales with achievement importance.
export function Particles() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => ({
    pos: new Float32Array(POOL * 3), vel: new Float32Array(POOL * 3), life: new Float32Array(POOL),
    max: new Float32Array(POOL), size: new Float32Array(POOL), spin: new Float32Array(POOL), grav: new Float32Array(POOL), next: 0,
  }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seen = useRef(0);
  const reduced = useGame((s) => s.reducedMotion);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < POOL; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, new THREE.Color("#fff")); }
  }, [dummy]);

  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    const bursts = useGame.getState().bursts;
    for (const b of bursts) {
      if (b.id <= seen.current) continue;
      seen.current = b.id;
      const count = Math.round((b.kind === "confetti" ? 160 : b.kind === "dust" ? 70 : 36) * b.intensity * (reduced ? 0.4 : 1));
      const palette = PALETTES[b.kind].map((c) => new THREE.Color(c));
      for (let n = 0; n < count; n++) {
        const i = data.next; data.next = (data.next + 1) % POOL;
        const a = Math.random() * Math.PI * 2;
        const up = b.kind === "confetti" ? 3 + Math.random() * 3 : b.kind === "dust" ? 0.6 + Math.random() : 1.5 + Math.random() * 2;
        const sp = (b.kind === "dust" ? 1.2 : 2.2) * Math.random() * (0.6 + b.intensity * 0.4);
        data.pos.set([b.origin[0] + (Math.random() - 0.5) * 0.3, b.origin[1], b.origin[2] + (Math.random() - 0.5) * 0.3], i * 3);
        data.vel.set([Math.cos(a) * sp, up, Math.sin(a) * sp], i * 3);
        data.max[i] = data.life[i] = b.kind === "dust" ? 1.6 + Math.random() : 2.2 + Math.random() * 1.4;
        data.size[i] = b.kind === "confetti" ? 0.05 + Math.random() * 0.04 : b.kind === "dust" ? 0.1 + Math.random() * 0.12 : 0.035;
        data.spin[i] = Math.random() * 10;
        data.grav[i] = b.kind === "dust" ? 0.8 : b.kind === "xp" ? -0.4 : 7;
        m.setColorAt(i, palette[Math.floor(Math.random() * palette.length)]);
      }
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < POOL; i++) {
      if (data.life[i] <= 0) continue;
      data.life[i] -= dt;
      const k = i * 3;
      data.vel[k + 1] -= data.grav[i] * dt;
      data.vel[k] *= 0.995; data.vel[k + 2] *= 0.995;
      data.pos[k] += data.vel[k] * dt; data.pos[k + 1] += data.vel[k + 1] * dt; data.pos[k + 2] += data.vel[k + 2] * dt;
      if (data.pos[k + 1] < 0.02) { data.pos[k + 1] = 0.02; data.vel[k + 1] *= -0.25; data.vel[k] *= 0.6; data.vel[k + 2] *= 0.6; }
      const f = Math.max(data.life[i] / data.max[i], 0);
      dummy.position.set(data.pos[k], data.pos[k + 1], data.pos[k + 2]);
      dummy.rotation.set(data.spin[i] * (1 - f) * 3, data.spin[i] * (1 - f) * 2, 0);
      dummy.scale.setScalar(data.size[i] * Math.min(1, f * 3));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, POOL]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 0.25]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
