"""Проба D3-A: ноутбук Адама (47) процедурно, скриптом Blender (bpy), без сети.

Статус: проба для PIPELINE_PROPOSAL.md (предложено, не канон). Марка и модель ноутбука
в каноне не заданы — корпус обобщённый «ноутбук 14" 2009 года», без логотипов (раздел 12).
Единственная канонная деталь — инвентарная наклейка HEXON на дне (A-283, L947).

Запуск (Blender 5.1, без окна):
  blender -b --factory-startup -P design/blender/props/laptop_47_probe.py -- <папка_вывода> <наклейка.png>
По умолчанию: E:/Projects/bunker-media/probes/3d/47_laptop/ и sticker_47_v3_rgba.png.

Выход: laptop_47_probe.glb (крышка — отдельный узел lid_hinge, её можно открывать в игре),
render_front.png, render_bottom.png, stats.txt. Медиа — вне git (ART-10).
"""

import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
OUT = argv[0] if argv else 'E:/Projects/bunker-media/probes/3d/47_laptop'
STICKER = (
    argv[1]
    if len(argv) > 1
    else 'E:/Projects/bunker-media/assets/07_evidence_3d/47_laptop_sticker/sticker_47_v3_rgba.png'
)
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# --- Размеры, метры: ноутбук 14" 2009 года ---
W, D, H = 0.340, 0.240, 0.024  # корпус
LID_T = 0.008  # толщина крышки
OPEN = math.radians(-108)  # угол крышки


def material(name, color, rough, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit[0], 1.0)
        b.inputs['Emission Strength'].default_value = emit[1]
    return m


# Материалы 2009 года (раздел 15 п. 4): матовый и полуматовый пластик, без «игрового» блеска.
M_SHELL = material('shell_plastic_matte', (0.045, 0.047, 0.052), 0.62)
M_DECK = material('deck_plastic_satin', (0.06, 0.062, 0.068), 0.48)
M_KEY = material('key_plastic', (0.025, 0.025, 0.028), 0.55)
M_PAD = material('touchpad', (0.05, 0.052, 0.056), 0.38)
M_RUBBER = material('rubber_feet', (0.015, 0.015, 0.015), 0.9)
M_DARK = material('ports_vents', (0.006, 0.006, 0.007), 0.8)
M_HINGE = material('hinge_metal', (0.35, 0.35, 0.36), 0.35, metal=1.0)
M_SCREEN = material('screen_glass', (0.01, 0.015, 0.025), 0.12, emit=((0.05, 0.09, 0.16), 0.6))
M_LED = material('led', (0.2, 0.6, 0.25), 0.4, emit=((0.2, 1.0, 0.3), 2.0))


def sticker_material(path):
    m = bpy.data.materials.new('sticker_47_hexon')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(path)
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.7
    for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
        try:
            setattr(m, attr, val)
        except (AttributeError, TypeError):
            pass
    return m


root = bpy.data.objects.new('laptop_47', None)
scene.collection.objects.link(root)


def place(o, parent, loc, rot=None):
    o.parent = parent
    o.location = loc
    if rot:
        o.rotation_euler = rot
    return o


def box(name, size, loc, mat, parent, bevel=0.0, segs=3):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = 'ANGLE'
    o.data.materials.append(mat)
    return place(o, parent, loc)


def cyl(name, r, depth, loc, mat, parent, rot=None, verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    return place(o, parent, loc, rot)


def array(o, count, offset, axis):
    mod = o.modifiers.new(f'array_{axis}', 'ARRAY')
    mod.count = count
    mod.use_relative_offset = False
    mod.use_constant_offset = True
    v = [0.0, 0.0, 0.0]
    v['xyz'.index(axis)] = offset
    mod.constant_offset_displace = v
    return o


# --- Корпус (низ) ---
box('base_shell', (W, D, H), (0, 0, H / 2), M_SHELL, root, bevel=0.006, segs=4)
box('base_deck', (W - 0.012, D - 0.012, 0.001), (0, 0, H + 0.0002), M_DECK, root, bevel=0.003)

# Клавиатура: 14 × 5 клавиш + пробел, шаг 19 мм.
PITCH, KEY = 0.019, 0.0165
kx0 = -6.5 * PITCH
ky0 = 0.012
key = box('keys', (KEY, KEY, 0.003), (kx0, ky0 + 4 * PITCH, H + 0.0015), M_KEY, root, bevel=0.0012)
array(key, 14, PITCH, 'x')
array(key, 4, -PITCH, 'y')
box('key_space', (6 * PITCH - 0.0025, KEY, 0.003), (0, ky0 - 0.0, H + 0.0015), M_KEY, root, bevel=0.0012)
for i, x in enumerate((-5.5, -4.5, -3.5, 3.5, 4.5, 5.5, 6.5)):
    box(f'key_row1_{i}', (KEY, KEY, 0.003), (x * PITCH, ky0, H + 0.0015), M_KEY, root, bevel=0.0012)

# Тачпад и кнопки, индикатор.
box('touchpad', (0.078, 0.046, 0.0006), (0, -0.068, H + 0.0006), M_PAD, root, bevel=0.002)
box('pad_buttons', (0.078, 0.012, 0.0012), (0, -0.099, H + 0.0008), M_KEY, root, bevel=0.001)
box('led_power', (0.004, 0.0015, 0.0006), (0.15, -0.105, H + 0.0007), M_LED, root)

# Петли.
for i, x in enumerate((-0.12, 0.12)):
    cyl(f'hinge_{i}', 0.0055, 0.045, (x, D / 2 - 0.004, H + 0.003), M_HINGE, root, rot=(0, math.pi / 2, 0))

# Порты слева: два USB, VGA, аудио; вентиляция справа.
for i, y in enumerate((-0.03, -0.012)):
    box(f'port_usb_{i}', (0.002, 0.013, 0.0052), (-W / 2 - 0.0003, y, H * 0.45), M_DARK, root)
box('port_vga', (0.002, 0.03, 0.008), (-W / 2 - 0.0003, 0.03, H * 0.48), M_DARK, root, bevel=0.002)
cyl('port_audio', 0.0018, 0.003, (-W / 2 - 0.0003, -0.06, H * 0.45), M_DARK, root, rot=(0, math.pi / 2, 0))
vent = box('vent_side', (0.002, 0.0022, 0.009), (W / 2 + 0.0003, 0.02, H * 0.48), M_DARK, root)
array(vent, 10, 0.0045, 'y')

# --- Дно: ножки, крышка батареи, вентиляция, наклейка ---
for i, (x, y) in enumerate(((-0.15, -0.1), (0.15, -0.1), (-0.15, 0.1), (0.15, 0.1))):
    cyl(f'foot_{i}', 0.006, 0.003, (x, y, -0.001), M_RUBBER, root)
box('battery_seam', (0.2, 0.06, 0.0008), (0, 0.085, -0.0002), M_DARK, root)
box('battery_panel', (0.197, 0.057, 0.0009), (0, 0.085, -0.0003), M_SHELL, root, bevel=0.0015)
slot = box('vent_bottom', (0.05, 0.0025, 0.0008), (-0.09, -0.07, -0.0002), M_DARK, root)
array(slot, 7, 0.006, 'y')

# Наклейка HEXON: 1652×1302 px, сама наклейка ≈ 6 × 4,6 см (поля с грязью ≈ 3 мм).
if os.path.exists(STICKER):
    bpy.ops.mesh.primitive_plane_add(size=1)
    st = bpy.context.active_object
    st.name = 'sticker_hexon_47'
    st.scale = (0.0664, 0.0524, 1)
    bpy.ops.object.transform_apply(scale=True)
    st.data.materials.append(sticker_material(STICKER))
    # Лицом вниз (−z); поворот вокруг Y — чтобы снизу текст читался не зеркально.
    place(st, root, (0.07, -0.03, -0.0006), rot=(0, math.pi, 0))

# --- Крышка: узел-петля, крышку можно открывать в игре поворотом lid_hinge.rotation.x ---
hinge = bpy.data.objects.new('lid_hinge', None)
scene.collection.objects.link(hinge)
place(hinge, root, (0, D / 2 - 0.004, H + 0.003))
box('lid_shell', (W, D - 0.004, LID_T), (0, -(D - 0.004) / 2, LID_T / 2 + 0.0005), M_SHELL, hinge, bevel=0.005, segs=4)
box('lid_bezel', (W - 0.01, D - 0.014, 0.0008), (0, -(D - 0.004) / 2, 0.0003), M_DECK, hinge, bevel=0.002)
bpy.ops.mesh.primitive_plane_add(size=1)
scr = bpy.context.active_object
scr.name = 'screen'  # экран — отдельная плоскость: в игру идёт живая текстура (laptopFace.ts)
scr.scale = (0.300, 0.1875, 1)
bpy.ops.object.transform_apply(scale=True)
scr.data.materials.append(M_SCREEN)
place(scr, hinge, (0, -0.126, -0.0003), rot=(math.pi, 0, 0))
cyl('webcam', 0.0018, 0.001, (0, -(D - 0.012), -0.0001), M_DARK, hinge)
hinge.rotation_euler = (OPEN, 0, 0)

# --- Счёт треугольников ---
dg = bpy.context.evaluated_depsgraph_get()
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()

# --- Экспорт GLB (Y вверх, модификаторы применяются) ---
glb = os.path.join(OUT, 'laptop_47_probe.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=True, export_yup=True)

# --- Свет как в разделе 15: тёплая лампа сбоку, слабый заполняющий ---
world = bpy.data.worlds.new('room')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.012, 0.011, 0.01, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
scene.world = world


def light(name, kind, loc, energy, color, size=0.3):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'AREA':
        ld.size = size
    o = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(o)
    o.location = loc
    return o


def aim(o, target=(0, 0, 0.05)):
    from mathutils import Vector

    d = Vector(target) - o.location
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


lamp = light('desk_lamp_warm', 'AREA', (-0.55, -0.25, 0.45), 5, (1.0, 0.78, 0.55), size=0.15)
aim(lamp)
fill = light('fill_soft', 'AREA', (0.6, -0.5, 0.3), 0.6, (0.75, 0.82, 1.0), size=1.0)
aim(fill)

cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 50
cam = bpy.data.objects.new('cam', cam_d)
scene.collection.objects.link(cam)
scene.camera = cam

for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        continue
scene.render.resolution_x, scene.render.resolution_y = 1280, 800
scene.view_settings.view_transform = 'AgX' if 'AgX' in [
    i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items
] else 'Filmic'

# Кадр 1: открыт, три четверти спереди.
cam.location = (0.42, -0.62, 0.42)
aim(cam, (0, 0.02, 0.07))
scene.render.filepath = os.path.join(OUT, 'render_front.png')
bpy.ops.render.render(write_still=True)

# Кадр 2: перевёрнут, вид на дно (крышка закрыта), лампа сбоку — рельеф по теням.
hinge.rotation_euler = (0, 0, 0)
root.rotation_euler = (0, math.pi, 0)
root.location = (0, 0, H + LID_T + 0.001)
cam.location = (0.05, -0.33, 0.5)
aim(cam, (0.0, 0.0, 0.03))
scene.render.filepath = os.path.join(OUT, 'render_bottom.png')
bpy.ops.render.render(write_still=True)

with open(os.path.join(OUT, 'stats.txt'), 'w', encoding='utf-8') as f:
    f.write(f'triangles={tris}\nglb_bytes={os.path.getsize(glb)}\nengine={scene.render.engine}\n')
print(f'[probe] triangles={tris} glb={glb} size={os.path.getsize(glb)}')
