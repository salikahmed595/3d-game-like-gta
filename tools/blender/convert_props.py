"""Converts the user's weapon, blood, police and street-kit GLBs (folder "new glb") into small game-ready props.

Run:  blender -b --factory-startup --python tools/blender/convert_props.py -- [<id> ...]   (no ids = all)

Weapons -> public/models/weapons/<id>.glb : barrel along -Y (= game +Z), real length, origin at the grip,
           decimated to a few thousand triangles, textures <= 512 px.
Props   -> public/models/props/<id>.glb   : real size, ground at y = 0, centred.
"""
import bpy, math, os, sys
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = os.path.join(ROOT, "new glb")
OUT_W = os.path.join(ROOT, "public", "models", "weapons")
OUT_P = os.path.join(ROOT, "public", "models", "props")

# length: metres along the barrel. turn: degrees about Z after aligning the long axis with Y, so the muzzle
# points to -Y. grip: where the hand holds it, as a fraction of the length from the back (0) to the muzzle (1).
WEAPONS = {
    "pistol": dict(src="9_mm.glb", length=0.21, turn=180, grip=0.3, max_tris=3000, keep_largest=True, min_part=0.3),
    "smg": dict(src="tommy_gun.glb", length=0.86, turn=180, grip=0.38, max_tris=5000, min_part=0.05),
    "rifle": dict(src="gun_m4a1.glb", length=0.84, turn=180, grip=0.42, max_tris=3000),
    "carbine": dict(src="gun.glb", length=0.9, turn=0, grip=0.42, max_tris=6000),
    "sniper": dict(src="gun (1).glb", length=1.25, turn=180, grip=0.33, max_tris=6000),
    "plasma": dict(src="scifi_gun.glb", length=0.32, turn=0, grip=0.3, max_tris=4000),
    "incinerator": dict(src="gun_incineratorthermoelectricity_rifle.glb", length=1.0, turn=0, grip=0.45, max_tris=7000),
}
PROPS = {
    "blood_pool": dict(src="blood_decals_psx.glb", size=1.6, max_tris=100),
    "blood_splat": dict(src="small_blood_splatter.glb", size=0.8, max_tris=900, stand=True),
    "police_station": dict(src="southern_district_police_station.glb", size=None, scale=1.0, max_tris=90000, tex=1024),
    "cop_bike": dict(src="harley-davidson_police.glb", length=2.45, max_tris=16000, tex=512, vehicle=True),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


def realise():
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and len(o.data.polygons)]
    for o in [o for o in bpy.data.objects if o.type == "MESH" and not len(o.data.polygons)]:
        bpy.data.objects.remove(o)
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in [o for o in bpy.data.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return meshes


def bbox(objs):
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in objs:
        for v in o.data.vertices:
            mn = Vector(map(min, mn, v.co)); mx = Vector(map(max, mx, v.co))
    return mn, mx


def drop_flat_discs(meshes):
    """Display plates / ground discs: very flat and much wider than the rest."""
    out = []
    for o in meshes:
        mn, mx = bbox([o])
        flat = (mx.z - mn.z) < 0.01 * max(mx.x - mn.x, mx.y - mn.y)
        if flat and len(o.data.polygons) < 3000 and len(meshes) > 1:
            bpy.data.objects.remove(o)
        else:
            out.append(o)
    return out


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def decimate(o, max_tris):
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris > max_tris:
        d = o.modifiers.new("dec", "DECIMATE"); d.ratio = max_tris / tris; d.use_collapse_triangulate = True
    return tris


def shrink(px):
    for img in bpy.data.images:
        if img.size[0] > px or img.size[1] > px:
            s = px / max(img.size)
            img.scale(max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s)))
            if img.packed_file:
                img.pack()


def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True, export_apply=True,
                              export_animations=False, export_cameras=False, export_lights=False, export_skins=False,
                              export_image_format="AUTO", export_image_quality=80,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)


def principal_to_y(objs):
    """Rotate about Z so the longest horizontal axis runs along Y; also stand the longest overall axis level."""
    mn, mx = bbox(objs)
    ext = mx - mn
    # If the long axis is vertical (Z), lay it down along Y first.
    if ext.z > max(ext.x, ext.y):
        for o in objs:
            o.data.transform(Matrix.Rotation(math.radians(90), 4, "X"))
        mn, mx = bbox(objs); ext = mx - mn
    if ext.x > ext.y:
        for o in objs:
            o.data.transform(Matrix.Rotation(math.radians(90), 4, "Z"))


def convert_weapon(wid, c):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, c["src"]))
    meshes = drop_flat_discs(realise())
    if c.get("keep_largest"):
        # The pistol scene ships with loose bits far from the gun: keep the cluster around the largest part.
        big = max(meshes, key=lambda o: len(o.data.vertices))
        bmn, bmx = bbox([big]); ctr = (bmn + bmx) / 2; r = (bmx - bmn).length * 1.5
        for o in list(meshes):
            omn, omx = bbox([o])
            if ((omn + omx) / 2 - ctr).length > r:
                bpy.data.objects.remove(o); meshes.remove(o)
    if c.get("min_part"):
        # Drop tiny loose parts lying apart from the gun (a stray cartridge on the floor).
        mn, mx = bbox(meshes); size = (mx - mn).length
        for o in list(meshes):
            omn, omx = bbox([o])
            if (omx - omn).length < c["min_part"] * size and len(meshes) > 1:
                gun_mn, gun_mx = bbox([m for m in meshes if m is not o])
                ctr = (omn + omx) / 2
                inside = all(gun_mn[i] - 0.02 * size <= ctr[i] <= gun_mx[i] + 0.02 * size for i in range(3))
                if not inside:
                    bpy.data.objects.remove(o); meshes.remove(o)
    principal_to_y(meshes)
    for o in meshes:
        o.data.transform(Matrix.Rotation(math.radians(c["turn"]), 4, "Z"))
    mn, mx = bbox(meshes)
    s = c["length"] / max(mx.y - mn.y, 1e-6)
    # Origin at the grip: x centred, y at `grip` along the length from the back (+Y end) toward the muzzle (-Y).
    gy = mx.y - (mx.y - mn.y) * c["grip"]
    t = Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((mn.x + mx.x) / 2, gy, (mn.z + mx.z) / 2)))
    for o in meshes:
        o.data.transform(t)
    gun = join(meshes, wid)
    tris = decimate(gun, c["max_tris"])
    shrink(512)
    path = os.path.join(OUT_W, wid + ".glb")
    export(path)
    mn, mx = bbox([gun])
    print("@@ WEAPON", wid, "size", tuple(round(v, 3) for v in (mx - mn)), "tris", tris, round(os.path.getsize(path) / 1e6, 2), "MB")


def convert_prop(pid, c):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, c["src"]))
    meshes = realise()
    if c.get("stand"):  # authored standing up (a wall splat): lay it flat on the ground
        for o in meshes:
            o.data.transform(Matrix.Rotation(math.radians(90), 4, "X"))
    if c.get("vehicle"):
        meshes = drop_flat_discs(meshes)
        principal_to_y(meshes)
        mn, mx = bbox(meshes)
        s = c["length"] / max(mx.y - mn.y, 1e-6)
    elif c.get("size"):
        mn, mx = bbox(meshes)
        s = c["size"] / max(mx.x - mn.x, mx.y - mn.y, 1e-6)
    else:
        s = c.get("scale", 1.0)
    mn, mx = bbox(meshes)
    t = Matrix.Scale(s, 4) @ Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)))
    for o in meshes:
        o.data.transform(t)
    mn, mx = bbox(meshes)
    obj = join(meshes, pid)
    tris = decimate(obj, c["max_tris"])
    shrink(c.get("tex", 256))
    path = os.path.join(OUT_P, pid + ".glb")
    export(path)
    print("@@ PROP", pid, "size", tuple(round(v, 2) for v in (mx - mn)), "tris", tris, round(os.path.getsize(path) / 1e6, 2), "MB")


only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for wid, c in WEAPONS.items():
    if not only or wid in only:
        convert_weapon(wid, c)
for pid, c in PROPS.items():
    if not only or pid in only:
        convert_prop(pid, c)


