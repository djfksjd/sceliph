import type { AssemblyIR } from '../../src/engine/assembly-ir';
export function joinedLobes(): AssemblyIR {
  return { schema: 'morphloom.assembly/0.1', name: 'Joined lobes', units: 'mm', components: [{
    id: 'housing', name: 'Housing', category: 'mechanical', materialName: 'raw', detail: 'Authored connected form',
    material: { color: '#999999', surface: 'raw' }, geometry: { op: 'implicitSurface', descriptor: {
      bounds: { min: [-55, -35, -35], max: [60, 35, 35] }, resolution: 32, triangleBudget: 15000,
      primitives: [
        { id: 'left', type: 'ellipsoid', radii: [20, 20, 20], transform: { position: [-15, 0, 0] } },
        { id: 'right', type: 'ellipsoid', radii: [25, 15, 15], transform: { position: [25, 0, 0] } },
      ], operations: [{ id: 'joined', type: 'smooth-union', left: 'left', right: 'right', radius: 4 }], output: 'joined',
    } },
  }] };
}
