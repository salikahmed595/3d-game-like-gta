"""Summarise a character file: blender -b --factory-startup --python tools/blender/inspect_character.py -- <file.glb|fbx>"""
import bpy, sys, os
path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
if path.lower().endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=path)
else:
    bpy.ops.import_scene.gltf(filepath=path)
print("@@ FILE", os.path.basename(path))
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print("@@ meshes", len(meshes), "tris", tris, "materials", len(bpy.data.materials), "images", len(bpy.data.images))
for a in arms:
    names = [b.name for b in a.data.bones]
    print("@@ armature", a.name, "bones", len(names), names[:70])
for o in meshes:
    sk = o.data.shape_keys
    n = len(sk.key_blocks) if sk else 0
    print("@@ mesh", o.name, "verts", len(o.data.vertices), "shapekeys", n, ([k.name for k in sk.key_blocks][:12] if sk else ""))
print("@@ actions", [(a.name, round(a.frame_range[1] - a.frame_range[0])) for a in bpy.data.actions][:20])
import mathutils
mn = mathutils.Vector((1e9,) * 3); mx = -mn
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(c)
        mn = mathutils.Vector(map(min, mn, w)); mx = mathutils.Vector(map(max, mx, w))
print("@@ bbox size", tuple(round(v, 2) for v in (mx - mn)), "min", tuple(round(v, 2) for v in mn))
