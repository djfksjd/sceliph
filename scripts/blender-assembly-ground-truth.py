"""Renders a known-camera photo of any compiled AssemblyIR GLB for photo-to-IR evaluation.

blender --background --python-exit-code 1 --python scripts/blender-assembly-ground-truth.py -- \
  <model.glb> <output-dir> <scene.json>

scene.json: {"fovXDegrees", "distanceM", "elevationDeg", "azimuthDeg",
"targetMm": [x, y, z], "anchorMm": [[x, y, z], [x, y, z]]} in Sceliph world
coordinates (millimetres, Y up). Azimuth 0 puts the camera on +Z; positive
azimuth moves it toward +X.

Writes image.png (640x480), object-alpha.png (all parts, floor hidden),
part-<node>.png (visible pixels of each GLB node, every other part held out so
occlusion is respected) and truth.json with the camera and the pixel
projections of the anchor points. Synthetic, untextured CG: a lower bound on
real-photo difficulty, not a substitute for real photographs.
"""
import bpy, json, math, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:]
glb, out, scene_path = argv[0], argv[1], argv[2]
spec = json.load(open(scene_path))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
engines = bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items.keys()
scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x, scene.render.resolution_y = 640, 480
scene.world = bpy.data.worlds.new('world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.6

bpy.ops.import_scene.gltf(filepath=glb)
parts = [obj for obj in scene.objects if obj.type == 'MESH']

floor_material = bpy.data.materials.new('floor')
floor_material.use_nodes = True
floor_material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.75, 0.75, 0.72, 1)
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
floor = bpy.context.object
floor.data.materials.append(floor_material)
bpy.ops.object.light_add(type='SUN', location=(1, -1, 3))
bpy.context.object.data.energy = 3
bpy.context.object.rotation_euler = (0.6, 0.2, 0.4)


def blender(point):
    return Vector((point[0] / 1000, -point[2] / 1000, point[1] / 1000))


def sceliph(point):
    return [point[0] * 1000, point[2] * 1000, -point[1] * 1000]


camera_data = bpy.data.cameras.new('camera')
camera_data.sensor_fit = 'HORIZONTAL'
camera_data.angle = math.radians(spec['fovXDegrees'])
camera_data.clip_start = 0.01
camera_data.clip_end = 100
camera = bpy.data.objects.new('camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
target = blender(spec['targetMm'])
e, a = math.radians(spec['elevationDeg']), math.radians(spec['azimuthDeg'])
camera.location = target + spec['distanceM'] * Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e)))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.filepath = out + '/image.png'
bpy.ops.render.render(write_still=True)
bpy.context.view_layer.update()

floor.hide_render = True
scene.render.film_transparent = True
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = out + '/object-alpha.png'
bpy.ops.render.render(write_still=True)

masks = {}
for part in parts:
    for other in parts:
        other.is_holdout = other is not part
    scene.render.filepath = out + '/part-' + part.name + '.png'
    bpy.ops.render.render(write_still=True)
    masks[part.name] = 'part-' + part.name + '.png'
for part in parts:
    part.is_holdout = False


def pixel(point):
    v = world_to_camera_view(scene, camera, blender(point))
    return [v.x * 640, (1 - v.y) * 480, v.z]


json.dump({
    'fovXDegrees': spec['fovXDegrees'],
    'fxPixels': 320 / math.tan(math.radians(spec['fovXDegrees']) / 2),
    'cameraPositionMm': sceliph(camera.location),
    'cameraTargetMm': spec['targetMm'],
    'cameraDistanceM': spec['distanceM'],
    'azimuthDeg': spec['azimuthDeg'],
    'elevationDeg': spec['elevationDeg'],
    'anchorFrom': pixel(spec['anchorMm'][0]),
    'anchorTo': pixel(spec['anchorMm'][1]),
    'anchorMm': math.dist(spec['anchorMm'][0], spec['anchorMm'][1]),
    'partMasks': masks,
}, open(out + '/truth.json', 'w'), indent=1)
