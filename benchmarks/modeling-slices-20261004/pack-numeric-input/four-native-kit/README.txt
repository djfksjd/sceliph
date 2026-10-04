SCELIPH — optional Blender 5.2 Float32 source normal import

Extract this kit and run from its directory:
blender --background --threads 1 --python-exit-code 1 --python tools/blender-source-normal-import.py -- model.glb output.blend receipt.json

The command refuses existing outputs and unsupported Blender versions. Execution is explicit; this ZIP does not run code automatically.
source.json is editable in Sceliph. Imported source references are before-edit references, not reconstructed editable IR. Further Blender mesh edits do not update source.json. Native import has not been executed by this browser download. Texture, rig, animation and morph sources are unsupported. The normal tolerance remains 0.01 degree.
