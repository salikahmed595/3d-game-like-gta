// World streaming, GTA-style: only the districts around the player (and ahead of where they're driving) are in
// memory. Each map goes through load → prepare → warm before it may appear, all in the background:
//  - load:    the GLB is fetched and its Draco meshes decoded in worker threads;
//  - prepare: meshes are merged per material (hundreds of draw calls → a handful), one material per idle slice,
//             so no single frame does the whole job;
//  - warm:    shaders are compiled (in parallel where the GPU driver allows) and textures uploaded one per frame,
//             so the first frame the district is drawn doesn't stall.
// Maps nobody needs any more (well behind the player) are disposed, freeing GPU and RAM.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const DRACO_PATH = "/draco/";
export const mapUrl = (id: string) => `/models/world/${id}.glb`;

type State = "queued" | "loading" | "warming" | "ready" | "failed";
type Entry = { id: string; state: State; group: THREE.Group | null; users: number; wantedAt: number; priority: number };
const entries = new Map<string, Entry>();

let loader: GLTFLoader | null = null;
function gltfLoader(): GLTFLoader {
  if (!loader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_PATH);
    draco.setWorkerLimit(2); // leave cores for the game itself
    loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
  }
  return loader;
}

type IdleFn = (cb: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => number;
const ric: IdleFn = (typeof window !== "undefined" && (window as unknown as { requestIdleCallback?: IdleFn }).requestIdleCallback)
  || ((cb) => window.setTimeout(() => cb({ timeRemaining: () => 8 }), 16));
/** Resolves in a quiet moment between frames. */
const idle = () => new Promise<void>((r) => ric(() => r(), { timeout: 250 }));

/** Merge everything that shares a material into one mesh — one material per idle slice. */
async function prepare(scene: THREE.Object3D): Promise<THREE.Group> {
  scene.updateMatrixWorld(true);
  const groups = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[] }>();
  scene.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const g = m.geometry;
    const sig = Object.keys(g.attributes).sort().map((k) => `${k}${g.attributes[k].itemSize}`).join();
    const key = `${m.material.uuid}|${sig}|${g.index ? "i" : "n"}`;
    const e = groups.get(key) ?? { mat: m.material, meshes: [] };
    e.meshes.push(m);
    groups.set(key, e);
  });
  const out = new THREE.Group();
  for (const { mat, meshes } of groups.values()) {
    await idle();
    const geos = meshes.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld));
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (geos.length > 1) geos.forEach((g) => g.dispose());
    if (!geo) continue;
    // Façades and streets are seen at grazing angles: anisotropic filtering keeps them sharp (cheap on any GPU).
    const tex = (mat as THREE.MeshStandardMaterial).map;
    if (tex && tex.anisotropy < 4) { tex.anisotropy = 4; tex.needsUpdate = true; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false; // the sun's shadow camera only covers the office; city shadows would cost a lot
    mesh.matrixAutoUpdate = false; // static: no per-frame matrix work
    out.add(mesh);
  }
  meshesOf(scene).forEach((m) => m.geometry.dispose()); // the unmerged originals are no longer needed
  return out;
}

const meshesOf = (o: THREE.Object3D) => { const a: THREE.Mesh[] = []; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) a.push(c as THREE.Mesh); }); return a; };

/** Set by the renderer side (World): compiles shaders for a group and queues its textures for upload. */
export const warmer = {
  compile: null as ((g: THREE.Object3D) => Promise<unknown>) | null,
  textures: [] as THREE.Texture[],
};

function texturesOf(g: THREE.Object3D): THREE.Texture[] {
  const set = new Set<THREE.Texture>();
  for (const m of meshesOf(g)) {
    const mat = m.material as unknown as Record<string, unknown>;
    for (const v of Object.values(mat)) if (v instanceof THREE.Texture) set.add(v);
  }
  return [...set];
}

let busy = false;
/** One map at a time, nearest first: the network and the CPU are never flooded. */
async function pump(): Promise<void> {
  if (busy) return;
  const next = [...entries.values()].filter((e) => e.state === "queued").sort((a, b) => a.priority - b.priority)[0];
  if (!next) return;
  busy = true;
  next.state = "loading";
  try {
    const gltf = await gltfLoader().loadAsync(mapUrl(next.id));
    const group = await prepare(gltf.scene);
    next.state = "warming";
    const texs = texturesOf(group);
    warmer.textures.push(...texs);
    if (warmer.compile) await warmer.compile(group).catch(() => undefined);
    // Wait until this map's textures have gone up to the GPU (one per frame, see World).
    while (texs.some((t) => warmer.textures.includes(t))) await new Promise((r) => setTimeout(r, 50));
    next.group = group;
    next.state = "ready";
  } catch (err) {
    console.error("[world] map failed to stream", next.id, err instanceof Error ? err.message : err);
    next.state = "failed";
  } finally {
    busy = false;
    void pump();
  }
}

/**
 * Called a couple of times a second with the maps the player needs soon (lower priority = sooner). Queues the
 * ones not loaded yet and drops maps nobody has needed for a while.
 */
export function wantMaps(wanted: Map<string, number>): void {
  const now = performance.now();
  for (const [id, priority] of wanted) {
    const e = entries.get(id);
    if (!e) entries.set(id, { id, state: "queued", group: null, users: 0, wantedAt: now, priority });
    else { e.wantedAt = now; e.priority = priority; if (e.state === "failed") e.state = "queued"; }
  }
  for (const e of entries.values()) {
    if (e.users > 0 || wanted.has(e.id) || now - e.wantedAt < 20000) continue;
    if (e.state === "ready" && e.group) dispose(e.group);
    if (e.state === "ready" || e.state === "queued" || e.state === "failed") entries.delete(e.id);
  }
  void pump();
}

/** The prepared map, or null while it is still streaming in. */
export const mapGroup = (id: string): THREE.Group | null => { const e = entries.get(id); return e?.state === "ready" ? e.group : null; };
export const mapState = (id: string): State | "none" => entries.get(id)?.state ?? "none";

/** A district on screen holds its map (it is never disposed under it). */
export function holdMap(id: string, delta: 1 | -1): void { const e = entries.get(id); if (e) e.users = Math.max(0, e.users + delta); }

function dispose(g: THREE.Group) {
  const mats = new Set<THREE.Material>();
  for (const m of meshesOf(g)) { m.geometry.dispose(); mats.add(m.material as THREE.Material); }
  for (const mat of mats) {
    for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
    mat.dispose();
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as Record<string, unknown>).__stream = { entries, warmer };
