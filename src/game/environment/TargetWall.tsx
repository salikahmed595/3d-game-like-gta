import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../state/store.ts";
import { makeTextTexture } from "./textures.ts";
import { formatMoney } from "../../../shared/engine.ts";
import { interact } from "../systems/explore.ts";

const COLS = 8, ROWS = 10;
const W = 2.4, H = 2.2;
const BRICK_W = W / COLS, BRICK_H = H / ROWS;
const WALL_POS = new THREE.Vector3(-0.2, 0, -2.05);
const RUBBLE_FADE_AFTER = 6;

type Brick = { home: THREE.Vector3; p: THREE.Vector3; v: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; shade: number };

// The monthly-target wall: glows as the target nears (goal gradient), shatters when the boss falls.
export function TargetWall() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const brickMat = useRef<THREE.MeshStandardMaterial>(null);
  const broken = useGame((s) => s.wallBroken);
  const config = useGame((s) => s.config);
  const sim = useRef({ active: false, t: 0, wasBroken: broken });
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const bricks = useMemo<Brick[]>(() => {
    const out: Brick[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const offset = r % 2 ? BRICK_W / 2 : 0;
        const home = new THREE.Vector3(-W / 2 + BRICK_W / 2 + c * BRICK_W + offset - (r % 2 ? BRICK_W / 2 : 0), BRICK_H / 2 + r * BRICK_H, 0);
        out.push({ home, p: home.clone(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), shade: 0.85 + ((r * 7 + c * 13) % 10) / 40 });
      }
    }
    return out;
  }, []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    bricks.forEach((b, i) => m.setColorAt(i, new THREE.Color("#a5513a").multiplyScalar(b.shade)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [bricks]);

  useEffect(() => {
    if (broken && !sim.current.wasBroken) {
      // Punch point near the middle of the wall; debris flies outward from it.
      const hit = new THREE.Vector3(0.3, 1.2, 0.2);
      for (const b of bricks) {
        const dir = b.home.clone().sub(hit); dir.z = 0;
        const len = Math.max(dir.length(), 0.2);
        b.v.set((dir.x / len) * (1.2 + Math.random()), 1.5 + Math.random() * 2 - dir.y * 0.3, 0.8 + Math.random() * 2.2);
        b.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      }
      sim.current.active = true;
      sim.current.t = 0;
    }
    if (!broken) {
      // New month / reset: rebuild the wall.
      bricks.forEach((b) => { b.p.copy(b.home); b.rot.set(0, 0, 0); b.v.set(0, 0, 0); });
      sim.current.active = false;
      sim.current.t = 0;
    }
    sim.current.wasBroken = broken;
  }, [broken, bricks]);

  const label = useMemo(() => makeTextTexture([{ text: "MONTHLY TARGET", size: 64, color: "#ffd9a0", weight: 700 }, { text: config ? formatMoney(config.monthlyTarget, config.brand) : "", size: 120, color: "#ffffff" }], 1024, 256, "#1b1410"), [config]);

  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    const g = useGame.getState();
    const s = sim.current;

    // Goal gradient: 70% normal, 85% subtle glow, 95% strong, 100% cinematic.
    const ratio = g.shown && g.shown.monthlyTarget > 0 ? g.shown.monthlyRevenue / g.shown.monthlyTarget : 0;
    const glow = broken ? 0 : ratio < 0.7 ? 0 : ratio < 0.85 ? 0.06 : ratio < 0.95 ? 0.16 : 0.3;
    const flicker = glow > 0 ? 0.85 + Math.sin(performance.now() / 260) * 0.15 : 0;
    if (brickMat.current) brickMat.current.emissiveIntensity = glow * flicker;
    if (light.current) light.current.intensity = glow * 6 * flicker;

    if (s.active) {
      s.t += dt;
      for (const b of bricks) {
        b.v.y -= 9.8 * dt;
        b.p.addScaledVector(b.v, dt);
        if (b.p.y < BRICK_H / 2) { // floor bounce with damping
          b.p.y = BRICK_H / 2;
          b.v.y *= -0.3; b.v.x *= 0.7; b.v.z *= 0.7; b.spin.multiplyScalar(0.6);
        }
        if (b.p.z + WALL_POS.z < -2.35) { b.p.z = -2.35 - WALL_POS.z; b.v.z *= -0.2; }
        b.rot.x += b.spin.x * dt; b.rot.y += b.spin.y * dt; b.rot.z += b.spin.z * dt;
      }
      if (s.t > RUBBLE_FADE_AFTER + 1.5) s.active = false;
    }
    const fade = broken ? Math.max(0, 1 - (s.t - RUBBLE_FADE_AFTER) / 1.5) : 1;
    bricks.forEach((b, i) => {
      dummy.position.copy(b.p);
      dummy.rotation.copy(b.rot);
      dummy.scale.setScalar(broken ? Math.min(1, fade) : 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  const showSign = !broken;
  return (
    <group position={WALL_POS}>
      <instancedMesh ref={mesh} args={[undefined, undefined, bricks.length]} castShadow receiveShadow frustumCulled={false}
        onClick={(e) => { if (broken || e.delta > 6) return; e.stopPropagation(); interact("target"); }}
        onPointerOver={() => { if (!broken) document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}>
        <boxGeometry args={[BRICK_W * 0.96, BRICK_H * 0.92, 0.22]} />
        <meshStandardMaterial ref={brickMat} color="#ffffff" roughness={0.9} emissive="#ff7a1a" emissiveIntensity={0} />
      </instancedMesh>
      <pointLight ref={light} position={[0, 1.2, -0.4]} color="#ff8a2a" distance={5} intensity={0} />
      {showSign && (
        <mesh position={[0, H + 0.3, 0.05]}>
          <planeGeometry args={[1.6, 0.4]} />
          <meshBasicMaterial map={label} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
