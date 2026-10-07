// Feedback for the player's car: tyre smoke when drifting / burning out, dust when off-road at speed, and glowing
// brake / reverse lights. A small pool of sprites, so it costs a handful of draw calls at most.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { drivenCar } from "../systems/drive.ts";
import { keys } from "../systems/explore.ts";
import { time } from "../systems/time.ts";

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

type Puff = { sprite: THREE.Sprite; life: number; max: number; vx: number; vz: number; grow: number };
const POOL = 36;

export function CarFx() {
  const smokeTex = useMemo(() => glowTexture("rgba(235,235,235,0.9)", "rgba(235,235,235,0)"), []);
  const dustTex = useMemo(() => glowTexture("rgba(170,140,95,0.85)", "rgba(170,140,95,0)"), []);
  const lightTex = useMemo(() => glowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)"), []);
  const puffs = useMemo<Puff[]>(() => Array.from({ length: POOL }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    sprite.visible = false;
    return { sprite, life: 0, max: 1, vx: 0, vz: 0, grow: 1 };
  }), [smokeTex]);
  const lights = useMemo(() => [0, 1].map(() => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: lightTex, color: "#ff2a2a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    s.scale.setScalar(0.7);
    return s;
  }), [lightTex]);
  const next = useRef(0);
  const emit = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05) * time.world;
    const car = drivenCar();
    // Brake (red) / reverse (white) lights on the rear corners.
    const braking = !!car && ((keys.has("s") || keys.has("arrowdown")) && car.speed > 0.5 || keys.has(" "));
    const reversing = !!car && car.speed < -0.5;
    lights.forEach((l, i) => {
      l.visible = !!car && (braking || reversing);
      if (!car || !l.visible) return;
      const side = i === 0 ? 1 : -1;
      const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
      const f = -car.length / 2 + 0.05, lat = side * (car.width / 2 - 0.3);
      l.position.set(car.x + s * f + c * lat, 0.85, car.z + c * f - s * lat);
      (l.material as THREE.SpriteMaterial).color.set(reversing ? "#ffffff" : "#ff2020");
    });

    if (car) {
      const v = Math.abs(car.speed);
      const burnout = (keys.has("w") || keys.has("arrowup")) && v < 6 && car.accel > 6;
      const drift = car.slip > 4.5 && v > 6;
      const dust = car.offroad && v > 8;
      const rate = drift ? 40 : burnout ? 25 : dust ? 30 * Math.min(v / 30, 1) : 0;
      emit.current += rate * dt;
      while (emit.current >= 1) {
        emit.current -= 1;
        const p = puffs[next.current++ % POOL];
        const side = Math.random() < 0.5 ? 1 : -1;
        const s = Math.sin(car.yaw), c = Math.cos(car.yaw);
        const f = -car.length / 2 + 0.6, lat = side * (car.width / 2 - 0.2);
        p.sprite.position.set(car.x + s * f + c * lat, 0.35, car.z + c * f - s * lat);
        p.life = 0; p.max = dust ? 1.6 : 1.2; p.grow = dust ? 4 : 3;
        p.vx = -car.vx * 0.08 + (Math.random() - 0.5); p.vz = -car.vz * 0.08 + (Math.random() - 0.5);
        (p.sprite.material as THREE.SpriteMaterial).map = dust ? dustTex : smokeTex;
        p.sprite.visible = true;
      }
    }
    for (const p of puffs) {
      if (!p.sprite.visible) continue;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { p.sprite.visible = false; continue; }
      p.sprite.position.x += p.vx * dt; p.sprite.position.z += p.vz * dt; p.sprite.position.y += 0.5 * dt;
      p.sprite.scale.setScalar(0.8 + k * p.grow);
      (p.sprite.material as THREE.SpriteMaterial).opacity = (1 - k) * 0.55;
    }
  });

  return (
    <group>
      {puffs.map((p, i) => <primitive key={i} object={p.sprite} />)}
      {lights.map((l, i) => <primitive key={`l${i}`} object={l} />)}
    </group>
  );
}
