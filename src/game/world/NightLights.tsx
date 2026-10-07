// Night driving: a real headlight beam on the player's car, plus glowing head / tail lights on every car around
// (traffic and police read from the shared traffic boxes). Off in daylight.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { drivenCar, trafficBoxes } from "../systems/drive.ts";
import { player } from "../systems/explore.ts";
import { isNight } from "./clock.ts";
import { useGraphics } from "../settings.ts";

const PAIRS = 40;

function glow(): THREE.CanvasTexture {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const c = cv.getContext("2d")!; const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,0.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export function NightLights() {
  const beam = useGraphics((s) => s.nightLights);
  const spot = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const tex = useMemo(glow, []);
  const sprites = useMemo(() => Array.from({ length: PAIRS * 4 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: i % 4 < 2 ? "#fff4d6" : "#ff2a2a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    s.visible = false;
    return s;
  }), [tex]);

  useFrame(() => {
    const night = isNight();
    const car = drivenCar();
    if (spot.current) {
      // Always in the scene (switching a light on/off recompiles every material); dark by day.
      spot.current.intensity = night && car ? 90 : 0;
      if (car && night) {
        const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
        spot.current.position.set(car.x + fx * car.length * 0.5, car.y + 0.9, car.z + fz * car.length * 0.5);
        target.position.set(car.x + fx * 30, car.y, car.z + fz * 30);
        target.updateMatrixWorld();
      }
    }
    let n = 0;
    const put = (x: number, z: number, yaw: number, hl: number, hw: number, y = 0, own = false) => {
      if (n >= PAIRS) return;
      const s = Math.sin(yaw), c = Math.cos(yaw);
      // Small, bright points: big halos read as fog at close range. Your own car's beam is the spotlight.
      [[hl, hw * 0.7, 0.75, own ? 0 : 0.55], [hl, -hw * 0.7, 0.75, own ? 0 : 0.55], [-hl, hw * 0.7, 0.85, 0.32], [-hl, -hw * 0.7, 0.85, 0.32]].forEach(([f, l, h, size], k) => {
        const sp = sprites[n * 4 + k];
        sp.visible = size > 0;
        sp.position.set(x + s * f + c * l, y + h, z + c * f - s * l);
        sp.scale.setScalar(size);
      });
      n++;
    };
    if (night) {
      if (car) put(car.x, car.z, car.yaw, car.length / 2, car.width / 2, car.y, true);
      for (const b of trafficBoxes.values()) {
        if (Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < 300) put(b.x, b.z, b.yaw, b.hl, b.hw);
      }
    }
    for (let i = n * 4; i < sprites.length; i++) sprites[i].visible = false;
  });

  return (
    <group>
      {/* Low-end PCs (Settings > Night lighting off) skip the beam entirely: every light costs every material. */}
      {beam && <spotLight ref={spot} color="#fff1d0" intensity={90} distance={80} angle={0.5} penumbra={0.5} decay={1} target={target} />}
      <primitive object={target} />
      {sprites.map((s, i) => <primitive key={i} object={s} />)}
    </group>
  );
}
