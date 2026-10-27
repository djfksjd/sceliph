import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import type { WorldTriangleMesh } from '../../src/engine/mesh-silhouette-raster';

/**
 * World-space millimetre triangles of every TRIANGLES primitive in a GLB's
 * default scene (textures ignored), plus whether any material is see-through
 * (alpha blend/mask or KHR_materials_transmission), which the ABO protocol
 * excludes because a silhouette cannot describe it.
 */
export async function readGlbTriangles(path: string): Promise<{ meshes: WorldTriangleMesh[]; triangles: number; seeThrough: boolean }> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(path);
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error('GLB has no scene.');
  const meshes: WorldTriangleMesh[] = [];
  let triangles = 0;
  let seeThrough = false;
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) continue;
      const material = primitive.getMaterial();
      if (material && (material.getAlphaMode() !== 'OPAQUE' || material.getExtension('KHR_materials_transmission'))) seeThrough = true;
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const positions = new Float64Array(position.getCount() * 3);
      const vector = new THREE.Vector3();
      const element: number[] = [];
      for (let i = 0; i < position.getCount(); i += 1) {
        position.getElement(i, element);
        vector.set(element[0]!, element[1]!, element[2]!).applyMatrix4(matrix);
        positions[i * 3] = vector.x * 1000;
        positions[i * 3 + 1] = vector.y * 1000;
        positions[i * 3 + 2] = vector.z * 1000;
      }
      const indices = primitive.getIndices();
      const index = indices ? Array.from(indices.getArray() as ArrayLike<number>) : undefined;
      triangles += index ? index.length / 3 : position.getCount() / 3;
      meshes.push({ positions, ...(index ? { index } : {}) });
    }
  });
  if (meshes.length === 0) throw new Error('GLB has no triangle primitives.');
  return { meshes, triangles, seeThrough };
}
