import type { AssemblyComponentIR, AssemblyGeometryIR, AssemblyIR } from './assembly-ir';

/** Authored perched-bird silhouette study, not a species reconstruction or rig. */
export function createBirdPrimaryStudy(options: { preserveContacts?: boolean; taperedBeak?: boolean; shapedWings?: boolean } = {}): AssemblyIR {
  const components: AssemblyComponentIR[] = [];
  function add(id: string, geometry: AssemblyGeometryIR, position: [number, number, number] = [0, 0, 0], scale?: [number, number, number], rotation?: [number, number, number]) {
    components.push({ id, name: id.replaceAll('_', ' '), category: 'mechanical', geometry, position,
      ...(scale ? { scale } : {}), ...(rotation ? { rotation } : {}), materialName: 'authored bird clay',
      material: { color: '#9c8f7e', surface: 'raw', roughness: .75, metalness: 0, microNormalStrength: 0 },
      detail: 'Primary-form study. Separate wing/feet are editable surfaces, not articulated anatomy.',
      evidence: { status: 'estimated', source: 'Authored silhouette study; no reference photograph or measured anatomy.' } });
  }
  add('organic_core', { op: 'implicitSurface', descriptor: {
    bounds: { min: [-42, 32, -65], max: [42, 154, 76] }, resolution: 48, triangleBudget: 50_000,
    primitives: [
      { id: 'torso', type: 'ellipsoid', radii: [26, 34, 48], transform: { position: [0, 80, -4], rotation: [-.28, 0, 0] } },
      { id: 'neck', type: 'ellipsoid', radii: [18, 26, 23], transform: { position: [0, 111, 24], rotation: [-.35, 0, 0] } },
      { id: 'head', type: 'ellipsoid', radii: [21, 21, 25], transform: { position: [0, 126, 40] } },
    ], operations: [
      { id: 'torso_neck', type: 'smooth-union', left: 'torso', right: 'neck', radius: 12 },
      { id: 'body', type: 'smooth-union', left: 'torso_neck', right: 'head', radius: 10 },
    ], output: 'body',
  } });
  const sphere: AssemblyGeometryIR = { op: 'sphere', radius: 1, widthSegments: 32, heightSegments: 24 };
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'left' : 'right';
    add(`wing_${suffix}`, { op: 'implicitSurface', descriptor: {
      bounds: { min: [-12, -35, -53], max: [12, 29, 36] }, resolution: 40, triangleBudget: 15_000,
      primitives: [
        { id: 'root', type: 'ellipsoid', radii: [6, 19, 30] },
        { id: 'mid', type: 'ellipsoid', radii: [5, 12, 22], transform: { position: [0, -7, -19] } },
        { id: 'tip', type: 'ellipsoid', radii: [2, 5, 9], transform: { position: [0, -18, -38] } },
      ], operations: [
        { id: 'root_mid', type: 'smooth-union', left: 'root', right: 'mid', radius: 6 },
        { id: 'wing', type: 'smooth-union', left: 'root_mid', right: 'tip', radius: 4 },
      ], output: 'wing',
    } }, [side * 24, 90, -4], undefined, [-.32, side * .08, side * .08]);
    if(options.shapedWings){
      const wing=components.at(-1)!.geometry;
      if(wing.op==='implicitSurface')for(const p of wing.descriptor.primitives)if(p.id==='root')p.sectionShape={schema:'sceliph.ellipsoid-section-shape/0.1',radialPower:2,axialPower:1.5};
    }
    add(`eye_${suffix}`, sphere, [side * 19, 132, 50], [2.3, 2.3, 2.3]);
    components.at(-1)!.material.color = '#242424';
    add(`leg_${suffix}`, { op: 'tube', points: [[side * 12, 59, -5], [side * 12, 30, -8], [side * 12, 9, 3]], radius: 2.2, tubularSegments: 20, radialSegments: 10, capFinish: 'flat-outward' });
    for (const toe of [-1, 0, 1]) add(`toe_${suffix}_${toe + 1}`, { op: 'tube', points: [[side * 12, 9, 3], [side * 12 + toe * 5, 4, 22]], radius: 1.4, tubularSegments: 8, radialSegments: 8, capFinish: 'flat-outward' });
    add(`hind_toe_${suffix}`, { op: 'tube', points: [[side * 12, 9, 3], [side * 12, 4, -10]], radius: 1.4, tubularSegments: 8, radialSegments: 8, capFinish: 'flat-outward' });
  }
  add('tail', sphere, [0, 56, -62], [12, 5, 34], [-.22, 0, 0]);
  add('beak', { op: 'cylinder', radiusTop: .6, radiusBottom: 6, depth: 22, radialSegments: 24 }, [0, 124, 70], [1, 1, .65], [Math.PI / 2, 0, 0]);
  if(options.taperedBeak){
    const beak=components.find(c=>c.id==='beak')!;
    beak.geometry={op:'tube',points:[[0,0,0],[0,-4,22]],radius:6,tubularSegments:32,radialSegments:24,capFinish:'flat-outward',curve:{schema:'morphloom.tube-quadratic-bezier/0.1',controlPointMm:[0,0,12]},radiusProfile:{schema:'sceliph.tube-radius-profile/0.1',stations:[[0,6],[.25,4.7],[.5,3],[.75,1.5],[1,.6]]}};
    beak.position=[0,124,59];beak.scale=[1,.65,1];delete beak.rotation;
    beak.detail='Authored curved tapered beak; not a species reconstruction. Radius stations use local arc length.';
  }
  return { schema: 'morphloom.assembly/0.1', name: 'Bird primary form — authored study', units: 'mm', components,
    metadata: { ...(options.preserveContacts ? { sceliphContactWitnesses: JSON.stringify({ schema: 'sceliph.contact-witnesses/0.1', witnesses: [
      ...[-1, 1].flatMap(side => { const suffix = side < 0 ? 'left' : 'right'; return [
        { id: `eye_${suffix}_root`, ownerId: `eye_${suffix}`, hostId: 'organic_core', ownerLocalMm: [-side * .8, 0, 0], minimumClearanceMm: .05 },
        { id: `wing_${suffix}_root`, ownerId: `wing_${suffix}`, hostId: 'organic_core', ownerLocalMm: [-side * 3, 0, 0], minimumClearanceMm: .05 },
      ]; }),
      { id: 'beak_root', ownerId: 'beak', hostId: 'organic_core', ownerLocalMm: options.taperedBeak ? [0, 0, 2] : [0, -9, 0], minimumClearanceMm: .05 },
    ] }) } : {}), scope: 'authored-primary-form-study', evidenceBoundary: 'No species/anatomy validation; no feather groom, rig, or manufacturing claim.' } };
}
