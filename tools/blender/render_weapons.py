"""Side-view contact sheet of the converted weapons (red dot = where the muzzle should be, i.e. -Y; green = grip origin).
blender -b --factory-startup --python tools/blender/render_weapons.py -- <out.png>"""
import bpy, math, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
ids = ["pistol", "smg", "rifle", "carbine", "sniper", "plasma", "incinerator"]
for i, wid in enumerate(ids):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "public", "models", "weapons", wid + ".glb"))
    new = [o for o in bpy.data.objects if o not in before and o.parent is None]
    for o in new:
        o.location.z += -i * 0.45
    for loc, col in (((0, -0.7, -i * 0.45), (1, 0, 0, 1)), ((0, 0, -i * 0.45), (0, 1, 0, 1))):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.02, location=loc)
        m = bpy.data.materials.new("m"); m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = col
        bpy.context.active_object.data.materials.append(m)
sc = bpy.context.scene
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 3.4
cam.location = (5, 0, -1.35); cam.rotation_euler = (math.radians(90), 0, math.radians(90))
sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN")); sun.data.energy = 4; sun.rotation_euler = (0.6, 0.6, 1.2); sc.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.7, 0.72, 0.78, 1)
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y = 700, 800
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
