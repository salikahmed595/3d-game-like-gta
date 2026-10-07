"""One-line summary of a GLB/FBX: blender -b --factory-startup --python tools/blender/inspect_asset.py -- <file>"""
import bpy, sys, os
from mathutils import Vector
path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
(bpy.ops.import_scene.fbx if path.lower().endswith(".fbx") else bpy.ops.import_scene.gltf)(filepath=path)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
imgs = sorted((max(i.size) for i in bpy.data.images), reverse=True)
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
print("@@", os.path.basename(path), "| tris", tris, "| meshes", len(meshes), "| mats", len(bpy.data.materials),
      "| imgs", len(imgs), "max", imgs[:3], "| size", tuple(round(v, 1) for v in (mx - mn)), "| min", tuple(round(v, 1) for v in mn),
      "| actions", len(bpy.data.actions), "| bones", (len(arms[0].data.bones), [b.name for b in arms[0].data.bones][:14]) if arms else 0)
