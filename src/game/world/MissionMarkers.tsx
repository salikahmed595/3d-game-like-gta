// In-world mission markers: yellow start circles, the active checkpoint (a ring on the ground plus a tall beam you
// can see from kilometres away), a red marker over a fight target, and a purple beam for the map waypoint.
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MISSIONS, currentObjective, gpsTarget, registerMissionStarts, stepMissions, tidyMissionCar, useMissions } from "../systems/missions.ts";
import { people } from "../systems/people.ts";
import { player } from "../systems/explore.ts";
import { pause } from "../systems/time.ts";

const glow = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: false });

function StartMarker({ x, z }: { x: number; z: number }) {
  const icon = useRef<THREE.Mesh>(null);
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (icon.current) { icon.current.rotation.y = clock.elapsedTime * 1.6; icon.current.position.y = 2.3 + Math.sin(clock.elapsedTime * 2) * 0.15; }
    if (root.current) root.current.visible = !useMissions.getState().run && Math.hypot(player.pos.x - x, player.pos.z - z) < 1800;
  });
  return (
    <group ref={root} position={[x, 0, z]}>
      <mesh position-y={1.2} material={glow("#ffc93c", 0.22)}><cylinderGeometry args={[1.6, 1.6, 2.4, 32, 1, true]} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.08} material={glow("#ffc93c", 0.55)}><ringGeometry args={[1.35, 1.6, 40]} /></mesh>
      <mesh ref={icon} material={glow("#ffd75e", 0.95)}><octahedronGeometry args={[0.35, 0]} /></mesh>
      {/* A tall faint beam so the marker can be spotted from the road. */}
      <mesh position-y={40} material={glow("#ffc93c", 0.12)}><cylinderGeometry args={[0.35, 0.35, 80, 8, 1, true]} /></mesh>
    </group>
  );
}

function Checkpoint() {
  const root = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const rival = useRef<THREE.Mesh>(null);
  const way = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    if (!pause.on) stepMissions(Math.min(dt, 0.05)); // the pause menu stops the mission clock
    const o = currentObjective();
    const g = root.current, r = ring.current, b = beam.current, rv = rival.current, w = way.current;
    if (!g || !r || !b || !rv || !w) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.04;
    g.visible = o?.kind === "goto";
    if (o?.kind === "goto") {
      g.position.set(o.at.x, 0, o.at.z);
      r.scale.set(o.r * pulse, o.r * pulse, 1);
      b.scale.set(Math.max(1, o.r / 6), 1, Math.max(1, o.r / 6));
    }
    rv.visible = o?.kind === "ko";
    if (o?.kind === "ko") {
      const p = people.get(o.personId);
      if (p) { rv.position.set(p.x, 2.6 + Math.sin(clock.elapsedTime * 3) * 0.12 + p.y, p.z); rv.rotation.y += dt * 2; }
    }
    const t = !useMissions.getState().run ? gpsTarget() : null;
    w.visible = !!t;
    if (t) w.position.set(t.x, 0, t.z);
  });
  return (
    <>
      <group ref={root}>
        <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.12} material={glow("#ffd23f", 0.6)}><ringGeometry args={[0.86, 1, 64]} /></mesh>
        <mesh ref={beam} position-y={150} material={glow("#ffd23f", 0.22)}><cylinderGeometry args={[3, 3, 300, 16, 1, true]} /></mesh>
      </group>
      <mesh ref={rival} material={glow("#ff3b3b", 0.95)} rotation-x={Math.PI}><coneGeometry args={[0.25, 0.5, 4]} /></mesh>
      <group ref={way}>
        <mesh position-y={150} material={glow("#b46cff", 0.25)}><cylinderGeometry args={[2.5, 2.5, 300, 12, 1, true]} /></mesh>
      </group>
    </>
  );
}

export function MissionMarkers() {
  useEffect(() => registerMissionStarts(), []);
  useEffect(() => { const id = setInterval(tidyMissionCar, 5000); return () => clearInterval(id); }, []);
  return (
    <group>
      {MISSIONS.map((m) => <StartMarker key={m.id} x={m.start.x} z={m.start.z} />)}
      <Checkpoint />
    </group>
  );
}
