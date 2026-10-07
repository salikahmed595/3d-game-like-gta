// Loads a converted city map (Draco GLB) and its collision grid, and sets the playable bounds.
import { useEffect, useMemo, useState } from "react";
import { mapGroup, holdMap } from "./streaming.ts";
import { addGrid, removeGrid } from "./grid.ts";
import type { GridFile } from "./grid.ts";
import type { MapDef } from "./city.ts";

export { DRACO_PATH, mapUrl } from "./streaming.ts";

/** Fetches the grid and registers it at the district's place on the island; true once collisions are live. */
export function useMapGrid(map: MapDef, key: string = map.id): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/models/world/${map.id}.grid.json`)
      .then((r) => r.json() as Promise<GridFile>)
      .then((g) => {
        if (cancelled) return;
        addGrid(key, g, map.ox, map.oz);
        setReady(true);
      })
      .catch((err) => console.error("[world] collision grid failed to load", err instanceof Error ? err.message : err));
    return () => { cancelled = true; removeGrid(key); };
  }, [map, key]);
  return ready;
}

/** A district's buildings. Only mounted once streaming.ts has the map loaded, merged and warmed (never suspends). */
export function CityMap({ map }: { map: MapDef }) {
  const prepared = mapGroup(map.id);
  // Several districts share one map: each gets a light clone (geometry and materials are shared).
  const city = useMemo(() => prepared?.clone() ?? null, [prepared]);
  useEffect(() => { holdMap(map.id, 1); return () => holdMap(map.id, -1); }, [map.id]);
  if (!city) return null;
  const w = map.bounds.maxX - map.bounds.minX + 16;
  const d = map.bounds.maxZ - map.bounds.minZ + 16;
  return (
    <group position={[map.ox, 0, map.oz]}>
      <primitive object={city} />
      {/* District pavement: open lots have no floor in the source scene. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={map.ground} roughness={1} />
      </mesh>
    </group>
  );
}
