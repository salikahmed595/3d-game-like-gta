"""Builds the office props kit and exports public/models/props/office_props.glb.

Run (Blender 4.2+ / 5.x):
    blender -b --factory-startup --python tools/blender/build_office_props.py

Conventions
- Metres. Every prop is a root Empty (e.g. "desk_t2") at floor level; the game clones nodes by that name.
- Blender is Z-up; the glTF exporter converts to Y-up. In game space +Z (towards the camera / desk front)
  is Blender -Y, so "front" here means negative Y.
- Material names "screen" and "trophy_metal" are recoloured at runtime; don't rename them.
"""
import bpy, bmesh, math, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "models", "props", "office_props.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- materials
_mats = {}
def mat(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*srgb(color), 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = (*srgb(emit), 1)
        p.inputs["Emission Strength"].default_value = emit_strength
    _mats[name] = m
    return m

def srgb(hexstr):
    h = hexstr.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

# ---------------------------------------------------------------- primitives
def _finish(obj, parent, material, bevel=0.0, segs=2, smooth=False):
    obj.parent = parent
    if material:
        obj.data.materials.append(material)
    if bevel > 0:
        md = obj.modifiers.new("bevel", "BEVEL")
        md.width = bevel
        md.segments = segs
        md.limit_method = "ANGLE"
    if smooth or bevel > 0:
        for f in obj.data.polygons:
            f.use_smooth = True
        if bevel > 0:
            obj.modifiers.new("wn", "WEIGHTED_NORMAL").keep_sharp = True
    return obj

def box(parent, name, loc, size, material, bevel=0.0, segs=2, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, parent, material, bevel, segs)

def cyl(parent, name, loc, r, depth, material, verts=24, r2=None, rot=(0, 0, 0), bevel=0.0, cap=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot,
                                            end_fill_type="NGON" if cap else "NOTHING")
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot,
                                        end_fill_type="NGON" if cap else "NOTHING")
    o = bpy.context.active_object
    o.name = name
    return _finish(o, parent, material, bevel, smooth=True)

def sphere(parent, name, loc, scale, material, rot=(0, 0, 0), seg=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(o, parent, material, smooth=True)

def torus(parent, name, loc, R, r, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=24, minor_segments=8, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return _finish(o, parent, material, smooth=True)

def lathe(parent, name, profile, material, steps=32, loc=(0, 0, 0)):
    """Revolve a (radius, z) profile around Z. Produces smooth turned shapes (cups, pots, lamp shades)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for i in range(steps):
        a, b = rings[i], rings[(i + 1) % steps]
        for j in range(len(profile) - 1):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.location = loc
    return _finish(o, parent, material, smooth=True)

def root(name, x):
    """Props are laid out along X in the .blend for easy inspection; the game resets the root position."""
    e = bpy.data.objects.new(name, None)
    scene.collection.objects.link(e)
    e.location = (x, 0, 0)
    return e

def star_base(p, x, y, radius, m_base, m_wheel, chrome=False):
    for i in range(5):
        a = 2 * math.pi * i / 5 + math.pi / 2
        cx, cy = math.cos(a) * radius / 2, math.sin(a) * radius / 2
        box(p, f"spoke{i}", (x + cx, y + cy, 0.075), (radius, 0.045, 0.03), m_base, bevel=0.008, rot=(0, 0, a))
        cyl(p, f"caster{i}", (x + math.cos(a) * radius, y + math.sin(a) * radius, 0.03), 0.028, 0.028, m_wheel,
            verts=12, rot=(math.pi / 2, 0, a + math.pi / 2))
    cyl(p, "hub", (x, y, 0.08), 0.05, 0.05, m_base, bevel=0.01)

# ---------------------------------------------------------------- shared materials
M = {
    "pine": mat("wood_light", "#b89a6e", 0.65),
    "walnut": mat("wood_walnut", "#5a3b27", 0.45),
    "ebony": mat("wood_ebony", "#221b18", 0.25),
    "steel": mat("metal_steel", "#8c9096", 0.35, 1.0),
    "black_metal": mat("metal_black", "#1b1d21", 0.4, 0.8),
    "gold": mat("metal_gold", "#d4a94a", 0.22, 1.0),
    "chrome": mat("metal_chrome", "#dfe3e8", 0.12, 1.0),
    "plastic_grey": mat("plastic_grey", "#6b6f76", 0.55),
    "plastic_black": mat("plastic_black", "#16181c", 0.5),
    "mesh_fabric": mat("fabric_mesh", "#23272e", 0.9),
    "leather": mat("leather_cognac", "#5e3220", 0.42),
    "ceramic": mat("ceramic_white", "#efede8", 0.3),
    "pot": mat("ceramic_pot", "#d8d2c4", 0.55),
    "soil": mat("soil", "#3a2a1e", 1.0),
    "leaf": mat("leaf", "#2f7d4a", 0.7),
    "leaf_dark": mat("leaf_dark", "#1f5c35", 0.7),
    "screen": mat("screen", "#0b0e12", 0.2, 0.0, "#4fb3ff", 1.5),
    "aluminium": mat("metal_aluminium", "#aeb4bb", 0.3, 1.0),
    "trophy": mat("trophy_metal", "#ffcc33", 0.18, 1.0),
    "marble": mat("marble_black", "#1a1a1c", 0.2, 0.0),
    "shade": mat("lamp_shade", "#f5e6c8", 0.8, 0.0, "#ffd28a", 2.0),
    "paper": mat("paper", "#f4f1e8", 0.9),
}

# ================================================================ DESKS
def desk(tier, x):
    p = root(f"desk_t{tier}", x)
    w = {1: 1.3, 2: 1.6, 3: 2.0}[tier]
    d = {1: 0.65, 2: 0.8, 3: 0.8}[tier]
    if tier == 1:
        # Flat-pack starter desk: thin top, square steel tube legs and a back stretcher.
        box(p, "top", (x, 0, 0.74), (w, d, 0.04), M["pine"], bevel=0.004)
        for sx in (-1, 1):
            for sy in (-1, 1):
                box(p, f"leg{sx}{sy}", (x + sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), 0.36), (0.035, 0.035, 0.72), M["steel"], bevel=0.003)
        box(p, "stretcher", (x, d / 2 - 0.05, 0.2), (w - 0.1, 0.02, 0.03), M["steel"])
    elif tier == 2:
        # Walnut desk with panel legs, a modesty panel facing the camera and a drawer pedestal.
        box(p, "top", (x, 0, 0.74), (w, d, 0.05), M["walnut"], bevel=0.012, segs=3)
        for sx in (-1, 1):
            box(p, f"panel_leg{sx}", (x + sx * (w / 2 - 0.04), 0, 0.36), (0.045, d - 0.06, 0.72), M["black_metal"], bevel=0.006)
        box(p, "modesty", (x, -(d / 2 - 0.05), 0.48), (w - 0.12, 0.025, 0.42), M["walnut"], bevel=0.004)
        px = x + w / 2 - 0.3
        box(p, "pedestal", (px, 0.02, 0.36), (0.4, d - 0.14, 0.7), M["walnut"], bevel=0.006)
        for i, z in enumerate((0.58, 0.36, 0.14)):
            box(p, f"drawer{i}", (px, 0.02 + (d - 0.14) / 2 + 0.004, z), (0.37, 0.01, 0.19), M["walnut"], bevel=0.003)
            box(p, f"handle{i}", (px, 0.02 + (d - 0.14) / 2 + 0.016, z + 0.06), (0.14, 0.012, 0.012), M["steel"], bevel=0.003)
    else:
        # Executive: thick ebony slab with gold edge inlay, sculpted gold frame and full front panel.
        box(p, "top", (x, 0, 0.74), (w, d, 0.07), M["ebony"], bevel=0.02, segs=4)
        box(p, "inlay_front", (x, -(d / 2) - 0.001, 0.74), (w - 0.06, 0.004, 0.012), M["gold"])
        box(p, "inlay_back", (x, d / 2 + 0.001, 0.74), (w - 0.06, 0.004, 0.012), M["gold"])
        for sx in (-1, 1):
            lx = x + sx * (w / 2 - 0.1)
            box(p, f"frame_v{sx}a", (lx, -(d / 2 - 0.08), 0.355), (0.05, 0.05, 0.71), M["gold"], bevel=0.008)
            box(p, f"frame_v{sx}b", (lx, d / 2 - 0.08, 0.355), (0.05, 0.05, 0.71), M["gold"], bevel=0.008)
            box(p, f"frame_h{sx}", (lx, 0, 0.03), (0.05, d - 0.11, 0.05), M["gold"], bevel=0.008)
        box(p, "front_panel", (x, -(d / 2 - 0.12), 0.45), (w - 0.32, 0.04, 0.5), M["ebony"], bevel=0.008)
        box(p, "front_inlay", (x, -(d / 2 - 0.12) - 0.021, 0.45), (w - 0.5, 0.004, 0.012), M["gold"])
        # Leather desk pad and a pen holder: small cues that this is a different class of office.
        box(p, "desk_pad", (x - 0.3, 0.1, 0.778), (0.8, 0.42, 0.006), M["leather"], bevel=0.002)
        cyl(p, "pen_cup", (x - 0.8, 0.15, 0.82), 0.035, 0.09, M["gold"], verts=16)
        for i in range(3):
            cyl(p, f"pen{i}", (x - 0.8 + (i - 1) * 0.012, 0.15 + (i % 2) * 0.01, 0.88), 0.005, 0.13, M["plastic_black"], verts=8, rot=(0.12 * (i - 1), 0.1, 0))
    return p

# ================================================================ CHAIRS
def chair(tier, x):
    p = root(f"chair_t{tier}", x)
    back = 0.22  # backrest sits behind the seat (+Y in Blender = -Z in game, away from the desk)
    if tier == 1:
        star_base(p, x, 0, 0.26, M["plastic_black"], M["plastic_black"])
        cyl(p, "gas_lift", (x, 0, 0.27), 0.025, 0.36, M["steel"], verts=16)
        box(p, "seat", (x, 0, 0.47), (0.44, 0.44, 0.07), M["plastic_grey"], bevel=0.02, segs=3)
        box(p, "back_post", (x, back + 0.02, 0.6), (0.05, 0.025, 0.3), M["plastic_black"], bevel=0.005)
        box(p, "back", (x, back, 0.82), (0.4, 0.05, 0.3), M["plastic_grey"], bevel=0.02, segs=3)
    elif tier == 2:
        # Ergonomic task chair: mesh back with frame, lumbar curve, adjustable armrests.
        star_base(p, x, 0, 0.3, M["black_metal"], M["plastic_black"])
        cyl(p, "gas_lift", (x, 0, 0.27), 0.028, 0.36, M["chrome"], verts=16)
        box(p, "seat_shell", (x, 0, 0.455), (0.48, 0.48, 0.03), M["plastic_black"], bevel=0.01)
        box(p, "seat", (x, -0.01, 0.49), (0.46, 0.46, 0.06), M["mesh_fabric"], bevel=0.025, segs=3)
        for sx in (-1, 1):
            box(p, f"back_rail{sx}", (x + sx * 0.22, back + 0.03, 0.82), (0.03, 0.03, 0.62), M["plastic_black"], bevel=0.008, rot=(-0.12, 0, 0))
            box(p, f"arm_post{sx}", (x + sx * 0.25, 0.02, 0.57), (0.03, 0.04, 0.16), M["plastic_black"], bevel=0.006)
            box(p, f"arm_pad{sx}", (x + sx * 0.25, 0.0, 0.655), (0.06, 0.24, 0.025), M["plastic_black"], bevel=0.01)
        box(p, "back_mesh", (x, back + 0.03, 0.84), (0.42, 0.02, 0.56), M["mesh_fabric"], bevel=0.008, rot=(-0.12, 0, 0))
        box(p, "lumbar", (x, back, 0.68), (0.4, 0.04, 0.08), M["plastic_black"], bevel=0.015, rot=(-0.12, 0, 0))
        box(p, "headrest", (x, back + 0.08, 1.2), (0.28, 0.05, 0.1), M["mesh_fabric"], bevel=0.02, rot=(-0.2, 0, 0))
    else:
        # Executive leather chair: chrome base, tall tufted back, padded arms.
        star_base(p, x, 0, 0.32, M["chrome"], M["plastic_black"], chrome=True)
        cyl(p, "gas_lift", (x, 0, 0.27), 0.03, 0.36, M["chrome"], verts=16)
        box(p, "seat", (x, -0.01, 0.49), (0.52, 0.5, 0.1), M["leather"], bevel=0.04, segs=4)
        box(p, "back", (x, back + 0.04, 0.98), (0.5, 0.1, 0.86), M["leather"], bevel=0.045, segs=4, rot=(-0.1, 0, 0))
        for i, z in enumerate((0.74, 0.96, 1.18)):
            box(p, f"tuft{i}", (x, back - 0.003 - (z - 0.98) * 0.1, z), (0.44, 0.05, 0.19), M["leather"], bevel=0.04, segs=4, rot=(-0.1, 0, 0))
        for sx in (-1, 1):
            box(p, f"arm{sx}", (x + sx * 0.29, 0.02, 0.66), (0.08, 0.42, 0.07), M["leather"], bevel=0.03, segs=3)
            box(p, f"arm_strut{sx}", (x + sx * 0.29, 0.05, 0.56), (0.03, 0.04, 0.16), M["chrome"], bevel=0.006)
    return p

# ================================================================ SMALL PROPS
def laptop(x):
    # Hinge at origin; lid opens ~105deg towards the user (+Y in Blender = towards the seated character).
    p = root("laptop", x)
    box(p, "base", (x, 0, 0.009), (0.34, 0.24, 0.018), M["aluminium"], bevel=0.004)
    box(p, "keyboard", (x, -0.02, 0.0185), (0.29, 0.11, 0.002), M["plastic_black"])
    box(p, "trackpad", (x, 0.075, 0.0185), (0.1, 0.06, 0.001), M["plastic_grey"])
    lid = bpy.data.objects.new("lid", None)
    scene.collection.objects.link(lid)
    lid.parent = p
    lid.location = (x, -0.12, 0.018)
    lid.rotation_euler = (math.radians(15), 0, 0)  # leans away from the user
    box(lid, "lid_shell", (0, -0.006, 0.115), (0.34, 0.012, 0.23), M["aluminium"], bevel=0.004)
    box(lid, "screen", (0, 0.0005, 0.12), (0.31, 0.001, 0.19), M["screen"])
    return p

def monitor(x):
    # 0.6 m wide reference; the game scales it for other widths. Screen faces +Y (game -Z, towards the seated user).
    p = root("monitor", x)
    box(p, "foot", (x, 0, 0.008), (0.24, 0.17, 0.016), M["black_metal"], bevel=0.006)
    box(p, "neck", (x, -0.04, 0.18), (0.05, 0.03, 0.34), M["black_metal"], bevel=0.008, rot=(0.12, 0, 0))
    box(p, "back_shell", (x, -0.02, 0.38), (0.6, 0.03, 0.34), M["plastic_black"], bevel=0.008)
    box(p, "screen", (x, -0.004, 0.385), (0.58, 0.002, 0.32), M["screen"])
    return p

def mug(x):
    p = root("mug", x)
    lathe(p, "body", [(0.034, 0.0), (0.04, 0.003), (0.042, 0.09), (0.037, 0.09), (0.035, 0.012), (0.0, 0.012)], M["ceramic"], loc=(x, 0, 0))
    torus(p, "handle", (x + 0.05, 0, 0.048), 0.022, 0.006, M["ceramic"], rot=(math.pi / 2, 0, 0))
    cyl(p, "coffee", (x, 0, 0.075), 0.036, 0.004, mat("coffee", "#3b2214", 0.15), verts=20)
    return p

def plant(x):
    p = root("plant", x)
    lathe(p, "pot", [(0.0, 0.0), (0.12, 0.0), (0.14, 0.02), (0.17, 0.4), (0.18, 0.4), (0.18, 0.42), (0.16, 0.42), (0.15, 0.38)], M["pot"], loc=(x, 0, 0))
    cyl(p, "soil", (x, 0, 0.37), 0.15, 0.02, M["soil"], verts=20)
    # Fan of tall leaves (snake-plant silhouette reads well at office-camera distance).
    import random
    rnd = random.Random(7)
    for i in range(14):
        a = 2 * math.pi * i / 14 + rnd.uniform(-0.2, 0.2)
        r = rnd.uniform(0.02, 0.08)
        h = rnd.uniform(0.32, 0.55)
        tilt = rnd.uniform(0.12, 0.38)
        sphere(p, f"leaf{i}", (x + math.cos(a) * r, math.sin(a) * r, 0.38 + h / 2), (0.035, 0.008, h / 2),
               M["leaf"] if i % 3 else M["leaf_dark"], rot=(math.sin(a) * -tilt, math.cos(a) * tilt, a), seg=10, rings=6)
    return p

def floor_lamp(x):
    p = root("floor_lamp", x)
    cyl(p, "base", (x, 0, 0.015), 0.16, 0.03, M["marble"], verts=32, bevel=0.006)
    cyl(p, "pole", (x, 0, 0.9), 0.012, 1.74, M["gold"], verts=12)
    lathe(p, "shade", [(0.26, 1.68), (0.17, 1.98)], M["shade"], loc=(x, 0, 0))
    for m_ in p.children:
        if m_.name.startswith("shade"):
            m_.data.materials[0].use_backface_culling = False
    return p

def trophy(x):
    # ~0.27 m tall cup trophy. Cup + handles use "trophy_metal" (recoloured by rarity at runtime).
    p = root("trophy", x)
    box(p, "plinth", (x, 0, 0.025), (0.13, 0.13, 0.05), M["marble"], bevel=0.006)
    box(p, "plinth_top", (x, 0, 0.06), (0.1, 0.1, 0.02), M["marble"], bevel=0.004)
    lathe(p, "cup", [(0.0, 0.07), (0.035, 0.07), (0.012, 0.085), (0.01, 0.13), (0.02, 0.15), (0.06, 0.2), (0.068, 0.26),
                     (0.072, 0.27), (0.064, 0.27), (0.058, 0.215), (0.0, 0.17)], M["trophy"], loc=(x, 0, 0))
    for sx in (-1, 1):
        torus(p, f"handle{sx}", (x + sx * 0.068, 0, 0.225), 0.028, 0.0055, M["trophy"], rot=(math.pi / 2, 0, 0))
    return p

def papers(x):
    p = root("papers", x)
    for i in range(4):
        box(p, f"sheet{i}", (x + (i - 1.5) * 0.006, (i % 2) * 0.008, 0.002 + i * 0.0025), (0.21, 0.297, 0.002), M["paper"], rot=(0, 0, (i - 1.5) * 0.06))
    return p

# ================================================================ AI COMPANION + OUTDOOR
def companion(x):
    # Hovering assistant bot (PRD §21). Origin = body centre. Faces -Y (game +Z), like the avatar.
    # Material "companion_eye" is recoloured at runtime to show mood.
    p = root("companion", x)
    shell = mat("companion_shell", "#eef1f6", 0.25, 0.1)
    visor_m = mat("companion_visor", "#0c1018", 0.15, 0.3)
    eye = mat("companion_eye", "#4dc4ff", 0.3, 0.0, "#4dc4ff", 4.0)
    sphere(p, "body", (x, 0, 0), (0.16, 0.15, 0.15), shell, seg=24, rings=12)
    sphere(p, "visor", (x, -0.07, 0.025), (0.12, 0.09, 0.075), visor_m, seg=24, rings=12)
    for sx in (-1, 1):
        sphere(p, f"eye{sx}", (x + sx * 0.042, -0.152, 0.03), (0.022, 0.01, 0.028), eye, seg=12, rings=6)
        cyl(p, f"ear{sx}", (x + sx * 0.16, 0, 0.01), 0.045, 0.04, shell, verts=20, rot=(0, math.pi / 2, 0))
        cyl(p, f"ear_ring{sx}", (x + sx * 0.183, 0, 0.01), 0.03, 0.008, eye, verts=20, rot=(0, math.pi / 2, 0))
    cyl(p, "antenna", (x, 0, 0.19), 0.006, 0.08, M["black_metal"], verts=8)
    sphere(p, "antenna_tip", (x, 0, 0.235), (0.018, 0.018, 0.018), eye, seg=10, rings=6)
    cyl(p, "thruster", (x, 0, -0.15), 0.05, 0.03, M["black_metal"], verts=16, r2=0.035)
    return p

def tree(x):
    p = root("tree", x)
    bark = mat("bark", "#5a4330", 0.95)
    cyl(p, "trunk", (x, 0, 1.0), 0.11, 2.0, bark, verts=10, r2=0.07)
    cyl(p, "grate", (x, 0, 0.01), 0.5, 0.02, M["black_metal"], verts=24)
    for i, (dx, dy, z, r) in enumerate([(0, 0, 2.5, 0.95), (0.45, 0.2, 2.15, 0.65), (-0.4, -0.25, 2.2, 0.7), (0.1, -0.35, 2.95, 0.6)]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x + dx, dy, z))
        o = bpy.context.active_object
        o.name = f"canopy{i}"
        _finish(o, p, M["leaf"] if i % 2 == 0 else M["leaf_dark"])  # faceted: reads as stylised foliage
    return p

def street_lamp(x):
    p = root("street_lamp", x)
    glow = mat("lamp_glow", "#fff4d6", 0.4, 0.0, "#ffd9a0", 6.0)
    cyl(p, "base", (x, 0, 0.15), 0.12, 0.3, M["black_metal"], verts=16, r2=0.08)
    cyl(p, "pole", (x, 0, 2.1), 0.05, 3.9, M["black_metal"], verts=12, r2=0.035)
    box(p, "arm", (x, -0.3, 3.95), (0.04, 0.6, 0.04), M["black_metal"])
    box(p, "head", (x, -0.6, 3.9), (0.22, 0.34, 0.08), M["black_metal"], bevel=0.02)
    box(p, "bulb", (x, -0.6, 3.855), (0.18, 0.28, 0.01), glow)
    return p

def bench(x):
    p = root("bench", x)
    for i in range(4):
        box(p, f"seat{i}", (x, -0.15 + i * 0.1, 0.45), (1.5, 0.085, 0.035), M["walnut"], bevel=0.008)
    for i in range(2):
        box(p, f"back{i}", (x, 0.19, 0.62 + i * 0.13), (1.5, 0.03, 0.09), M["walnut"], bevel=0.008, rot=(-0.2, 0, 0))
    for sx in (-1, 1):
        box(p, f"leg{sx}", (x + sx * 0.65, 0, 0.22), (0.05, 0.42, 0.44), M["black_metal"], bevel=0.01)
        box(p, f"back_strut{sx}", (x + sx * 0.65, 0.2, 0.65), (0.04, 0.04, 0.4), M["black_metal"], rot=(-0.2, 0, 0))
    return p

# ================================================================ CITY TRAFFIC
# Moving props are cloned many times, so static parts are merged into one mesh per prop (fewer draw calls);
# only parts the game animates stay separate under named pivot Empties ("wheel_*", "leg_*", "arm_*").

def merge(objs, name):
    """Apply modifiers, then join meshes (all children of the same root) into one object."""
    for o in objs:
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]

def pivot(parent, name, loc):
    e = bpy.data.objects.new(name, None)
    scene.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    return e

TIRE = mat("tire", "#141518", 0.85)
HUB = mat("wheel_hub", "#b9bec6", 0.3, 1.0)
HEAD = mat("headlight", "#fff6dc", 0.2, 0.0, "#fff2c8", 8.0)
TAIL = mat("taillight", "#5a0b0b", 0.3, 0.0, "#ff2a2a", 5.0)
GLASS = mat("car_glass", "#0d1520", 0.08, 0.4)
TRIM = mat("car_trim", "#121316", 0.5, 0.2)

def wheel(p, name, loc, r, w):
    pv = pivot(p, name, loc)
    t = cyl(pv, f"{name}_tire", (0, 0, 0), r, w, TIRE, verts=18, rot=(0, math.pi / 2, 0))
    h = cyl(pv, f"{name}_hub", (0, 0, 0), r * 0.55, w + 0.01, HUB, verts=12, rot=(0, math.pi / 2, 0))
    merge([t, h], f"{name}_mesh")
    return pv

def car(name, x, L, W, body_h, cab_h, wheel_r, paint, extras=None):
    """Car facing -Y (game +Z). Material "car_paint" is recoloured per instance (the taxi uses its own paint)."""
    p = root(name, x)
    clear = wheel_r * 0.75
    parts = [
        box(p, "body", (x, 0, clear + body_h / 2), (W, L, body_h), paint, bevel=0.09, segs=3),
        box(p, "cabin", (x, L * 0.06, clear + body_h + cab_h / 2 - 0.02), (W * 0.86, L * 0.5, cab_h), GLASS, bevel=0.1, segs=3),
        box(p, "roof", (x, L * 0.06, clear + body_h + cab_h - 0.01), (W * 0.84, L * 0.42, 0.05), paint, bevel=0.02),
        box(p, "bumper_f", (x, -L / 2 - 0.02, clear + 0.08), (W * 0.96, 0.12, 0.18), TRIM, bevel=0.03),
        box(p, "bumper_r", (x, L / 2 + 0.02, clear + 0.08), (W * 0.96, 0.12, 0.18), TRIM, bevel=0.03),
    ]
    for sx in (-1, 1):
        parts.append(box(p, f"head{sx}", (x + sx * W * 0.33, -L / 2 - 0.005, clear + body_h * 0.62), (W * 0.2, 0.04, 0.1), HEAD))
        parts.append(box(p, f"tail{sx}", (x + sx * W * 0.34, L / 2 + 0.005, clear + body_h * 0.65), (W * 0.18, 0.04, 0.09), TAIL))
    if extras:
        parts += extras(p)
    merge(parts, f"{name}_body")
    for sx in (-1, 1):
        for sy, tag in ((-1, "f"), (1, "r")):
            wheel(p, f"wheel_{tag}{'l' if sx < 0 else 'r'}", (x + sx * (W / 2 - 0.08), sy * L * 0.31, wheel_r), wheel_r, 0.24)
    return p

def taxi_sign(p):
    x = p.location.x
    sign = mat("taxi_sign", "#fff4c2", 0.3, 0.0, "#ffe27a", 4.0)
    return [box(p, "taxi_sign", (x, 0.25, 1.52), (0.5, 0.18, 0.14), sign, bevel=0.02)]

def person(x, name="pedestrian"):
    """Low-poly city person facing -Y. Pivots: leg_l/leg_r at the hips, arm_l/arm_r at the shoulders.
    Materials ped_shirt / ped_pants / ped_skin / ped_hair are recoloured per instance for variety."""
    p = root(name, x)
    shirt = mat("ped_shirt", "#3a6ea5", 0.8)
    pants = mat("ped_pants", "#2b2f36", 0.85)
    skin = mat("ped_skin", "#c99a74", 0.6)
    hair = mat("ped_hair", "#1e1712", 0.9)
    torso = [
        box(p, "torso", (x, 0, 1.2), (0.4, 0.22, 0.58), shirt, bevel=0.07, segs=3),
        box(p, "hips", (x, 0, 0.9), (0.36, 0.2, 0.14), pants, bevel=0.04),
        cyl(p, "neck", (x, 0, 1.52), 0.05, 0.08, skin, verts=10),
        sphere(p, "head", (x, -0.01, 1.66), (0.105, 0.115, 0.125), skin, seg=14, rings=8),
        sphere(p, "hair", (x, 0.012, 1.71), (0.11, 0.118, 0.09), hair, seg=14, rings=8),
    ]
    merge(torso, f"{name}_torso")
    for sx, tag in ((-1, "r"), (1, "l")):  # character's left is +X when facing -Y
        leg = pivot(p, f"leg_{tag}", (x + sx * 0.1, 0, 0.88))
        merge([box(leg, f"thigh_{tag}", (0, 0, -0.43), (0.14, 0.16, 0.86), pants, bevel=0.04),
               box(leg, f"shoe_{tag}", (0, -0.04, -0.85), (0.13, 0.26, 0.07), TRIM, bevel=0.02)], f"leg_{tag}_mesh")
        arm = pivot(p, f"arm_{tag}", (x + sx * 0.26, 0, 1.44))
        merge([box(arm, f"sleeve_{tag}", (0, 0, -0.14), (0.1, 0.12, 0.3), shirt, bevel=0.03),
               box(arm, f"hand_{tag}", (0, 0, -0.43), (0.08, 0.09, 0.3), skin, bevel=0.03)], f"arm_{tag}_mesh")
    return p

def bicycle(x):
    p = root("bicycle", x)
    frame_m = mat("bike_frame", "#d6402f", 0.4, 0.6)
    def tube(name, a, b, r=0.018):
        (ax, ay, az), (bx, by, bz) = a, b
        dx, dy, dz = bx - ax, by - ay, bz - az
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        o = cyl(p, name, (x + (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), r, length, frame_m, verts=8)
        o.rotation_mode = "QUATERNION"
        from mathutils import Vector
        o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector((dx, dy, dz)).normalized())
        return o
    crank, seat, head = (0, 0.05, 0.32), (0, 0.18, 0.92), (0, -0.42, 0.9)
    parts = [
        tube("down", crank, (0, -0.4, 0.82)), tube("top", (0, 0.16, 0.85), (0, -0.4, 0.86)), tube("seat_t", crank, seat),
        tube("chain", crank, (0, 0.52, 0.34)), tube("stay", (0, 0.52, 0.34), (0, 0.16, 0.82)), tube("fork", head, (0, -0.52, 0.34), 0.016),
        tube("bar", (-0.25, -0.38, 1.0), (0.25, -0.38, 1.0), 0.014), tube("stem", head, (0, -0.38, 1.0), 0.014),
        box(p, "saddle", (x, 0.2, 0.95), (0.12, 0.24, 0.05), TRIM, bevel=0.02),
    ]
    merge(parts, "bicycle_frame")
    for tag, y in (("f", -0.52), ("r", 0.52)):
        pv = pivot(p, f"wheel_{tag}", (x, y, 0.34))
        t = torus(pv, f"tire_{tag}", (0, 0, 0), 0.32, 0.022, TIRE, rot=(0, math.pi / 2, 0))
        h = cyl(pv, f"hub_{tag}", (0, 0, 0), 0.03, 0.06, HUB, verts=8, rot=(0, math.pi / 2, 0))
        spokes = [box(pv, f"spoke_{tag}{i}", (0, 0, 0), (0.006, 0.6, 0.006), HUB, rot=(i * math.pi / 3, 0, 0)) for i in range(3)]
        merge([t, h] + spokes, f"wheel_{tag}_mesh")
    return p

def motorbike(x):
    p = root("motorbike", x)
    paint = mat("moto_paint", "#1f6fd1", 0.35, 0.4)
    parts = [
        box(p, "tank", (x, -0.15, 0.78), (0.3, 0.55, 0.22), paint, bevel=0.08, segs=3),
        box(p, "body", (x, 0.3, 0.7), (0.28, 0.6, 0.22), paint, bevel=0.07, segs=3),
        box(p, "seat", (x, 0.25, 0.84), (0.26, 0.55, 0.08), TRIM, bevel=0.03),
        box(p, "engine", (x, -0.05, 0.45), (0.26, 0.45, 0.28), M["black_metal"], bevel=0.04),
        box(p, "fork", (x, -0.62, 0.62), (0.06, 0.06, 0.62), M["chrome"], rot=(-0.35, 0, 0)),
        box(p, "bar", (x, -0.52, 1.0), (0.62, 0.04, 0.04), TRIM),
        box(p, "lamp", (x, -0.66, 0.9), (0.14, 0.05, 0.12), HEAD, bevel=0.02),
        box(p, "tail", (x, 0.62, 0.78), (0.14, 0.04, 0.06), TAIL),
        cyl(p, "exhaust", (x + 0.17, 0.35, 0.38), 0.04, 0.6, M["chrome"], verts=10, rot=(math.pi / 2, 0, 0)),
    ]
    merge(parts, "motorbike_body")
    for tag, y in (("f", -0.72), ("r", 0.62)):
        wheel(p, f"wheel_{tag}", (x, y, 0.3), 0.3, 0.12)
    return p

# ---------------------------------------------------------------- build
xs = iter(range(0, 200, 3))
for t in (1, 2, 3):
    desk(t, next(xs))
for t in (1, 2, 3):
    chair(t, next(xs))
for f in (laptop, monitor, mug, plant, floor_lamp, trophy, papers, companion, tree, street_lamp, bench):
    f(next(xs))
car("sedan", next(xs), 4.3, 1.8, 0.58, 0.5, 0.33, mat("car_paint", "#2e86de", 0.3, 0.5))
car("suv", next(xs), 4.7, 1.95, 0.8, 0.58, 0.4, _mats["car_paint"])
car("taxi", next(xs), 4.3, 1.8, 0.58, 0.5, 0.33, mat("taxi_paint", "#f5c518", 0.3, 0.5), taxi_sign)
person(next(xs))
bicycle(next(xs))
motorbike(next(xs))

# Children were authored in world coordinates; express them relative to their prop root.
# (Grandchildren such as the laptop lid's parts were authored lid-relative and need no change.)
for o in [o for o in bpy.data.objects if o.parent is None]:
    for c in o.children:
        c.location.x -= o.location.x

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB", export_apply=True, export_yup=True,
    export_materials="EXPORT", export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=False,
)
# Editable source stays out of public/ so it is not shipped with the build.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(os.path.abspath(__file__)), "office_props.blend"))
print("EXPORTED", os.path.abspath(OUT), os.path.getsize(OUT), "bytes")
