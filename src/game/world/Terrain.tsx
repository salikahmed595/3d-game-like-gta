// The island itself: grass with large-scale colour variation, a beach and ocean at the edges, textured highways and
// roads with lane markings, and instanced roadside scenery (lamps, guard rails, forests, rocks, billboards).
// Everything is a handful of draw calls so the whole 10 km island can stay on screen at speed.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useGame } from "../state/store.ts";
import { formatMoney } from "../../../shared/engine.ts";
import { RAMPS, ROADS, SCENERY, WORLD_HALF } from "./layout.ts";
import { clock, daylight, isNight, sunHeight } from "./clock.ts";
import { gfx } from "../settings.ts";
import type { Prop, RoadPath } from "./layout.ts";

// ---------------------------------------------------------------- textures (canvas, no files)
function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function speckle(c: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], amp: number, n: number) {
  c.fillStyle = `rgb(${base.join(",")})`;
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const k = (Math.random() - 0.5) * amp;
    c.fillStyle = `rgb(${base.map((v) => Math.max(0, Math.min(255, v + k))).join(",")})`;
    c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

/** Asphalt with markings; u runs across the road (0..1), v along it (one texture = 24 m). */
function roadTexture(lanes: number): THREE.CanvasTexture {
  return canvasTexture(256, 512, (c) => {
    speckle(c, 256, 512, [52, 54, 58], 26, 9000);
    const line = (u: number, color: string, dashed: boolean, wpx = 4) => {
      c.fillStyle = color;
      if (!dashed) c.fillRect(u * 256 - wpx / 2, 0, wpx, 512);
      else for (let y = 0; y < 512; y += 128) c.fillRect(u * 256 - wpx / 2, y, wpx, 64);
    };
    line(0.035, "#e9e9e2", false);
    line(0.965, "#e9e9e2", false);
    if (lanes >= 2) {
      line(0.49, "#e8c33a", false, 3); line(0.51, "#e8c33a", false, 3);
      line(0.27, "#e9e9e2", true); line(0.73, "#e9e9e2", true);
    } else line(0.5, "#e8c33a", true);
  });
}

// ---------------------------------------------------------------- road ribbons (mitred polylines)
function ribbon(road: RoadPath): THREE.BufferGeometry {
  const pts = road.loop ? [...road.pts, road.pts[0], road.pts[1]] : road.pts;
  const half = road.width / 2;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let v = 0;
  const n = road.loop ? road.pts.length + 1 : pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[i - 1] ?? (road.loop ? road.pts[road.pts.length - 1] : null);
    const next = pts[i + 1] ?? null;
    let nx = 0, nz = 0;
    const addN = (a: [number, number], b: [number, number]) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      nx += -dz / l; nz += dx / l;
    };
    if (prev) addN(prev, p);
    if (next) addN(p, next);
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    // Mitre: widen at bends so the road keeps its width.
    let miter = 1;
    if (prev && next) {
      const dx = next[0] - p[0], dz = next[1] - p[1], l = Math.hypot(dx, dz) || 1;
      miter = 1 / Math.max(0.5, Math.abs(nx * (-dz / l) + nz * (dx / l)));
    }
    if (i > 0) v += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) / 24;
    pos.push(p[0] + nx * half * miter, road.y, p[1] + nz * half * miter, p[0] - nx * half * miter, road.y, p[1] - nz * half * miter);
    uv.push(0, v, 1, v);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } // wound to face up
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nAttr = g.getAttribute("normal");
  for (let i = 0; i < nAttr.count; i++) nAttr.setXYZ(i, 0, 1, 0);
  return g;
}

function Roads() {
  const parts = useMemo(() => {
    const hw = new THREE.MeshStandardMaterial({ map: roadTexture(2), roughness: 0.92, side: THREE.DoubleSide });
    const rd = new THREE.MeshStandardMaterial({ map: roadTexture(1), roughness: 0.92, side: THREE.DoubleSide });
    return ROADS.map((r) => ({ id: r.id, geo: ribbon(r), mat: r.kind === "highway" ? hw : rd }));
  }, []);
  return <group>{parts.map((p) => <mesh key={p.id} geometry={p.geo} material={p.mat} receiveShadow />)}</group>;
}

// ---------------------------------------------------------------- ground + ocean
function Ground() {
  const { geo, mat } = useMemo(() => {
    const size = WORLD_HALF * 2 + 600;
    const g = new THREE.PlaneGeometry(size, size, 120, 120);
    g.rotateX(-Math.PI / 2);
    // Large-scale tint: meadows, dry patches and a sandy beach ring at the coast.
    const p = g.getAttribute("position");
    const col = new Float32Array(p.count * 3);
    const grass = new THREE.Color("#8fb05e"), dry = new THREE.Color("#b8aa72"), sand = new THREE.Color("#d8c99a"), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const n = Math.sin(x * 0.0021) * Math.cos(z * 0.0017) + Math.sin((x + z) * 0.0009) * 0.6;
      c.copy(grass).lerp(dry, THREE.MathUtils.clamp(n * 0.5 + 0.35, 0, 1));
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge > WORLD_HALF + 60) c.copy(sand);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const tex = canvasTexture(256, 256, (cx) => speckle(cx, 256, 256, [236, 236, 236], 60, 14000));
    tex.repeat.set(size / 6, size / 6);
    const m = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 1 });
    return { geo: g, mat: m };
  }, []);
  return (
    <group>
      <mesh geometry={geo} material={mat} position-y={-0.06} receiveShadow />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.6}>
        <planeGeometry args={[60000, 60000]} />
        <meshStandardMaterial color="#2c6f8f" roughness={0.18} metalness={0.25} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- night lighting materials (driven by Atmosphere)
export const HORIZON = new THREE.MeshBasicMaterial({ color: "#9fb1bf", fog: false });
const HORIZON_DAY = new THREE.Color("#9fb1bf"), HORIZON_NIGHT = new THREE.Color("#141a26");
export const LAMP_HEAD = new THREE.MeshBasicMaterial({ color: "#d8d4c6", toneMapped: false });
export const LAMP_POOL = new THREE.MeshBasicMaterial({
  map: (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const c = cv.getContext("2d")!; const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,214,140,0.85)"); g.addColorStop(1, "rgba(255,214,140,0)");
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })(),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false,
});

// ---------------------------------------------------------------- instanced scenery (chunked + distance culled)
const CHUNK = 600; // metres; each chunk is one draw call per prop type, culled by frustum and by distance
const PROP_RANGE = 1100;

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, props: Prop[], y = 0): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, props.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  props.forEach((pr, i) => {
    q.setFromAxisAngle(up, pr.rot);
    s.setScalar(pr.s);
    p.set(pr.x, y, pr.z);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function chunked(geo: THREE.BufferGeometry, mat: THREE.Material, props: Prop[], y = 0): THREE.InstancedMesh[] {
  const cells = new Map<string, Prop[]>();
  for (const p of props) {
    const k = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
    const list = cells.get(k) ?? [];
    list.push(p);
    cells.set(k, list);
  }
  return [...cells.values()].map((list) => {
    const mesh = instanced(geo, mat, list, y);
    const [cx, cz] = [list[0].x, list[0].z].map((v) => (Math.floor(v / CHUNK) + 0.5) * CHUNK);
    mesh.userData.centre = new THREE.Vector2(cx, cz);
    return mesh;
  });
}

const tint = (g: THREE.BufferGeometry, hex: string) => {
  const c = new THREE.Color(hex);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g.index ? g.toNonIndexed() : g;
};

function Scenery() {
  const { camera } = useThree();
  const meshes = useMemo(() => {
    const vc = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // Lamp: pole + arm reaching over the road (+z) + glowing head.
    const lamp = mergeGeometries([
      tint(new THREE.CylinderGeometry(0.09, 0.13, 8, 5).translate(0, 4, 0), "#5b6068"),
      tint(new THREE.BoxGeometry(0.1, 0.1, 2.4).translate(0, 7.9, 1.15), "#5b6068"),
    ])!;
    // Lamp heads and their light pools on the ground switch on at night (Atmosphere drives the materials).
    const head = new THREE.BoxGeometry(0.42, 0.12, 0.7).translate(0, 7.8, 2.25);
    const pool = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2).translate(0, 0.09, 3);
    const tree = mergeGeometries([
      tint(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 5, 1, true).translate(0, 1.2, 0), "#5a4330"),
      tint(new THREE.ConeGeometry(2.2, 4.4, 6, 1, true).translate(0, 4.0, 0), "#2f5a2c"),
      tint(new THREE.ConeGeometry(1.5, 3.0, 6, 1, true).translate(0, 6.1, 0), "#3a6b33"),
    ])!;
    const rock = tint(new THREE.DodecahedronGeometry(1, 0).scale(1.2, 0.7, 1), "#8a8580");
    const rail = mergeGeometries([
      tint(new THREE.BoxGeometry(0.08, 0.32, 12.2).translate(0, 0.62, 0), "#b9bec4"),
      tint(new THREE.BoxGeometry(0.1, 0.7, 0.1).translate(0, 0.35, 0), "#80868d"),
    ])!;
    const rails: Prop[] = SCENERY.rails.map((r) => ({ x: r.x, z: r.z, rot: r.rot, s: 1 }));
    return [
      ...chunked(lamp, vc, SCENERY.lamps),
      ...chunked(head, LAMP_HEAD, SCENERY.lamps),
      ...chunked(pool, LAMP_POOL, SCENERY.lamps),
      ...chunked(tree, vc, SCENERY.trees),
      ...chunked(rock, vc, SCENERY.rocks, 0.2),
      ...chunked(rail, vc, rails),
    ];
  }, []);
  const tick = useRef(0);
  useFrame((_, dt) => {
    tick.current -= dt;
    if (tick.current > 0) return;
    tick.current = 0.25;
    for (const m of meshes) {
      const c = m.userData.centre as THREE.Vector2;
      m.visible = Math.hypot(c.x - camera.position.x, c.y - camera.position.z) < (gfx().viewDistance / 1500) * PROP_RANGE + CHUNK * 0.71;
    }
  });
  return <group>{meshes.map((m, i) => <primitive key={i} object={m} />)}</group>;
}

/** Highway billboards: the player's own empire, live (company, level, revenue) — the world advertises progress. */
function Billboards() {
  const shown = useGame((s) => s.shown);
  const brand = useGame((s) => s.config?.brand);
  const tex = useMemo(() => canvasTexture(1024, 512, () => undefined, false), []);
  useEffect(() => {
    const c = (tex.image as HTMLCanvasElement).getContext("2d")!;
    const g = c.createLinearGradient(0, 0, 1024, 512);
    g.addColorStop(0, "#141a2a"); g.addColorStop(1, brand?.primaryColor ?? "#f5b301");
    c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
    c.fillStyle = "#ffffff";
    c.font = "800 92px system-ui, sans-serif";
    c.fillText((brand?.companyName ?? "SALES EMPIRE").toUpperCase(), 48, 140);
    c.font = "600 50px system-ui, sans-serif";
    c.fillText("Every sale builds your empire", 48, 230);
    if (shown && brand) {
      c.font = "800 64px system-ui, sans-serif";
      c.fillText(`LEVEL ${shown.level} · ${shown.rank.toUpperCase()}`, 48, 350);
      c.font = "700 54px system-ui, sans-serif";
      c.fillText(`${formatMoney(shown.monthlyRevenue, brand)} this month`, 48, 440);
    }
    tex.needsUpdate = true;
  }, [tex, shown, brand]);
  return (
    <group>
      {SCENERY.signs.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation-y={s.rot}>
          <mesh position={[-3.5, 3.5, -0.2]}><boxGeometry args={[0.35, 7, 0.35]} /><meshStandardMaterial color="#555b63" /></mesh>
          <mesh position={[3.5, 3.5, -0.2]}><boxGeometry args={[0.35, 7, 0.35]} /><meshStandardMaterial color="#555b63" /></mesh>
          <mesh position={[0, 8.5, 0]}><boxGeometry args={[12.4, 6.4, 0.3]} /><meshStandardMaterial color="#20242c" /></mesh>
          <mesh position={[0, 8.5, 0.16]}><planeGeometry args={[12, 6]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** Stunt ramps: yellow/black chevron wedges on the highway shoulders. */
function Ramps() {
  const { geo, mat, side } = useMemo(() => {
    const tex = canvasTexture(128, 256, (c) => {
      c.fillStyle = "#f2c230"; c.fillRect(0, 0, 128, 256);
      c.fillStyle = "#16171b";
      for (let y = -128; y < 256; y += 64) { c.beginPath(); c.moveTo(0, y + 32); c.lineTo(64, y); c.lineTo(128, y + 32); c.lineTo(128, y + 56); c.lineTo(64, y + 24); c.lineTo(0, y + 56); c.closePath(); c.fill(); }
    });
    // Wedge: foot at z = 0, lip at z = len (height h), width w. Unit size, scaled per ramp.
    const g = new THREE.BufferGeometry();
    const v = [-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 1, 0.5, 1, 1, -0.5, 0, 1, 0.5, 0, 1];
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1], 2));
    g.setIndex([0, 2, 1, 1, 2, 3, 4, 5, 2, 5, 3, 2, 0, 4, 2, 1, 3, 5]);
    g.addGroup(0, 6, 0); // slope: chevrons
    g.addGroup(6, 12, 1); // back and sides
    g.computeVertexNormals();
    return { geo: g, mat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), side: new THREE.MeshStandardMaterial({ color: "#3a3d44", side: THREE.DoubleSide }) };
  }, []);
  return (
    <group>
      {RAMPS.map((r) => (
        <group key={r.id} position={[r.x, 0, r.z]} rotation-y={Math.atan2(r.dx, r.dz)}>
          <mesh geometry={geo} material={[mat, side]} scale={[r.width, r.height, r.len]} castShadow={false} />
        </group>
      ))}
    </group>
  );
}

/** Distant islands on the horizon, always hazy (they sit beyond the fog). */
function Horizon() {
  const mesh = useMemo(() => {
    const geo = new THREE.ConeGeometry(1, 1, 7);
    const mat = HORIZON;
    const props: Prop[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + Math.sin(i * 7.3) * 0.08;
      props.push({ x: Math.cos(a) * 11000, z: Math.sin(a) * 11000, rot: i, s: 1 });
    }
    const m = new THREE.InstancedMesh(geo, mat, props.length);
    const mx = new THREE.Matrix4();
    props.forEach((p, i) => {
      const h = 500 + ((i * 97) % 7) * 160;
      mx.compose(new THREE.Vector3(p.x, h / 2 - 40, p.z), new THREE.Quaternion(), new THREE.Vector3(1400 + ((i * 53) % 5) * 300, h, 1400));
      m.setMatrixAt(i, mx);
    });
    m.frustumCulled = false;
    return m;
  }, []);
  return <primitive object={mesh} />;
}

/** Day sky + long haze while roaming; the original dark, tight framing at the desk. */
const DAY_FOG = new THREE.Color("#c4d2de"), DUSK_FOG = new THREE.Color("#d39a74"), NIGHT_FOG = new THREE.Color("#0b111d");
const LAMP_OFF = new THREE.Color("#d8d4c6"), LAMP_ON = new THREE.Color("#ffd27a");

/** Sky, sun, moon and haze while roaming, following the in-game clock; the original dark framing at the desk. */
export function Atmosphere() {
  const explore = useGame((s) => s.explore);
  const { scene, camera, gl } = useThree();
  // Pixel ratio is owned by Scene's GraphicsApplier (Settings > Graphics, dynamic resolution).
  void gl;
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sky = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Points>(null);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.far = 16000;
    cam.updateProjectionMatrix();
  }, [camera]);
  useEffect(() => {
    if (explore) {
      scene.background = null;
      scene.fog = new THREE.Fog("#c4d2de", 160, 1500);
    } else {
      scene.background = new THREE.Color("#10131a");
      scene.fog = new THREE.Fog("#10131a", 18, 75);
    }
  }, [explore, scene]);
  useFrame(() => {
    if (!explore) return;
    const h = sunHeight(), day = daylight();
    // The sun arcs east → west; below the horizon the sky shader goes dark on its own.
    const ang = ((clock.minutes / 60 - 6) / 24) * Math.PI * 2;
    const sx = Math.cos(ang) * 0.8, sy = h, sz = -0.35;
    const u = (sky.current?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    u?.sunPosition.value.set(sx, sy, sz);
    // One directional light plays both parts (an extra light would cost every material on a weak GPU):
    // the sun by day, a dim blue moon from the opposite side at night.
    if (sun.current) {
      const up = Math.max(0, Math.min(1, h * 3));
      if (up > 0.02) { sun.current.position.set(sx * 800, Math.max(sy, 0.05) * 800, sz * 800); sun.current.intensity = 2.3 * up; sun.current.color.set("#fff1d8"); }
      else { sun.current.position.set(-sx * 800, 600, -sz * 800); sun.current.intensity = 0.45 * (1 - day); sun.current.color.set("#9fb4ff"); }
    }
    if (hemi.current) hemi.current.intensity = 0.32 + 0.58 * day;
    HORIZON.color.copy(HORIZON_NIGHT).lerp(HORIZON_DAY, day);
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      // Settings > View distance moves the haze.
      const far = gfx().viewDistance;
      fog.far = far; fog.near = far * 0.11;
      const dusk = Math.max(0, 1 - Math.abs(h) / 0.18) * (day > 0.05 ? 1 : 0.4);
      fog.color.copy(NIGHT_FOG).lerp(DAY_FOG, day).lerp(DUSK_FOG, dusk * 0.6);
    }
    LAMP_HEAD.color.copy(LAMP_OFF).lerp(LAMP_ON, isNight() ? 1 : 0);
    LAMP_POOL.opacity = isNight() && gfx().nightLights ? 0.75 * (1 - day) + 0.2 : 0;
    if (stars.current) stars.current.visible = day < 0.25;
  });
  if (!explore) return null;
  return (
    <>
      <Sky ref={sky as never} distance={14000} sunPosition={[0.6, 0.45, -0.4]} turbidity={6} rayleigh={1.4} mieCoefficient={0.004} mieDirectionalG={0.8} />
      <Stars ref={stars as never} radius={9000} depth={1500} count={2500} factor={180} fade speed={0} />
      <directionalLight ref={sun} position={[600, 450, -400]} intensity={2.3} color="#fff1d8" />
      <hemisphereLight ref={hemi} args={["#d6e9ff", "#7a7458", 0.9]} />
    </>
  );
}

export function Terrain() {
  return (
    <group>
      <Ground />
      <Roads />
      <Scenery />
      <Billboards />
      <Ramps />
      <Horizon />
    </group>
  );
}
