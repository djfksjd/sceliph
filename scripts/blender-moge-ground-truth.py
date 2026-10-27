"""Renders a known-camera box scene for monocular camera/scale evidence checks.

blender --background --python-exit-code 1 --python scripts/blender-moge-ground-truth.py -- \
  <output-dir> <horizontal-fov-deg> <camera-distance-m> <elevation-deg> <azimuth-deg>

Writes image.png (640x480), object-alpha.png (box + cylinder alpha with the
floor hidden) and truth.json with the true horizontal FOV, the camera in
Sceliph world coordinates (Y up, mm) and the pixel projections of a 260 mm
anchor and an independent 110 mm probe on the box front face. Synthetic,
untextured CG: a lower bound on real-photo difficulty for scale, not a
substitute for real photographs.
"""
import bpy, json, math, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:]
out, fov, dist, elev, az = argv[0], float(argv[1]), float(argv[2]), float(argv[3]), float(argv[4])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
engines = bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items.keys()
scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x, scene.render.resolution_y = 640, 480
scene.world = bpy.data.worlds.new('world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.6


def material(colour):
    m = bpy.data.materials.new('material')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*colour, 1)
    bsdf.inputs['Roughness'].default_value = 0.5
    return m


# 300 x 200 x 150 mm box on z=0 with a cylinder on top (Blender units are metres).
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.075))
box = bpy.context.object
box.scale = (0.30, 0.20, 0.15)
box.data.materials.append(material((0.55, 0.25, 0.12)))
bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=0.18, location=(0.06, 0.02, 0.24))
bpy.context.object.data.materials.append(material((0.2, 0.35, 0.6)))
bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, 0))
floor = bpy.context.object
floor.data.materials.append(material((0.75, 0.75, 0.72)))
bpy.ops.object.light_add(type='SUN', location=(1, -1, 3))
bpy.context.object.data.energy = 3
bpy.context.object.rotation_euler = (0.6, 0.2, 0.4)

camera_data = bpy.data.cameras.new('camera')
camera_data.sensor_fit = 'HORIZONTAL'
camera_data.angle = math.radians(fov)
camera = bpy.data.objects.new('camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
target = Vector((0, 0, 0.1))
e, a = math.radians(elev), math.radians(az)
camera.location = target + dist * Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e)))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.filepath = out + '/image.png'
bpy.ops.render.render(write_still=True)
bpy.context.view_layer.update()

# Ground-truth object silhouette: floor hidden, transparent film, alpha only.
floor.hide_render = True
scene.render.film_transparent = True
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = out + '/object-alpha.png'
bpy.ops.render.render(write_still=True)


def pixel(point):
    v = world_to_camera_view(scene, camera, Vector(point))
    return [v.x * 640, (1 - v.y) * 480, v.z]


def sceliph(point):
    return [point[0] * 1000, point[2] * 1000, -point[1] * 1000]


json.dump({
    'fovXDegrees': fov,
    'fxPixels': 320 / math.tan(math.radians(fov) / 2),
    'cameraPositionMm': sceliph(camera.location),
    'cameraTargetMm': sceliph(target),
    'cameraDistanceM': dist,
    'anchorFrom': pixel((-0.13, -0.10, 0.13)),
    'anchorTo': pixel((0.13, -0.10, 0.13)),
    'anchorMm': 260,
    'probeFrom': pixel((-0.12, -0.10, 0.02)),
    'probeTo': pixel((-0.12, -0.10, 0.13)),
    'probeMm': 110,
}, open(out + '/truth.json', 'w'), indent=1)
