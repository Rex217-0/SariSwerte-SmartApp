# SariSwerte_UNIFIED_INDAY_Store.py
# Blender 4.x - Run: blender --background --python SariSwerte_UNIFIED_INDAY_Store.py
# Output: SariSwerte_INDAY.glb - INDAY + Modern Store, ready for ThreeJS + TalkingHead + SeaLLM
#
# Everything in one file, one export, as requested:
#   - INDAY body (Grab3D woman base proportions), A-pose, 1.70 m, standing
#   - Morena skin, long straight black hair, emerald sando with gold trim, INDAY name tag
#   - WORKING MOUTH: real shape keys named for TalkingHead / Oculus visemes + ARKit jawOpen
#   - Modern SariSwerte store: emerald + white walls, grey tile floor, 3 LED shelves per side
#     with the named products, glass counter, tinapay, eggs, POS, card machine, GCash/Maya QR,
#     emerald+gold LED sign, 5kg Sinandomeng rice
#
# Object naming contract with the web app:
#   "INDAY_*"  -> the character (extracted by the Three.js loader)
#   "Store_*"  -> the shop (the web app renders its own richer store, but this keeps the GLB complete)


import bpy
import math
import os
from mathutils import Vector


# ============ 0. OUTPUT PATH (absolute: "//" is unset when no .blend is saved) ============
try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:
    HERE = os.getcwd()
# Write straight into the web app's static folder so there is one canonical GLB.
PUBLIC_MODELS = os.path.normpath(os.path.join(HERE, "..", "public", "models"))
os.makedirs(PUBLIC_MODELS, exist_ok=True)
OUT_GLB = os.path.join(PUBLIC_MODELS, "SariSwerte_INDAY.glb")


# ============ 1. LINIS ============
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.curves):
    for b in list(coll):
        if b.users == 0:
            coll.remove(b)


# ============ helpers ============
def new_mat(name, color, rough=0.55, metal=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, alpha)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND'
    return m


def box(name, size, loc, color, scale=(1, 1, 1), rot=(0, 0, 0), rough=0.6, metal=0.0):
    bpy.ops.mesh.primitive_cube_add(size=size, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    o.data.materials.append(new_mat(name + "_Mat", color, rough, metal))
    return o


def label(text, loc, size, color, rot=(math.radians(90), 0, 0), align='CENTER'):
    """Text -> mesh, so product names and the shop sign are real geometry."""
    bpy.ops.object.text_add(location=loc)
    t = bpy.context.active_object
    t.data.body = text
    t.data.size = size
    t.data.align_x = align
    t.data.align_y = 'CENTER'
    t.rotation_euler = rot
    t.data.materials.append(new_mat(t.name + "_Mat", color, 0.5))
    bpy.ops.object.convert(target='MESH')
    return bpy.context.active_object


# ============ 2. KATAWAN NI INDAY - Grab3D Base / Woman Base ============
# A-pose, 1.70m, standing, HINDI squat, HINDI anime
def build_skeleton():
    V = []
    def add(x, y, z):
        V.append(Vector((x, y, z))); return len(V) - 1
    pelvis = add(0, 0, 0.95); waist = add(0, 0, 1.12); chest_low = add(0, 0, 1.28)
    chest_high = add(0, 0, 1.40); neck_base = add(0, 0, 1.48); head_base = add(0, 0, 1.55); head_top = add(0, 0, 1.70)
    breast_L = add(-0.08, -0.10, 1.28); breast_R = add(0.08, -0.10, 1.28)
    shoulder_L = add(-0.15, 0, 1.40); shoulder_R = add(0.15, 0, 1.40)
    hip_L = add(-0.11, 0, 0.92); hip_R = add(0.11, 0, 0.92)
    thigh_L = add(-0.11, 0, 0.82); knee_L = add(-0.11, 0, 0.48); ankle_L = add(-0.11, 0, 0.08); toe_L = add(-0.11, 0.12, 0.03)
    thigh_R = add(0.11, 0, 0.82); knee_R = add(0.11, 0, 0.48); ankle_R = add(0.11, 0, 0.08); toe_R = add(0.11, 0.12, 0.03)
    # Arms in a true A-pose: ~50 degrees below horizontal, with a slight elbow bend.
    # A horizontal arm chain would read as a T-pose, which the brief rules out.
    upperarm_L = add(-0.253, 0, 1.277); elbow_L = add(-0.382, 0.010, 1.124); wrist_L = add(-0.498, 0.004, 0.986); hand_L = add(-0.556, 0.0, 0.917)
    upperarm_R = add(0.253, 0, 1.277); elbow_R = add(0.382, 0.010, 1.124); wrist_R = add(0.498, 0.004, 0.986); hand_R = add(0.556, 0.0, 0.917)
    edges = [(pelvis, waist), (waist, chest_low), (chest_low, chest_high), (chest_high, neck_base), (neck_base, head_base), (head_base, head_top),
             (chest_low, breast_L), (chest_low, breast_R), (chest_high, shoulder_L), (chest_high, shoulder_R), (pelvis, hip_L), (pelvis, hip_R),
             (hip_L, thigh_L), (thigh_L, knee_L), (knee_L, ankle_L), (ankle_L, toe_L), (hip_R, thigh_R), (thigh_R, knee_R), (knee_R, ankle_R), (ankle_R, toe_R),
             (shoulder_L, upperarm_L), (upperarm_L, elbow_L), (elbow_L, wrist_L), (wrist_L, hand_L),
             (shoulder_R, upperarm_R), (upperarm_R, elbow_R), (elbow_R, wrist_R), (wrist_R, hand_R)]
    radii = [(0.14, 0.14), (0.11, 0.11), (0.13, 0.13), (0.13, 0.13), (0.045, 0.045), (0.075, 0.075), (0.09, 0.09),
             (0.06, 0.06), (0.06, 0.06), (0.055, 0.055), (0.055, 0.055), (0.10, 0.10), (0.10, 0.10), (0.09, 0.09),
             (0.06, 0.06), (0.04, 0.04), (0.03, 0.03), (0.09, 0.09), (0.06, 0.06), (0.04, 0.04), (0.03, 0.03),
             (0.045, 0.045), (0.04, 0.04), (0.028, 0.028), (0.035, 0.035),
             (0.045, 0.045), (0.04, 0.04), (0.028, 0.028), (0.035, 0.035)]
    return V, edges, radii, pelvis


V, edges, radii, root = build_skeleton()
mesh = bpy.data.meshes.new("INDAY_BodyMesh")
mesh.from_pydata(V, edges, [])
mesh.update()
inday = bpy.data.objects.new("INDAY_Body", mesh)
bpy.context.collection.objects.link(inday)
bpy.context.view_layer.objects.active = inday
inday.select_set(True)
skin = inday.modifiers.new(name="Skin", type='SKIN')
skin.use_smooth_shade = True
skin.branch_smoothing = 0.4
layer = inday.data.skin_vertices[0]
for i, (rx, ry) in enumerate(radii):
    layer.data[i].radius = (rx, ry)
layer.data[root].use_root = True
sub = inday.modifiers.new(name="Subdivision", type='SUBSURF')
sub.levels = 2
sub.render_levels = 2

# Modifiers must be applied BEFORE shape keys: Blender forbids both on one mesh.
bpy.context.view_layer.objects.active = inday
for m in list(inday.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)

for p in inday.data.polygons:
    p.use_smooth = True

# ============ 3. BALAT NI INDAY - Morena Filipina ============
mat_skin = new_mat("INDAY_Skin_Morena", (0.55, 0.38, 0.28), rough=0.55)
inday.data.materials.append(mat_skin)

# A Basis key now, so the mouth keys merge cleanly when the parts are joined.
inday.shape_key_add(name='Basis', from_mix=False)


# ============ 4. MUKHA - eyes + brows so there is a face to speak from ============
FACE_Y = -0.088
HEAD_Z = 1.618
parts = []

eye_mat = new_mat("INDAY_Eye_DarkBrown", (0.10, 0.055, 0.03), rough=0.18)
white_mat = new_mat("INDAY_Eye_White", (0.94, 0.93, 0.90), rough=0.22)
for side in (-1, 1):
    suffix = "_L" if side < 0 else "_R"

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.0145,
                                         location=(side * 0.036, FACE_Y + 0.012, HEAD_Z + 0.016))
    e = bpy.context.active_object
    e.name = "INDAY_Eye" + suffix
    e.scale = (1.0, 0.65, 1.0)
    e.data.materials.append(eye_mat)
    parts.append(e)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, radius=0.0165,
                                         location=(side * 0.036, FACE_Y + 0.006, HEAD_Z + 0.016))
    w = bpy.context.active_object
    w.name = "INDAY_EyeWhite" + suffix
    w.scale = (1.0, 0.5, 0.8)
    w.data.materials.append(white_mat)
    parts.append(w)

    b = box("INDAY_Brow" + suffix, 1,
            (side * 0.037, FACE_Y + 0.004, HEAD_Z + 0.045), (0.03, 0.02, 0.015),
            scale=(0.030, 0.006, 0.004))
    parts.append(b)

bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.012,
                                     location=(0, FACE_Y + 0.004, HEAD_Z - 0.008))
nose = bpy.context.active_object
nose.name = "INDAY_Nose"
nose.scale = (0.75, 0.9, 1.1)
nose.data.materials.append(mat_skin)
parts.append(nose)


# ============ 5. BIBIG - real shape keys for lip-sync ============
# A mouth cavity mesh whose vertices are deformed by named shape keys. The names
# match what ThreeJS/TalkingHead look for: Oculus visemes + ARKit jawOpen.
mouth_mat = new_mat("INDAY_Mouth_Cavity", (0.16, 0.045, 0.05), rough=0.45)

bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=1.0,
                                     location=(0, FACE_Y + 0.002, HEAD_Z - 0.038))
mouth = bpy.context.active_object
mouth.name = "INDAY_Mouth"
mouth.scale = (0.030, 0.011, 0.0105)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
mouth.data.materials.append(mouth_mat)
for p in mouth.data.polygons:
    p.use_smooth = True

mouth.shape_key_add(name='Basis', from_mix=False)

# name -> (scale_x, scale_z, shift_z). Shape keys are relative to the Basis.
VISEMES = {
    'viseme_sil': (1.00, 1.00, 0.000),
    'viseme_aa':  (0.92, 3.40, -0.006),
    'viseme_O':   (0.68, 2.60, -0.003),
    'viseme_U':   (0.58, 1.90, -0.002),
    'viseme_E':   (1.16, 1.70, -0.001),
    'viseme_I':   (1.10, 1.30, 0.000),
    'viseme_PP':  (1.04, 0.22, 0.000),
    'viseme_FF':  (1.00, 0.45, 0.000),
    'viseme_DD':  (0.96, 1.15, 0.000),
    'viseme_SS':  (1.00, 0.55, 0.000),
    'viseme_TH':  (0.95, 0.90, 0.000),
    'viseme_nn':  (0.98, 0.80, 0.000),
    'viseme_kk':  (0.94, 1.05, 0.000),
    'viseme_RR':  (0.90, 1.20, 0.000),
    'viseme_CH':  (0.85, 1.35, 0.000),
    'jawOpen':    (0.90, 3.10, -0.005),
}

base_co = [v.co.copy() for v in mouth.data.vertices]
for key_name, (sx, sz, dz) in VISEMES.items():
    kb = mouth.shape_key_add(name=key_name, from_mix=False)
    for i, co in enumerate(base_co):
        kb.data[i].co = (co.x * sx, co.y, co.z * sz + dz)

parts.append(mouth)


# ============ 6. BUHOK NI INDAY - Long Straight Black ============
hair_mat = new_mat("INDAY_Hair_Black", (0.02, 0.02, 0.02), rough=0.38)

bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.098,
                                     location=(0, 0.012, HEAD_Z + 0.012))
cap = bpy.context.active_object
cap.name = "INDAY_HairCap"
cap.scale = (1.02, 1.06, 1.05)
cap.data.materials.append(hair_mat)
parts.append(cap)

back = box("INDAY_Hair_Back", 1, (0, 0.062, HEAD_Z - 0.26), (0.02, 0.02, 0.02),
           scale=(0.20, 0.085, 0.50))
parts.append(back)

for side in (-1, 1):
    s = box("INDAY_Hair_Strand" + ("_L" if side < 0 else "_R"), 1,
            (side * 0.086, FACE_Y + 0.052, HEAD_Z - 0.15), (0.02, 0.02, 0.02),
            scale=(0.042, 0.055, 0.40))
    parts.append(s)


# ============ 7. DAMIT NI INDAY - Emerald Green SANDO + Gold ============
# A sando is sleeveless: the torso is covered but both shoulders and the whole
# arm stay bare, held up by two thin straps. The earlier blouse wrapped the
# torso all the way to the shoulder line, which read as a sleeved top.
sando_mat = new_mat("INDAY_Sando_EmeraldGreen", (0.02, 0.37, 0.27), rough=0.62)
gold_mat = new_mat("INDAY_Gold", (0.98, 0.75, 0.14), rough=0.22, metal=0.9)

# Torso panel stops below the shoulder line (shoulders sit at z=1.40) so the
# collarbone and deltoids show.
bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=1.0, depth=1.0, location=(0, 0, 1.205))
sando = bpy.context.active_object
sando.name = "INDAY_Sando"
sando.scale = (0.172, 0.142, 0.245)
sando.data.materials.append(sando_mat)
parts.append(sando)

# Two straps over the shoulders: the feature that makes it a sando.
for side in (-1, 1):
    strap = box(f"INDAY_Sando_Strap_{'L' if side < 0 else 'R'}", 1,
                (side * 0.093, 0, 1.392), (0.02, 0.37, 0.27),
                scale=(0.038, 0.052, 0.135), rough=0.62)
    parts.append(strap)

# Gold neckline trim, sitting on the sando edge rather than around the neck.
bpy.ops.mesh.primitive_torus_add(location=(0, 0, 1.328), major_radius=0.088, minor_radius=0.006)
neckline = bpy.context.active_object
neckline.name = "INDAY_Sando_Neckline_Gold"
neckline.data.materials.append(gold_mat)
parts.append(neckline)

# Gold hem at the waist keeps the emerald+gold identity of the store.
bpy.ops.mesh.primitive_torus_add(location=(0, 0, 1.084), major_radius=0.118, minor_radius=0.007)
hem = bpy.context.active_object
hem.name = "INDAY_Sando_Hem_Gold"
hem.data.materials.append(gold_mat)
parts.append(hem)

skirt = box("INDAY_Skirt", 1, (0, 0, 0.80), (0.09, 0.11, 0.13),
            scale=(0.20, 0.16, 0.24))
parts.append(skirt)

tag = box("INDAY_NameTag", 1, (0.062, FACE_Y + 0.062, 1.30), (0.97, 0.97, 0.97),
          scale=(0.052, 0.004, 0.026), rough=0.4)
parts.append(tag)
tag_text = label("INDAY", (0.062, FACE_Y + 0.058, 1.295), 0.017, (0.02, 0.37, 0.27))
parts.append(tag_text)


# ============ 8. JOIN the character into one mesh so morphs live on the body ============
bpy.ops.object.select_all(action='DESELECT')
for p in parts:
    p.select_set(True)
inday.select_set(True)
bpy.context.view_layer.objects.active = inday
bpy.ops.object.join()
inday = bpy.context.active_object
inday.name = "INDAY_Character"


# ============ 9. MODERNO NA SARISWERTE STORE - Buong Lugar ============
EMERALD = (0.02, 0.37, 0.27)
GOLD = (0.98, 0.75, 0.14)

box("Store_Floor", 1, (0, 0, -0.01), (0.84, 0.85, 0.87), scale=(12, 8, 0.02), rough=0.3)
box("Store_BackWall", 1, (0, 3.0, 1.75), EMERALD, scale=(12, 0.12, 3.5))
box("Store_BackWall_Upper", 1, (0, 3.0, 3.2), (0.97, 0.98, 0.99), scale=(12, 0.14, 1.0))
box("Store_GoldTrim", 1, (0, 2.94, 2.62), GOLD, scale=(12, 0.16, 0.05), metal=0.9, rough=0.25)
for sx in (-5.5, 5.5):
    box(f"Store_SideWall_{sx}", 1, (sx, 0, 1.75), (0.97, 0.98, 0.99), scale=(0.12, 8.5, 3.5))

PRODUCTS = [
    ("Century Tuna", (0.12, 0.23, 0.54)),
    ("Lucky Me", (0.86, 0.15, 0.15)),
    ("Piattos", (0.08, 0.50, 0.24)),
    ("Nova", (0.72, 0.11, 0.11)),
    ("Skyflakes", (0.89, 0.91, 0.94)),
    ("Coke", (0.72, 0.11, 0.11)),
    ("Sprite", (0.09, 0.64, 0.29)),
]

for side in (-3.1, 3.1):
    for lvl in range(3):
        z = 0.62 + lvl * 0.62
        box(f"Store_Shelf_{side}_{lvl}", 1, (side, -2.15, z), (1, 1, 1), scale=(1.9, 0.46, 0.05))
        box(f"Store_LED_{side}_{lvl}", 1, (side, -1.94, z - 0.035), GOLD, scale=(1.78, 0.03, 0.018))
        row = PRODUCTS[lvl::3]
        for j, (pname, pcol) in enumerate(row):
            px = side - 0.62 + j * 0.62
            box(f"Store_Product_{side}_{lvl}_{pname.replace(' ', '')}", 1, (px, -2.10, z + 0.12),
                pcol, scale=(0.17, 0.11, 0.22))
            label(pname, (px, -2.035, z + 0.13), 0.028, (1, 1, 1))

    for px in (-0.95, 0.95):
        box(f"Store_ShelfPost_{side}_{px}", 1, (side + px, -2.15, 1.15), EMERALD, scale=(0.06, 0.46, 2.3))
    box(f"Store_ShelfValance_{side}", 1, (side, -1.93, 2.28), GOLD, scale=(1.9, 0.03, 0.08), metal=0.9, rough=0.25)

box("Store_Counter", 1, (0, -0.55, 0.45), (1, 1, 1), scale=(2.6, 0.72, 0.9))
box("Store_Counter_Kick", 1, (0, -0.55, 0.06), EMERALD, scale=(2.6, 0.72, 0.12))
box("Store_Counter_GoldTrim", 1, (0, -0.55, 0.905), GOLD, scale=(2.64, 0.76, 0.03), metal=0.9, rough=0.25)
box("Store_GlassDisplay", 1, (0, -0.55, 1.15), (0.65, 0.95, 0.82), scale=(1.7, 0.52, 0.44), rough=0.05)

for i in range(6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.055,
                                         location=(-0.42 + (i % 3) * 0.17, -0.68 + (i // 3) * 0.18, 1.02))
    bun = bpy.context.active_object
    bun.name = f"Store_Tinapay_{i}"
    bun.scale = (1.0, 0.72, 1.15)
    bun.data.materials.append(new_mat(f"Store_Tinapay_{i}_Mat", (0.79, 0.55, 0.29), rough=0.85))

for i in range(6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=10, radius=0.037,
                                         location=(0.16 + (i % 3) * 0.11, -0.62 + (i // 3) * 0.14, 1.02))
    egg = bpy.context.active_object
    egg.name = f"Store_Itlog_{i}"
    egg.scale = (1.0, 1.28, 1.0)
    egg.data.materials.append(new_mat(f"Store_Itlog_{i}_Mat", (0.96, 0.90, 0.81), rough=0.6))

box("Store_POS_Base", 1, (0.78, -0.55, 0.93), (0.08, 0.09, 0.11), scale=(0.16, 0.13, 0.03))
box("Store_POS_Stem", 1, (0.78, -0.55, 1.02), (0.08, 0.09, 0.11), scale=(0.04, 0.04, 0.14))
box("Store_POS_Screen", 1, (0.78, -0.55, 1.15), (0.05, 0.15, 0.45), scale=(0.24, 0.02, 0.17))
box("Store_CardMachine", 1, (1.02, -0.72, 0.98), (0.08, 0.09, 0.11), scale=(0.13, 0.10, 0.07))

for qx, qname, qcol in ((-1.05, "GCash", (0.0, 0.44, 0.88)), (-0.72, "Maya", (0.06, 0.62, 0.35))):
    box(f"Store_QR_{qname}", 1, (qx, -0.80, 0.97), (0.97, 0.97, 0.97), scale=(0.15, 0.006, 0.19))
    box(f"Store_QR_{qname}_Header", 1, (qx, -0.805, 1.04), qcol, scale=(0.15, 0.004, 0.05))
    label(qname, (qx, -0.808, 1.045), 0.022, (1, 1, 1))
    box(f"Store_QR_{qname}_Stand", 1, (qx, -0.80, 0.94), (0.72, 0.76, 0.80), scale=(0.16, 0.04, 0.02))

box("Store_RiceSack", 1, (-0.86, -0.02, 0.16), (0.95, 0.92, 0.84), scale=(0.44, 0.34, 0.32), rough=0.95)
box("Store_RiceSack_Band", 1, (-0.86, -0.02, 0.20), EMERALD, scale=(0.45, 0.35, 0.11))
label("SINANDOMENG", (-0.86, -0.19, 0.21), 0.045, GOLD)
label("5 KG", (-0.86, -0.19, 0.13), 0.040, EMERALD)

box("Store_Sign_SariSwerte", 1, (0, 2.92, 2.62), EMERALD, scale=(4.4, 0.10, 1.1))
box("Store_Sign_GoldBorder", 1, (0, 2.86, 2.62), GOLD, scale=(4.5, 0.06, 1.18), metal=0.9, rough=0.25)
label("SariSwerte", (0, 2.84, 2.72), 0.40, GOLD)
label("Tindahan • Essentials • Daily Needs", (0, 2.84, 2.44), 0.115, (1, 1, 1))

for cz in (-2.2, 0.6):
    box(f"Store_CeilingPanel_{cz}", 1, (0, cz, 3.45), (1.0, 0.96, 0.88), scale=(6.2, 0.34, 0.04))


# ============ 10. EXPORT GLB para sa Web ============
# export_apply must stay False: applying modifiers on export would discard the
# shape keys, and the mouth would stop moving.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format='GLB',
    export_apply=False,
    export_morph=True,
    export_morph_normal=True,
    export_yup=True,
    use_selection=False,
)

size_mb = os.path.getsize(OUT_GLB) / (1024 * 1024)
print(f"DONE: {OUT_GLB} ({size_mb:.2f} MB) - INDAY + Modern Store, ready for ThreeJS")
