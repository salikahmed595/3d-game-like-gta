"""Side-view icons of the converted weapons for the HUD and weapon wheel (transparent PNG, muzzle pointing right).
blender -b --factory-startup --python tools/blender/render_weapon_icons.py"""
import bpy, math, os
from mathutils import Vector
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
D = os.path.join(ROOT, "public", "models", "weapons")
for wid in ["pistol", "smg", "rifle", "carbine", "sniper", "plasma", "incinerator"]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bpy.ops.import_scene.gltf(filepath=os.path.join(D, wid + ".glb"))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    ctr = (mn + mx) / 2
    sc = bpy.context.scene
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"
    # Camera on -X looking +X: the muzzle (-Y) appears on the right.
    cam.data.ortho_scale = max(mx.y - mn.y, (mx.z - mn.z) * 2.67) * 1.08
    cam.location = (ctr.x - 5, ctr.y, ctr.z)
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    for rot, e in (((0.6, 0.3, -1.2), 4), ((1.2, -0.4, 2.2), 1.5)):
        s = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN")); s.data.energy = e; s.rotation_euler = rot; sc.collection.objects.link(s)
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 256, 96
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = os.path.join(D, wid + ".png")
    bpy.ops.render.render(write_still=True)
    print("@@ ICON", wid)
