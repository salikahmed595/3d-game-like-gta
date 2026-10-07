"""Perspective overview render of any GLB: blender -b --factory-startup --python tools/blender/render_overview.py -- <in.glb> <out.png>"""
import bpy, math, sys
from mathutils import Vector
args = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=args[0])
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
ctr = (mn + mx) / 2
r = (mx - mn).length / 2
sc = bpy.context.scene
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 35
cam.data.clip_end = r * 20
d = r * 2.0
cam.location = ctr + Vector((d * 0.6, -d * 0.75, d * 0.65))
cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN")); sun.data.energy = 4; sun.rotation_euler = (0.8, 0.2, 0.6); sc.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.65, 0.75, 1)
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y = 560, 360
sc.render.filepath = args[1]
bpy.ops.render.render(write_still=True)
print("@@ rendered", args[1])
