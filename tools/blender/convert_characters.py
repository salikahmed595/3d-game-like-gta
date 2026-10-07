"""Converts the source characters in tools/characters_src into game-ready GLBs + portrait thumbnails.

Run:  blender -b --factory-startup --python tools/blender/convert_characters.py [-- <id> ...]

For every character it:
- imports the source (GLB or FBX) into an empty scene,
- fixes orientation so the character faces -Y in Blender (= +Z in game, like the rest of the scene),
- renames bones to one standard (Mixamo / Ready Player Me names: Hips, Spine, Spine2, Neck, Head, LeftArm, ...)
  so the game's pose/emotion code drives every rig the same way,
- renames Character Creator face shape keys to ARKit names (eyeBlinkLeft, mouthSmileLeft, ...),
- decimates very heavy meshes and resizes textures to <= 1024 px (WebP) to keep downloads small,
- exports public/models/characters/<id>/<id>.glb and renders <id>/thumb.png for the character picker.
"""
import bpy, math, os, sys
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = os.path.join(ROOT, "tools", "characters_src")
OUT = os.path.join(ROOT, "public", "models", "characters")

VALVE = {
    "ValveBiped.Bip01_Pelvis": "Hips", "ValveBiped.Bip01_Spine": "Spine", "ValveBiped.Bip01_Spine1": "Spine1",
    "ValveBiped.Bip01_Spine2": "Spine2", "ValveBiped.Bip01_Spine4": "Spine3", "ValveBiped.Bip01_Neck1": "Neck",
    "ValveBiped.Bip01_Head1": "Head",
}
UE = {
    "pelvis": "Hips", "spine_01": "Spine", "spine_02": "Spine1", "spine_03": "Spine2", "neck_01": "Neck", "head": "Head",
}
for side, s in (("L", "Left"), ("R", "Right")):
    VALVE.update({
        f"ValveBiped.Bip01_{side}_Clavicle": f"{s}Shoulder", f"ValveBiped.Bip01_{side}_UpperArm": f"{s}Arm",
        f"ValveBiped.Bip01_{side}_Forearm": f"{s}ForeArm", f"ValveBiped.Bip01_{side}_Hand": f"{s}Hand",
        f"ValveBiped.Bip01_{side}_Thigh": f"{s}UpLeg", f"ValveBiped.Bip01_{side}_Calf": f"{s}Leg",
        f"ValveBiped.Bip01_{side}_Foot": f"{s}Foot", f"ValveBiped.Bip01_{side}_Toe0": f"{s}ToeBase",
    })
    l = side.lower()
    UE.update({
        f"clavicle_{l}": f"{s}Shoulder", f"upperarm_{l}": f"{s}Arm", f"lowerarm_{l}": f"{s}ForeArm", f"hand_{l}": f"{s}Hand",
        f"thigh_{l}": f"{s}UpLeg", f"calf_{l}": f"{s}Leg", f"foot_{l}": f"{s}Foot", f"ball_{l}": f"{s}ToeBase",
    })
# Cartoon rig without a usable leg chain: map the upper body only (used as an idle NPC).
SCOTT = {
    "MainBone_330": "Hips", "Bone.Spine.001_325": "Spine", "Bone.Spine.002_324": "Spine2", "Bone.Neck_308": "Neck",
    "Bone.Head.001_307": "Head", "Bone.Arm.001.L_313": "LeftArm", "Bone.Arm.002.L.003_312": "LeftForeArm",
    "Bone.Arm.001.R_318": "RightArm", "Bone.Arm.002.R.003_317": "RightForeArm",
}
# Character Creator -> ARKit (what src/game/animations/emotions.ts speaks).
CC_KEYS = {
    "Eye_Blink_L": "eyeBlinkLeft", "Eye_Blink_R": "eyeBlinkRight", "Eye_Wide_L": "eyeWideLeft", "Eye_Wide_R": "eyeWideRight",
    "Eye_Squint_L": "eyeSquintLeft", "Eye_Squint_R": "eyeSquintRight", "Brow_Raise_Inner_L": "browInnerUp",
    "Brow_Raise_Outer_L": "browOuterUpLeft", "Brow_Raise_Outer_R": "browOuterUpRight", "Brow_Drop_L": "browDownLeft",
    "Brow_Drop_R": "browDownRight", "Cheek_Raise_L": "cheekSquintLeft", "Cheek_Raise_R": "cheekSquintRight",
    "Mouth_Smile_L": "mouthSmileLeft", "Mouth_Smile_R": "mouthSmileRight", "Mouth_Frown_L": "mouthFrownLeft",
    "Mouth_Frown_R": "mouthFrownRight", "Mouth_Open": "jawOpen", "Mouth_Pucker": "mouthPucker",
    "Mouth_Dimple_L": "mouthDimpleLeft", "Mouth_Dimple_R": "mouthDimpleRight", "Nose_Flank_Raise_L": "noseSneerLeft",
    "Nose_Flank_Raise_R": "noseSneerRight", "Mouth_Lips_Tight": "mouthPressLeft",
}

CHARS = [
    dict(id="saeed", src="3d-character-young-boy/source/saeedd.glb"),
    dict(id="arian", src="boy-sherry-arian/source/80d88ed2-12f2-457f-9b00-eef3b37d1737.glb"),
    dict(id="aesthetic", src="aesthetic-boy/source/648e13f8f2caada0866e9c3b.glb"),
    dict(id="soldier", src="soldier-boy/source/soldier boy.glb", bones=VALVE, max_tris=32000),
    # Character Creator FBX: the rest pose has an open jaw and a skeleton at 90° to the skin; the shipped
    # "T-Pose" action fixes both but lays the body down. Apply that pose as rest, then stand everything up.
    dict(id="baby", src="baby-boy/source/BabyBoy.fbx", bones=UE, keys=CC_KEYS, pose_as_rest=True, rot=(90, 0, 0), textures="baby-boy/textures"),
    dict(id="scott", src="scott_boy_-_free_3d_model.glb", bones=SCOTT),
    dict(id="spanner", src="spanner_boy.glb", max_tris=26000, rot=(0, 0, 90)),  # authored facing -X
    # The user's original personal avatar (Ready-Player-Me-style rig, T-pose); re-exported to embed morph names.
    dict(id="salik", src="salik_original.glb"),
    # Static GTA-style figures: auto-rigged so they can walk around the city.
    dict(id="franklin", src="../../charaters in glb/franklin_gta_v.glb", autorig=True, rest_turn=180, max_tris=24000),
    dict(id="trevor", src="../../charaters in glb/trevor_gta_5.glb", autorig=True, max_tris=24000),
    dict(id="ceaser", src="../../charaters in glb/gta_sa_ceaser.glb", autorig=True),
    # Police officer (user, "new glb"): static figure, arms down; auto-rigged so cops can run, aim and shoot.
    dict(id="cop", src="../../new glb/police.glb", autorig=True, max_tris=9000),
    dict(id="lucia", src="../../charaters in glb/gta_6_lucia.glb", max_tris=30000, drop=["weapon", "gun", "pistol"],
         bone_patterns={
             "Hips": r"^root hips", "Spine": r"^spine lower", "Spine1": r"^spine upper", "Spine2": r"^chest upper",
             "Neck": r"^head neck lower", "Head": r"^head neck upper_",
             "LeftShoulder": r"^arm left shoulder 1", "LeftArm": r"^arm left shoulder 2", "LeftForeArm": r"^arm left elbow",
             "LeftHand": r"^arm left wrist", "RightShoulder": r"^arm right shoulder 1", "RightArm": r"^arm right shoulder 2",
             "RightForeArm": r"^arm right elbow", "RightHand": r"^arm right wrist",
             "LeftUpLeg": r"^leg left thigh_", "LeftLeg": r"^leg left knee", "LeftFoot": r"^leg left ankle",
             "RightUpLeg": r"^leg right thigh_", "RightLeg": r"^leg right knee", "RightFoot": r"^leg right ankle",
         }),
]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


def load(c):
    path = os.path.join(SRC, c["src"])
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    # FBX textures live in a sibling folder; relink anything the importer could not find.
    if c.get("textures"):
        tex_dir = os.path.join(SRC, c["textures"])
        for img in bpy.data.images:
            if img.filepath and not os.path.exists(bpy.path.abspath(img.filepath)):
                cand = os.path.join(tex_dir, os.path.basename(img.filepath.replace("\\", "/")))
                if os.path.exists(cand):
                    img.filepath = cand
                    img.reload()


def normalize_hierarchy():
    """Bake every object transform into data and re-parent meshes with identity matrices.
    With a rotated / 0.01-scaled FBX armature node, three.js placed the joints in a different frame from the skin
    (bones Z-up, mesh Y-up), which breaks every pose offset; identity transforms remove the ambiguity."""
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for group in ([arm] if arm else []), meshes:
        if not group:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in group:
            o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if arm:
        for o in meshes:
            o.parent = arm
            o.matrix_parent_inverse.identity()
        bpy.context.view_layer.update()
        head = arm.data.bones.get("head") or arm.data.bones.get("Head")
        mz = max((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
        print("@@ check: head joint z", round(head.head_local.z, 2) if head else None, "mesh top z", round(mz, 2))


def apply_pose_as_rest():
    """Make the current pose the rest pose. Meshes are re-based on the deformed shape, keeping shape keys
    (Blender cannot apply an Armature modifier to a mesh with shape keys, so keys are rebuilt by hand)."""
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    for o in [o for o in bpy.data.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]:
        sk = o.data.shape_keys
        captured = []
        if sk:
            # Deformed coordinates of every key, captured one key at a time.
            o.show_only_shape_key = True
            for i, k in enumerate(sk.key_blocks):
                o.active_shape_key_index = i
                dg.update()
                ev = o.evaluated_get(dg)
                me = ev.to_mesh()
                captured.append((k.name, [v.co.copy() for v in me.vertices]))
                ev.to_mesh_clear()
            o.show_only_shape_key = False
            o.shape_key_clear()
        mod = next(m for m in o.modifiers if m.type == "ARMATURE")
        name, target = mod.name, mod.object
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=name)
        new = o.modifiers.new(name, "ARMATURE")
        new.object = target
        for kname, cos in captured:
            key = o.shape_key_add(name=kname, from_mix=False)
            for v, co in zip(key.data, cos):
                v.co = co
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    if arm.animation_data:
        arm.animation_data.action = None


def orient(c):
    """Rotate the whole import (degrees, XYZ) about the origin via a root Empty so it faces -Y, upright."""
    if c.get("pose_as_rest"):
        apply_pose_as_rest()
    if c.get("clear_pose"):
        # Export uses the rest pose; drop imported actions/poses so Blender shows exactly what the game gets.
        for a in [o for o in bpy.data.objects if o.type == "ARMATURE"]:
            if a.animation_data:
                a.animation_data.action = None
            for pb in a.pose.bones:
                pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
        bpy.context.view_layer.update()
    if not (c.get("rot") or c.get("clear_pose")):
        return
    if c.get("rot"):
        tops = [o for o in bpy.data.objects if o.parent is None]
        pivot = bpy.data.objects.new(c["id"] + "_root", None)
        bpy.context.scene.collection.objects.link(pivot)
        for o in tops:
            mw = o.matrix_world.copy()
            o.parent = pivot
            o.matrix_world = mw
        pivot.rotation_euler = tuple(math.radians(v) for v in c["rot"])
        bpy.context.view_layer.update()
        for o in tops:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
        bpy.data.objects.remove(pivot)
    normalize_hierarchy()
    if c.get("rest_rot") and arm:
        # Skeleton rest pose lies at an angle to its (upright) skin: rotate the rest bones so joints sit inside the
        # body. Editing the rest pose does not deform the mesh, and the exported bind matrices follow the new rest.
        from mathutils import Matrix
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        m = Matrix.Rotation(math.radians(c["rest_rot"][0]), 4, "X")
        for eb in arm.data.edit_bones:
            eb.transform(m)
        bpy.ops.object.mode_set(mode="OBJECT")


def rename(c):
    import re
    for a in [o for o in bpy.data.objects if o.type == "ARMATURE"]:
        for old, new in c.get("bones", {}).items():
            b = a.data.bones.get(old)
            if b:
                b.name = new  # also renames the matching vertex groups
        # Pattern mapping for rigs with long / suffixed names: {"LeftForeArm": r"^arm left elbow"}.
        for new, pattern in c.get("bone_patterns", {}).items():
            b = next((b for b in a.data.bones if re.search(pattern, b.name)), None)
            if b and not a.data.bones.get(new):
                b.name = new
    keymap = c.get("keys")
    if keymap:
        keep = set(keymap.values()) | {"Basis"}
        for o in bpy.data.objects:
            sk = o.type == "MESH" and o.data.shape_keys
            if sk:
                for k in sk.key_blocks:
                    if k.name in keymap:
                        k.name = keymap[k.name]
                # Unmapped visemes etc. are never driven by the game and cost ~130 KB each on a dense face.
                for k in [k for k in sk.key_blocks if k.name not in keep]:
                    o.shape_key_remove(k)


def autorig(c):
    """Static humanoid (no skeleton): build a standard skeleton from the body's proportions and bind it with
    automatic (heat) weights so it can walk. Assumes upright, facing -Y, arms out (T- or A-pose)."""
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in [o for o in bpy.data.objects if o.type not in ("MESH",)]:
        bpy.data.objects.remove(o)
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if c.get("rest_turn"):
        for o in meshes:
            o.data.transform(Matrix.Rotation(math.radians(c["rest_turn"]), 4, "Z"))
    verts = [v.co.copy() for o in meshes for v in o.data.vertices]
    zmin = min(v.z for v in verts); zmax = max(v.z for v in verts)
    cx = sum(v.x for v in verts) / len(verts)
    for o in meshes:  # feet on the ground, centred on x
        o.data.transform(Matrix.Translation((-cx, 0, -zmin)))
    verts = [v.co.copy() for o in meshes for v in o.data.vertices]
    h = zmax - zmin
    core = [v for v in verts if abs(v.x) < 0.08 * h]
    yc = sorted(v.y for v in core)[len(core) // 2] if core else 0.0

    def tip(sign):  # farthest lateral point above the hips = hand tip
        side = [v for v in verts if v.x * sign > 0.15 * h and v.z > 0.35 * h]
        return max(side, key=lambda v: v.x * sign) if side else Vector((sign * 0.45 * h, yc, 0.8 * h))

    P = lambda x, z, y=None: Vector((x, yc if y is None else y, z))
    J = {
        "Hips": P(0, 0.52 * h), "Spine": P(0, 0.58 * h), "Spine1": P(0, 0.65 * h), "Spine2": P(0, 0.72 * h),
        "Neck": P(0, 0.84 * h), "Head": P(0, 0.885 * h), "HeadTop_End": P(0, h),
    }
    for sign, s in ((1, "Left"), (-1, "Right")):
        sh = P(sign * 0.19 * h, 0.81 * h)
        t = tip(sign)
        J[f"{s}Shoulder"] = P(sign * 0.06 * h, 0.81 * h)
        J[f"{s}Arm"] = sh
        J[f"{s}ForeArm"] = sh.lerp(t, 0.47) + Vector((0, 0.01 * h, 0))
        J[f"{s}Hand"] = sh.lerp(t, 0.86)
        J[f"{s}HandEnd"] = t
        J[f"{s}UpLeg"] = P(sign * 0.09 * h, 0.5 * h)
        J[f"{s}Leg"] = P(sign * 0.095 * h, 0.27 * h)
        J[f"{s}Foot"] = P(sign * 0.1 * h, 0.045 * h)
        J[f"{s}ToeBase"] = P(sign * 0.1 * h, 0.01 * h, yc - 0.09 * h)
    chain = [("Hips", None, "Spine"), ("Spine", "Hips", "Spine1"), ("Spine1", "Spine", "Spine2"), ("Spine2", "Spine1", "Neck"),
             ("Neck", "Spine2", "Head"), ("Head", "Neck", "HeadTop_End")]
    for s in ("Left", "Right"):
        chain += [(f"{s}Shoulder", "Spine2", f"{s}Arm"), (f"{s}Arm", f"{s}Shoulder", f"{s}ForeArm"), (f"{s}ForeArm", f"{s}Arm", f"{s}Hand"),
                  (f"{s}Hand", f"{s}ForeArm", f"{s}HandEnd"), (f"{s}UpLeg", "Hips", f"{s}Leg"), (f"{s}Leg", f"{s}UpLeg", f"{s}Foot"),
                  (f"{s}Foot", f"{s}Leg", f"{s}ToeBase")]
    arm_data = bpy.data.armatures.new("Armature")
    arm = bpy.data.objects.new("Armature", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, tail in chain:
        eb = arm_data.edit_bones.new(name)
        eb.head = J[name]
        eb.tail = J[tail] if tail in J and (J[tail] - J[name]).length > 1e-4 else J[name] + Vector((0, 0, 0.05 * h))
        if name.endswith("ToeBase") or name.endswith("Foot"):
            pass
        if parent:
            eb.parent = arm_data.edit_bones[parent]
    for s in ("Left", "Right"):  # toe bone (leaf)
        eb = arm_data.edit_bones.new(f"{s}ToeEnd")
        eb.head = J[f"{s}ToeBase"]; eb.tail = J[f"{s}ToeBase"] + Vector((0, -0.05 * h, 0))
        eb.parent = arm_data.edit_bones[f"{s}Foot"]
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # Heat weighting can fail on messy meshes; anything left unweighted falls back to envelope weights.
    for o in meshes:
        if not any(len(v.groups) for v in o.data.vertices[:1]) and all(not v.groups for v in o.data.vertices):
            bpy.ops.object.select_all(action="DESELECT")
            o.select_set(True); arm.select_set(True)
            bpy.context.view_layer.objects.active = arm
            bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")
    fix_arm_weights(meshes, J, h)
    print("@@ autorig", c["id"], "height", round(h, 2), "pose", "T" if (tip(1).z > 0.7 * h) else "A")


def _seg(p, a, b):
    """Distance from p to segment ab, and how far along it (0..1)."""
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (a + ab * t - p).length, t


def fix_arm_weights(meshes, J, h):
    """Heat weighting is computed per object, so on separate clothing (a T-shirt) the sleeves often end up bound
    to the chest: raise the arm and the bare arm leaves its sleeve behind. Everything that is geometrically part
    of an arm (closer to the arm chain than to the body, and out past the armpit) is re-bound to the arm bones,
    blending smoothly across the shoulder and the elbow, on every mesh alike (skin and cloth move together)."""
    body = [("Spine2", J["Spine2"], J["Neck"]), ("Spine1", J["Spine1"], J["Spine2"]), ("Spine", J["Spine"], J["Spine1"]),
            ("Hips", J["Hips"], J["Spine"]), ("Neck", J["Neck"], J["Head"])]
    for s in ("Left", "Right"):
        body += [(f"{s}UpLeg", J[f"{s}UpLeg"], J[f"{s}Leg"]), (f"{s}Leg", J[f"{s}Leg"], J[f"{s}Foot"])]
    fixed = 0
    for o in meshes:
        groups = {g.name: g for g in o.vertex_groups}
        def group(name):
            if name not in groups:
                groups[name] = o.vertex_groups.new(name=name)
            return groups[name]
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            for sign, s in ((1, "Left"), (-1, "Right")):
                if p.x * sign < 0.1 * h:
                    continue
                sh, el, hd, tp = J[f"{s}Arm"], J[f"{s}ForeArm"], J[f"{s}Hand"], J[f"{s}HandEnd"]
                d_up, t_up = _seg(p, sh, el)
                d_lo, t_lo = _seg(p, el, hd)
                d_hd, _ = _seg(p, hd, tp)
                d_arm = min(d_up, d_lo, d_hd)
                d_body = min(_seg(p, a, b)[0] for _, a, b in body)
                # Share of the arm: 1 on the arm, 0 on the torso, a smooth blend round the armpit / shoulder so
                # the cloth there stretches evenly instead of tearing.
                r = d_arm / max(d_arm + d_body, 1e-9)
                share = max(0.0, min(1.0, (0.62 - r) / 0.24))
                share = share * share * (3 - 2 * share)
                if share <= 0.0:
                    continue
                w = {}
                if d_hd <= min(d_up, d_lo):
                    w[f"{s}Hand"] = 1.0
                elif d_up <= d_lo:
                    # Upper arm; the last 25% blends into the forearm, the first 20% back into the chest.
                    k = max(0.0, (t_up - 0.75) / 0.25) * 0.5
                    c = max(0.0, (0.2 - t_up) / 0.2) * 0.5
                    w[f"{s}Arm"] = 1.0 - k - c
                    w[f"{s}ForeArm"] = k
                    w["Spine2"] = c
                else:
                    k = max(0.0, (0.25 - t_lo) / 0.25) * 0.5
                    w[f"{s}ForeArm"] = 1.0 - k
                    w[f"{s}Arm"] = k
                old = [(o.vertex_groups[g.group].name, g.weight) for g in v.groups]
                tot = sum(wt for _, wt in old) or 1.0
                mix = {}
                for name, wt in old:
                    mix[name] = mix.get(name, 0.0) + (wt / tot) * (1 - share)
                for name, wt in w.items():
                    mix[name] = mix.get(name, 0.0) + wt * share
                for g in list(v.groups):
                    o.vertex_groups[g.group].remove([v.index])
                for name, wt in mix.items():
                    if wt > 1e-3:
                        group(name).add([v.index], wt, "REPLACE")
                fixed += 1
                break
    print("@@ arm weights re-bound on", fixed, "vertices")


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def slim(c):
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    total = sum(tri_count(o) for o in meshes)
    if c.get("max_tris") and total > c["max_tris"]:
        ratio = c["max_tris"] / total
        for o in meshes:
            if not (o.data.shape_keys and len(o.data.shape_keys.key_blocks)):
                d = o.modifiers.new("decimate", "DECIMATE")
                d.ratio = ratio
                # Keep the decimation ahead of the armature so skinning still deforms the reduced mesh.
                while o.modifiers.find("decimate") > 0:
                    bpy.context.view_layer.objects.active = o
                    bpy.ops.object.modifier_move_up(modifier="decimate")
    for img in bpy.data.images:
        if img.size[0] > 1024 or img.size[1] > 1024:
            s = 1024 / max(img.size)
            img.scale(max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s)))


def export(c):
    d = os.path.join(OUT, c["id"])
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, c["id"] + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_yup=True, export_apply=True,
        export_animations=False, export_cameras=False, export_lights=False,
        export_morph_normal=False,  # expressions are subtle; halves morph data
        export_image_format="AUTO", export_image_quality=82,
    )
    return path


def thumbnail(c):
    """Head-and-shoulders portrait from the front (-Y), transparent background."""
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and not o.hide_render]
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in meshes:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    h = mx.z - mn.z
    cam = bpy.data.objects.new("thumb_cam", bpy.data.cameras.new("thumb_cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = h * 0.55
    cam.location = ((mn.x + mx.x) / 2, mn.y - 5, mx.z - h * 0.26)
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    for rot, energy in (((math.radians(55), 0, math.radians(-30)), 3.5), ((math.radians(70), 0, math.radians(140)), 1.5)):
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        sun.data.energy = energy
        sun.rotation_euler = rot
        sc.collection.objects.link(sun)
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = 320
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = os.path.join(OUT, c["id"], "thumb.png")
    bpy.ops.render.render(write_still=True)


only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for c in CHARS:
    if only and c["id"] not in only:
        continue
    reset()
    load(c)
    def droppable(o):
        names = [o.name.lower()] + ([m.name.lower() for m in o.data.materials if m] if o.type == "MESH" else [])
        return any(k in n for k in c.get("drop", []) for n in names)
    for o in [o for o in bpy.data.objects if droppable(o)]:
        bpy.data.objects.remove(o)  # e.g. a weapon baked into a character rip (matched by object or material name)
    for o in [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Icosphere") and len(o.data.polygons) == 80]:
        bpy.data.objects.remove(o)  # bone display shape created by the glTF importer; never part of the character
    if c.get("autorig"):
        autorig(c)
    else:
        orient(c)
        rename(c)
    slim(c)
    path = export(c)
    tris = sum(tri_count(o) for o in bpy.data.objects if o.type == "MESH")
    thumbnail(c)
    print("@@ CHAR", c["id"], "->", os.path.relpath(path, ROOT), round(os.path.getsize(path) / 1e6, 2), "MB, source tris", tris)

