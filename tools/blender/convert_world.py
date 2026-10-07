"""Converts the user's city / place / vehicle GLBs into game-ready assets.

Run:  blender -b --factory-startup --python tools/blender/convert_world.py -- <id> [<id> ...]   (no ids = all)

Maps  -> public/models/world/<id>.glb + <id>.grid.json
  - scaled to metres, centred, ground at y = 0, rotated as configured
  - meshes grouped into spatial tiles and merged per tile (draw calls ~ tiles x materials, culling still works)
  - optional decimation for very heavy scenes, textures <= 1024 px WebP
  - collision grid: a cell is blocked when geometry exists at body height (0.35..2.0 m) — robust no matter how
    the artist split the meshes. The game's walking, driving and NPC code all read this grid.
Vehicles -> public/models/vehicles/<id>.glb  (scaled to a real length, facing -Y = game +Z, origin centre-bottom)
"""
import bpy, bmesh, math, os, sys, json, base64
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT_WORLD = os.path.join(ROOT, "public", "models", "world")
OUT_CARS = os.path.join(ROOT, "public", "models", "vehicles")
HP = "houses and random places"

# Configured after looking at overview renders; scale = metres per source unit.
MAPS = {
    # Home map: a full miniature city (2,455 meshes) scaled to ~150 x 240 m.
    "downtown": dict(src="tools/assets_src/city/source/Untitled.glb", scale=10.0, tile=40, max_tris=130000),
    "towers": dict(src=f"{HP}/street_city_7_for_games_free.glb", scale=3.5, tile=40, max_tris=120000),
    "blocks": dict(src=f"{HP}/street_city_buildings_8.glb", scale=4.0, tile=40, max_tris=100000),
    "oldstreet": dict(src=f"{HP}/street.glb", scale=0.02, tile=30, max_tris=90000, drop=["Material3.001", "Material2.002"], drop_exact=["Material3"]),
    "postwar": dict(src=f"{HP}/postwar_city_-_exterior_scene.glb", scale=1.0, tile=40, max_tris=110000, drop=["Sphere_0"], tex=512),
    # Havana street kit (user, "new glb"): ~26 x 23 kit units; x3 gives ~10 m streets. Lines Empire Avenue.
    "havana": dict(src="new glb/modular_havana_street__low-poly_asset_kit.glb", scale=3.0, tile=30, max_tris=40000, tex=512),
    "wasteland": dict(src=f"{HP}/apocalyptic_city.glb", scale=0.05, tile=40, max_tris=40000, drop_exact=["Object_13"], tex=512),
}
VH = "vehicles"
# length = real-world metres; turn = extra Z rotation (deg) so the front faces -Y (= game +Z) after aligning
# the long axis with Y; drop = names (substring) of plates/discs/props to remove.
CARS = {
    "pack": dict(src=f"{VH}/generic_passenger_car_pack.glb", length=4.4, split=True, max_tris=12000),
    "future": dict(src=f"{VH}/future_car.glb", length=4.6, max_tris=14000, drop=["Plane.004"]),
    "concept": dict(src=f"{VH}/concept_car.glb", length=4.5, max_tris=14000),
    "rusty": dict(src=f"{VH}/old_rusty_car.glb", length=4.6, max_tris=20000, drop=["Plane001"]),
    "vintage": dict(src=f"{HP}/vintage_racing_car.glb", length=3.6, max_tris=14000),
    "classic": dict(src=f"{VH}/car_scene.glb", length=3.9, max_tris=12000, drop=["shadowplane", "lantern", "lamp"]),
}

CELL = 0.5          # collision grid resolution (m)
BODY = (0.35, 2.0)  # height band that blocks a walking person / a car


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


def load(src, drop=(), drop_exact=()):
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, src))
    # Drop non-geometry clutter and configured objects (sky domes, giant ground discs, shadow planes).
    for o in list(bpy.data.objects):
        if o.type in ("CAMERA", "LIGHT") or o.name in drop_exact or any(d in o.name for d in drop):
            bpy.data.objects.remove(o)
    for o in list(bpy.data.objects):
        # Empty meshes, and the icosphere the glTF importer creates as a bone display shape.
        if o.type == "MESH" and (len(o.data.polygons) == 0 or (o.name.startswith("Icosphere") and len(o.data.polygons) == 80)):
            bpy.data.objects.remove(o)


def bake_transforms(scale, rot_deg=0.0):
    """Realise every mesh in world space, then scale/rotate/centre so the ground sits at z = 0."""
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    # Make single-user data so transform_apply works on instanced meshes.
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in [o for o in bpy.data.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    m = Matrix.Rotation(math.radians(rot_deg), 4, "Z") @ Matrix.Scale(scale, 4)
    for o in meshes:
        o.matrix_world = m @ o.matrix_world
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in meshes:
        for v in o.data.vertices:
            mn = Vector(map(min, mn, v.co)); mx = Vector(map(max, mx, v.co))
    shift = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in meshes:
        o.data.transform(Matrix.Translation(-shift))
    return meshes, (mx - mn)


def ground_level(meshes):
    """Most common low height (roads/pavement), so kerbs and basements don't lift the whole map."""
    hist = {}
    for o in meshes:
        for p in o.data.polygons:
            if p.normal.z > 0.9:
                z = round(p.center.z, 1)
                hist[z] = hist.get(z, 0) + p.area
    low = sorted(hist.items(), key=lambda kv: -kv[1])
    return low[0][0] if low else 0.0


def collision_grid(meshes, size):
    w = int(math.ceil(size.x / CELL)) + 2
    h = int(math.ceil(size.y / CELL)) + 2
    x0 = -w * CELL / 2
    y0 = -h * CELL / 2
    grid = bytearray(w * h)
    for o in meshes:
        me = o.data
        me.calc_loop_triangles()
        co = [v.co for v in me.vertices]
        for t in me.loop_triangles:
            a, b, c = (co[i] for i in t.vertices)
            zmin, zmax = min(a.z, b.z, c.z), max(a.z, b.z, c.z)
            if zmax < BODY[0] or zmin > BODY[1]:
                continue
            # Nearly-flat triangles inside the band are kerbs / benches / car roofs: still blocking, keep them.
            i0 = int((min(a.x, b.x, c.x) - x0) / CELL); i1 = int((max(a.x, b.x, c.x) - x0) / CELL)
            j0 = int((min(a.y, b.y, c.y) - y0) / CELL); j1 = int((max(a.y, b.y, c.y) - y0) / CELL)
            if (i1 - i0) * (j1 - j0) > 400:  # huge slanted face (ramp/terrain): skip rather than block an area
                continue
            for j in range(max(j0, 0), min(j1, h - 1) + 1):
                row = j * w
                for i in range(max(i0, 0), min(i1, w - 1) + 1):
                    grid[row + i] = 1
    # Pack as bits, row-major; game converts Blender (x, y) to (x, -z).
    bits = bytearray((w * h + 7) // 8)
    for k, v in enumerate(grid):
        if v:
            bits[k >> 3] |= 1 << (k & 7)
    blocked = sum(grid)
    return {"cell": CELL, "w": w, "h": h, "x0": x0, "y0": y0, "bits": base64.b64encode(bytes(bits)).decode(), "blockedRatio": round(blocked / len(grid), 3)}


def tile_and_merge(meshes, tile):
    tiles = {}
    for o in meshes:
        c = sum((v.co for v in o.data.vertices), Vector()) / max(len(o.data.vertices), 1)
        zs = [v.co.z for v in o.data.vertices] or [0]
        flat = max(zs) - min(zs) < 0.4  # ground, roads, pavements: kept out of decimation (it smears their UVs)
        tiles.setdefault((int(c.x // tile), int(c.y // tile), flat), []).append(o)
    out = []
    for k, objs in tiles.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        objs[0].name = f"tile_{'flat_' if k[2] else ''}{k[0]}_{k[1]}"
        out.append(objs[0])
    return out


def decimate(meshes, max_tris):
    total = sum(len(o.data.polygons) for o in meshes)
    count = lambda objs: sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    tris = count(meshes)
    if tris <= max_tris:
        return tris
    flat = [o for o in meshes if "_flat_" in o.name]
    solid = [o for o in meshes if o not in flat]
    ratio = max(0.05, (max_tris - count(flat)) / max(count(solid), 1))
    if ratio >= 1:
        return tris
    for o in solid:
        d = o.modifiers.new("dec", "DECIMATE")
        d.ratio = ratio
        d.use_collapse_triangulate = True
    return tris


def shrink_textures(px=1024):
    for img in bpy.data.images:
        if img.size[0] > px or img.size[1] > px:
            s = px / max(img.size)
            img.scale(max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s)))
            # The exporter copies packed bytes verbatim when it can, so re-pack the scaled pixels.
            if img.packed_file:
                img.pack()


def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True,
                              export_animations=False, export_cameras=False, export_lights=False, export_skins=False,
                              export_image_format="AUTO", export_image_quality=80,
                              # Draco: ~5-8x smaller geometry; decoder is served from /draco/ (copied from three).
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)


def convert_map(mid, c):
    reset()
    load(c["src"], c.get("drop", ()), c.get("drop_exact", ()))
    meshes, size = bake_transforms(c["scale"], c.get("rot", 0))
    g = ground_level(meshes)
    if abs(g) > 0.01:
        for o in meshes:
            o.data.transform(Matrix.Translation((0, 0, -g)))
    grid = collision_grid(meshes, size)
    merged = tile_and_merge(meshes, c["tile"])
    tris = decimate(merged, c["max_tris"])
    shrink_textures(c.get("tex", 1024))
    path = os.path.join(OUT_WORLD, mid + ".glb")
    export(path)
    with open(os.path.join(OUT_WORLD, mid + ".grid.json"), "w") as f:
        json.dump(grid, f)
    print("@@ MAP", mid, "size", tuple(round(v, 1) for v in size), "ground", g, "tris", tris, "tiles", len(merged),
          "blocked", grid["blockedRatio"], round(os.path.getsize(path) / 1e6, 2), "MB")


def realise(meshes):
    """World-space, single-user, unparented meshes (so we can freely transform / join them)."""
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in [o for o in bpy.data.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def bbox(objs):
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in objs:
        for v in o.data.vertices:
            mn = Vector(map(min, mn, v.co)); mx = Vector(map(max, mx, v.co))
    return mn, mx


def footprint_ratio(objs):
    """Minor / major extent of the parts' footprint (≈0.45 for one car, ≈0.9 for two side by side)."""
    pts = [o.matrix_world @ v.co for o in objs for i, v in enumerate(o.data.vertices) if i % 7 == 0]
    mx_ = sum(p.x for p in pts) / len(pts); my_ = sum(p.y for p in pts) / len(pts)
    sxx = sum((p.x - mx_) ** 2 for p in pts); syy = sum((p.y - my_) ** 2 for p in pts); sxy = sum((p.x - mx_) * (p.y - my_) for p in pts)
    tr, det = sxx + syy, sxx * syy - sxy * sxy
    l1 = tr / 2 + math.sqrt(max(tr * tr / 4 - det, 0)); l2 = tr / 2 - math.sqrt(max(tr * tr / 4 - det, 0))
    return math.sqrt(max(l2, 0) / max(l1, 1e-9))


def split_two(objs):
    """2-means on part centres (seeded with the farthest pair)."""
    cs = {o.name: sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / max(len(o.data.vertices), 1) for o in objs}
    pa, pb = max(((p, q) for p in objs for q in objs), key=lambda t: (cs[t[0].name] - cs[t[1].name]).length)
    ca, cb = cs[pa.name].copy(), cs[pb.name].copy()
    for _ in range(8):
        A = [o for o in objs if (cs[o.name] - ca).length <= (cs[o.name] - cb).length]
        B = [o for o in objs if o not in A]
        if not A or not B:
            return None, None
        ca = sum((cs[o.name] for o in A), Vector()) / len(A); cb = sum((cs[o.name] for o in B), Vector()) / len(B)
    return A, B


def normalise_car(objs, length, turn):
    """Long axis along Y, front toward -Y (after `turn`), real length, origin at bottom centre."""
    # Principal axis of the footprint (cars in the pack sit at angles around a display disc).
    pts = [v.co for o in objs for v in o.data.vertices]
    mxy = sum((Vector((p.x, p.y)) for p in pts), Vector((0, 0))) / len(pts)
    sxx = sum((p.x - mxy.x) ** 2 for p in pts); syy = sum((p.y - mxy.y) ** 2 for p in pts)
    sxy = sum((p.x - mxy.x) * (p.y - mxy.y) for p in pts)
    angle = 0.5 * math.atan2(2 * sxy, sxx - syy)  # direction of the long axis
    rot = Matrix.Rotation(math.radians(90) - angle, 4, "Z")  # long axis -> +Y
    rot = Matrix.Rotation(math.radians(turn), 4, "Z") @ rot
    for o in objs:
        o.data.transform(rot)
    mn, mx = bbox(objs)
    s = length / max(mx.y - mn.y, 1e-6)
    t = Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)))
    for o in objs:
        o.data.transform(t)
    mn, mx = bbox(objs)
    return mx - mn


def export_car(name, objs, c):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    car = objs[0]
    car.name = name
    tris = sum(len(p.vertices) - 2 for p in car.data.polygons)
    if tris > c["max_tris"]:
        d = car.modifiers.new("dec", "DECIMATE"); d.ratio = c["max_tris"] / tris
    path = os.path.join(OUT_CARS, name + ".glb")
    os.makedirs(OUT_CARS, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True, use_selection=True,
                              export_animations=False, export_skins=False, export_cameras=False, export_lights=False,
                              export_image_format="AUTO", export_image_quality=80,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    return path, tris


def convert_car(cid, c):
    reset()
    load(c["src"], c.get("drop", ()), ())
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    realise(meshes)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if c.get("drop_flat") or c.get("split"):
        # Display plates / discs: very flat and wider than everything else.
        for o in list(meshes):
            mn, mx = bbox([o])
            if (mx.z - mn.z) < 0.02 * max(mx.x - mn.x, mx.y - mn.y) and len(o.data.polygons) < 2000:
                bpy.data.objects.remove(o)
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    shrink_textures(512)  # cars are seen at street distance
    groups = [meshes]
    if c.get("split"):
        # Cluster parts whose bounding boxes overlap (each car in the pack is a separate cluster).
        boxes = {o.name: bbox([o]) for o in meshes}
        groups = []
        for o in meshes:
            mn, mx = boxes[o.name]
            hit = [g for g in groups if any(boxes[p.name][0].x <= mx.x and boxes[p.name][1].x >= mn.x and
                                            boxes[p.name][0].y <= mx.y and boxes[p.name][1].y >= mn.y for p in g)]
            merged = [o] + [p for g in hit for p in g]
            groups = [g for g in groups if g not in hit] + [merged]
        groups = [g for g in groups if len(g) > 1 or len(g[0].data.polygons) > 200]
        # Two cars parked at an angle can have overlapping boxes and end up in one cluster. A single car's
        # footprint is long and thin; a squat one is two cars, so split it in two around its parts' centres.
        # The second car goes to the end of the list so existing names (pack_0..8) keep their meaning.
        extra = []
        for g in groups:
            if len(g) < 4 or footprint_ratio(g) < 0.58:
                continue
            a_, b_ = split_two(g)
            if a_ and b_:
                g[:] = a_
                extra.append(b_)
        groups += extra
    out = []
    for i, g in enumerate(groups):
        name = cid if len(groups) == 1 else f"{cid}_{i}"
        size = normalise_car(g, c["length"], c.get("turn", 0))
        # Export only this group: hide the others.
        for o in bpy.data.objects:
            o.hide_set(o not in g)
        path, tris = export_car(name, g, c)
        out.append((name, tuple(round(v, 2) for v in size), tris, round(os.path.getsize(path) / 1e6, 2)))
    for r in out:
        print("@@ CAR", r[0], "size(w,l,h)", r[1], "tris", r[2], r[3], "MB")


only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for mid, c in MAPS.items():
    if not only or mid in only:
        convert_map(mid, c)
for cid, c in CARS.items():
    if not only or cid in only:
        convert_car(cid, c)


