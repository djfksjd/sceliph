import { migrateEllipsoidSectionShape, type EllipsoidSectionShape } from './ellipsoid-section-shape';
import { Mesh, MeshBasicMaterial } from 'three';
import type { AssemblyComponentIR, AssemblyGeometryIR, AssemblyIR } from './assembly-ir';
import { compileAssemblyGeometry, validateAssemblyIR } from './assembly-compiler';
import { analyzeTopology } from './topology';
import { auditMeshConnectedShells } from './print-thickness';
import { auditAssemblyContactWitnesses } from './assembly-contact-witness';

function verifiedShells(source: AssemblyGeometryIR): number {
  const geometry = compileAssemblyGeometry(source), material = new MeshBasicMaterial();
  try {
    const mesh = new Mesh(geometry, material);
    if (!analyzeTopology(mesh).pass) throw new Error('Implicit surface failed existing closed-solid topology checks.');
    const connectivity = auditMeshConnectedShells(mesh);
    if (!connectivity.complete) throw new Error('Connected-shell inspection exceeded its budget or found invalid triangles.');
    return connectivity.shells;
  } finally { geometry.dispose(); material.dispose(); }
}

export function implicitEllipsoidEditBlocker(ir: AssemblyIR, component: AssemblyComponentIR): string | undefined {
  if (component.geometry.op !== 'implicitSurface') return 'Requires an implicit surface component.';
  if (ir.fidelity || ir.visualPlan || ir.dimensionContracts?.length || ir.planFootprint || ir.architecturalProgram)
    return 'Frozen shape/dimension contract: primitive editing is not supported.';
  if (component.material.surface !== 'raw' || component.material.referenceProjection || (component.material.microNormalStrength ?? 0) !== 0)
    return 'Requires raw scalar PBR; projected/procedural texture mapping is not verified.';
  const d = component.geometry.descriptor;
  if (d.resolution > 48 || d.triangleBudget > 50_000 || d.primitives.length > 16 || (d.operations?.length ?? 0) > 32)
    return 'Interactive implicit edit exceeds resolution/node/triangle budget (48/16/32/50000).';
  return undefined;
}

/** Absolute primitive-local semi-axis lengths in mm. Existing IR remains 0.1. */
export function editImplicitEllipsoidRadii(ir: AssemblyIR, componentId: string, primitiveId: string, radii: [number, number, number]): AssemblyIR {
  validateAssemblyIR(ir);
  const component = ir.components.find(c => c.id === componentId);
  if (!component || component.geometry.op !== 'implicitSurface') throw new Error('Implicit component is missing.');
  const blocker = implicitEllipsoidEditBlocker(ir, component);
  if (blocker) throw new Error(blocker);
  const primitive = component.geometry.descriptor.primitives.find(p => p.id === primitiveId);
  if (!primitive || primitive.type !== 'ellipsoid') throw new Error('Select an existing ellipsoid primitive.');
  if (!Array.isArray(radii) || radii.length !== 3 || radii.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < .1 || n > 100_000))
    throw new Error('Ellipsoid semi-axes require finite 0.1..100000 mm values.');
  const original = primitive.radii ?? primitive.radius;
  auditAssemblyContactWitnesses(ir);
  const beforeShells = verifiedShells(component.geometry);
  if (Array.isArray(original) && original.every((n, i) => n === radii[i])) return ir;
  const next = structuredClone(ir);
  const g = next.components.find(c => c.id === componentId)!.geometry;
  if (g.op !== 'implicitSurface') throw new Error('Implicit target changed.');
  const p = g.descriptor.primitives.find(p => p.id === primitiveId)!;
  p.radii = [...radii];
  delete p.radius; // Canonical explicit radii; accepted legacy radius tuple remains readable.
  validateAssemblyIR(next);
  const afterShells = verifiedShells(g);
  if (beforeShells !== afterShells) throw new Error(`Edit changes connected shells (${beforeShells} -> ${afterShells}). Restore the connection or use a separately supported topology operation.`);
  auditAssemblyContactWitnesses(next);
  return next;
}

/** Absolute section exponents; stable primitive ID, axes, transform and composition stay intact. */
export function editImplicitEllipsoidSectionShape(ir: AssemblyIR,componentId:string,primitiveId:string,shape:EllipsoidSectionShape):AssemblyIR {
  validateAssemblyIR(ir);
  const component=ir.components.find(c=>c.id===componentId);
  if(!component||component.geometry.op!=='implicitSurface')throw Error('Implicit component is missing.');
  const blocker=implicitEllipsoidEditBlocker(ir,component);if(blocker)throw Error(blocker);
  const index=component.geometry.descriptor.primitives.findIndex(p=>p.id===primitiveId);
  if(index<0)throw Error('Implicit primitive is missing.');
  const primitive=component.geometry.descriptor.primitives[index], edited=migrateEllipsoidSectionShape(primitive,shape);
  auditAssemblyContactWitnesses(ir);const beforeShells=verifiedShells(component.geometry);
  if(JSON.stringify(primitive.sectionShape)===JSON.stringify(edited.sectionShape))return ir;
  const next=structuredClone(ir),g=next.components.find(c=>c.id===componentId)!.geometry;
  if(g.op!=='implicitSurface')throw Error('Implicit target changed.');
  g.descriptor.primitives[index]=edited;validateAssemblyIR(next);
  const afterShells=verifiedShells(g);if(beforeShells!==afterShells)throw Error(`Section edit changes connected shells (${beforeShells} -> ${afterShells}).`);
  auditAssemblyContactWitnesses(next);return next;
}
