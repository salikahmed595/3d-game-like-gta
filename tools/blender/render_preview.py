"""Renders a contact sheet of the props kit:  blender -b tools/blender/office_props.blend --python tools/blender/render_preview.py -- out.png"""
import bpy, math, sys

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "//preview.png"
sc = bpy.context.scene
roots = sorted([o for o in bpy.data.objects if o.parent is None], key=lambda o: o.location.x)
# Grid: desks / chairs / small props on separate rows.
for i, o in enumerate(roots):
    row, col = (0, i) if i < 3 else (1, i - 3) if i < 6 else (2, i - 6)
    spacing = 2.4 if row == 0 else 1.0 if row == 1 else 0.7
    o.location = (col * spacing - (2.4 if row == 0 else 1.0 if row == 1 else 2.1), row * 1.6, 0)

bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
floor = bpy.context.active_object
m = bpy.data.materials.new("floor"); m.use_nodes = True
m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.35, 0.38, 1)
floor.data.materials.append(m)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
cam.location = (0, -7.5, 5.2)
cam.rotation_euler = (math.radians(58), 0, 0)
cam.data.lens = 32
sc.camera = cam
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(30))
sc.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.6, 0.7, 1)
w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y = 1400, 900
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("RENDERED", out)
