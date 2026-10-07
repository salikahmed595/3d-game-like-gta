"""Top-down map render with a 10 m grid (red every 50 m, axes green=+X, blue=-Y i.e. game +Z):
blender -b --factory-startup --python tools/blender/render_topdown.py -- <map.glb> <out.png> [street]
'street' adds a low perspective view from the centre to judge scale / ground height."""
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
sc = bpy.context.scene

def mat(rgb):
    m = bpy.data.materials.new("m"); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Emission Color"].default_value = (*rgb, 1); b.inputs["Emission Strength"].default_value = 3
    return m
red, white, green, blue = mat((1, 0, 0)), mat((1, 1, 1)), mat((0, 1, 0)), mat((0, 0.3, 1))
top = mx.z + 0.5
def strip(x0, y0, x1, y1, m, w):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, top))
    o = bpy.context.active_object
    o.scale = (max(abs(x1 - x0), w), max(abs(y1 - y0), w), 0.05)
    o.data.materials.append(m)
for v in range(int(mn.x // 10) * 10, int(mx.x) + 10, 10):
    strip(v, mn.y, v, mx.y, red if v % 50 == 0 else white, 0.5 if v % 50 == 0 else 0.15)
for v in range(int(mn.y // 10) * 10, int(mx.y) + 10, 10):
    strip(mn.x, v, mx.x, v, red if v % 50 == 0 else white, 0.5 if v % 50 == 0 else 0.15)
strip(0, 0, 12, 0, green, 1.2); strip(0, 0, 0, -12, blue, 1.2)

cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = max(mx.x - mn.x, mx.y - mn.y) * 1.02
cam.data.clip_end = 5000
cam.location = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mx.z + 200)
sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN")); sun.data.energy = 4; sun.rotation_euler = (0.5, 0.2, 0.6); sc.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
aspect = (mx.x - mn.x) / max(mx.y - mn.y, 1e-3)
sc.render.resolution_x, sc.render.resolution_y = (900, int(900 / aspect)) if aspect >= 1 else (int(900 * aspect), 900)
sc.render.filepath = args[1]
bpy.ops.render.render(write_still=True)
if len(args) > 2:
    for o in [o for o in bpy.data.objects if o.name.startswith("Cube")]:
        bpy.data.objects.remove(o)
    cam.data.type = "PERSP"; cam.data.lens = 24
    cam.location = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, 1.7))
    cam.rotation_euler = (math.radians(88), 0, 0)
    sc.render.resolution_x, sc.render.resolution_y = 800, 450
    sc.render.filepath = args[1].replace(".png", "_street.png")
    bpy.ops.render.render(write_still=True)
print("@@ bbox min", tuple(round(v, 1) for v in mn), "max", tuple(round(v, 1) for v in mx))
