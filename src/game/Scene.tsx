import { Component, Suspense, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { dynRes, useGraphics } from "./settings.ts";
import * as THREE from "three";
import { useGame } from "./state/store.ts";
import { player } from "./systems/explore.ts";
import { Avatar, useAvatarCharacter } from "./character/Avatar.tsx";
import { Office } from "./environment/Office.tsx";
import { TargetWall } from "./environment/TargetWall.tsx";
import { Particles } from "./effects/Particles.tsx";
import { CameraRig, DEFAULT_CAMERA_POSITION } from "./camera/CameraRig.tsx";
import { PropKitProvider } from "./environment/props.tsx";
import { World } from "./world/World.tsx";
import { Atmosphere } from "./world/Terrain.tsx";
import { ExploreController } from "./systems/ExploreController.tsx";
import { PlayerGun } from "./world/Combat.tsx";

function StandIn() {
  return (
    <group position={[0, 0.75, 0]}>
      <mesh castShadow><capsuleGeometry args={[0.2, 0.7, 6, 12]} /><meshStandardMaterial color="#4f7cff" /></mesh>
      <mesh position={[0, 0.7, 0]} castShadow><sphereGeometry args={[0.17, 16, 16]} /><meshStandardMaterial color="#e8c3a0" /></mesh>
    </group>
  );
}

// Asset failure must never crash the app: fall back to a simple stand-in avatar.
class AssetBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error("[assets] avatar failed to load", err instanceof Error ? err.message : err); }
  render() { return this.state.failed ? <StandIn /> : this.props.children; }
}

/** Remounts cleanly when the player picks another character; the stand-in covers the download. */
function PlayerAvatar() {
  const def = useAvatarCharacter();
  return (
    <AssetBoundary key={def.id}>
      <Suspense fallback={<StandIn />}><Avatar characterId={def.id} /></Suspense>
    </AssetBoundary>
  );
}

/** The office (and its wall) only needs drawing when the player is anywhere near it. */
function NearOffice({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const hidden = useRef<THREE.Object3D[] | null>(null);
  useFrame(({ gl }) => {
    const g = useGame.getState();
    const d = Math.hypot(player.pos.x, player.pos.z);
    const show = !g.explore || d < 350;
    // Hide the office's meshes, never its lights: if the number of lights in the scene changes, three.js
    // recompiles every material in the city — a long freeze each time you walk away from (or back to) the office.
    if (ref.current && show === !!hidden.current) {
      if (!show) {
        const list: THREE.Object3D[] = [];
        ref.current.traverse((o) => { if (o.visible && ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints)) list.push(o); });
        list.forEach((o) => { o.visible = false; });
        hidden.current = list;
      } else {
        hidden.current?.forEach((o) => { o.visible = true; });
        hidden.current = null;
      }
    }
    // The sun's shadow map only covers the office: stop re-rendering it while the player is out in the city.
    gl.shadowMap.autoUpdate = !g.explore || d < 30;
  });
  return <group ref={ref}>{children}</group>;
}

/** Applies Settings > Graphics: render resolution (with dynamic resolution that backs off when the frame rate
 *  drops), and measures FPS for the meter. */
function GraphicsApplier() {
  const setDpr = useThree((s) => s.setDpr);
  const explore = useGame((s) => s.explore);
  const resolution = useGraphics((s) => s.resolution);
  const dynamic = useGraphics((s) => s.dynamicRes);
  const acc = useRef({ frames: 0, t: 0, applied: 0 });
  const apply = () => {
    // Resolution is a fraction of the screen's real pixels (Windows display scaling included, capped at 1.5x):
    // rendering at 1 CSS pixel on a 125% screen is what made the city look soft.
    const base = Math.min(window.devicePixelRatio || 1, explore ? 1.5 : 1.75);
    // The office shot is the product's showcase and cheap to draw: never render it below native resolution.
    const dpr = explore ? Math.max(0.5, base * resolution * (dynamic ? dynRes.scale : 1)) : Math.min(2, base * Math.max(1, resolution));
    if (Math.abs(dpr - acc.current.applied) > 0.01) { acc.current.applied = dpr; setDpr(dpr); }
  };
  useEffect(apply, [explore, resolution, dynamic]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames++; a.t += dt;
    if (a.t < 1.5) return;
    dynRes.fps = a.frames / a.t;
    a.frames = 0; a.t = 0;
    if (!dynamic || !explore || document.hidden) { if (dynRes.scale !== 1 && !dynamic) { dynRes.scale = 1; apply(); } return; }
    // Hold ~30+ FPS: step the resolution down quickly when slow, creep back up when there is headroom.
    // Floor at 65%: below that the picture turns to mush (cheaper settings are the better fix then).
    if (dynRes.fps < 27 && dynRes.scale > 0.65) dynRes.scale = Math.max(0.65, dynRes.scale - 0.08);
    else if (dynRes.fps > 50 && dynRes.scale < 1) dynRes.scale = Math.min(1, dynRes.scale + 0.05);
    apply();
  });
  return null;
}

export function Scene() {
  const antialias = useGraphics((s) => s.antialias);
  const shadows = useGraphics((s) => s.shadows);
  return (
    // AA and shadows are fixed when WebGL starts: changing them restarts the 3D view (game state lives outside it).
    <Canvas key={`${antialias}-${shadows}`} shadows={shadows} dpr={1} camera={{ position: DEFAULT_CAMERA_POSITION, fov: 42, near: 0.1, far: 16000 }}
      gl={{ antialias, powerPreference: "high-performance", reversedDepthBuffer: true }}>
      <GraphicsApplier />
      <color attach="background" args={["#10131a"]} />
      <fog attach="fog" args={["#10131a", 18, 75]} />
      <Atmosphere />
      <Suspense fallback={null}>
        <NearOffice><Office /><TargetWall /></NearOffice>
        <PropKitProvider><World /></PropKitProvider>
        <PlayerAvatar />
        <PlayerGun />
        <Particles />
      </Suspense>
      <ExploreController />
      <CameraRig />
    </Canvas>
  );
}
