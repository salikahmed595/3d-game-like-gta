// Office prop kit modelled in Blender (tools/blender/build_office_props.py → public/models/props/office_props.glb).
// Components ask for a prop by node name; while the kit loads, or if it fails, they get null and keep their
// primitive stand-ins, so a missing asset never blanks the office (rules §61).
import { Component, Suspense, createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export const PROPS_URL = "/models/props/office_props.glb";

type PropKit = { make: (name: string) => THREE.Object3D | null };
const KitContext = createContext<PropKit | null>(null);

function KitLoader({ children }: { children: ReactNode }) {
  const { scene } = useGLTF(PROPS_URL);
  const kit = useMemo<PropKit>(() => ({
    make(name) {
      const src = scene.getObjectByName(name);
      if (!src) return null;
      const o = src.clone(true);
      o.position.set(0, 0, 0); // roots are spread out in the .blend for inspection
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });
      return o;
    },
  }), [scene]);
  return <KitContext.Provider value={kit}>{children}</KitContext.Provider>;
}

class KitBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error("[assets] office props failed to load", err instanceof Error ? err.message : err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PropKitProvider({ children }: { children: ReactNode }) {
  return (
    <KitBoundary fallback={children}>
      <Suspense fallback={children}>
        <KitLoader>{children}</KitLoader>
      </Suspense>
    </KitBoundary>
  );
}

/** A fresh clone of the named prop, or null while unavailable (render the primitive fallback). */
export function useProp(name: string): THREE.Object3D | null {
  const kit = useContext(KitContext);
  return useMemo(() => kit?.make(name) ?? null, [kit, name]);
}

/** The whole kit, for components that need many clones (traffic, crowds); null while unavailable. */
export function usePropKit(): PropKit | null {
  return useContext(KitContext);
}

/** Give meshes using `materialName` their own material copy and adjust it (e.g. trophy rarity, screen glow).
 *  One copy is shared by all matching meshes inside `obj`, so a recoloured person/car stays consistent. */
export function tint(obj: THREE.Object3D | null, materialName: string, apply: (m: THREE.MeshStandardMaterial) => void) {
  let copy: THREE.MeshStandardMaterial | null = null;
  const swap = (m: THREE.Material) => {
    if (m.name !== materialName) return m;
    if (!copy) { copy = (m as THREE.MeshStandardMaterial).clone(); apply(copy); }
    return copy;
  };
  obj?.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

useGLTF.preload(PROPS_URL);
