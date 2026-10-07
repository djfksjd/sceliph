import { Mesh, MeshBasicMaterial } from 'three';
import type { AssemblyIR, AssemblyGeometryIR } from './assembly-ir';
import { validateAssemblyIR, compileAssemblyGeometry } from './assembly-compiler';
import { migrateTubeRadiusProfile } from './tube-radius-profile';
import { analyzeTopology } from './topology';
import { auditMeshConnectedShells } from './print-thickness';
import { auditAssemblyContactWitnesses } from './assembly-contact-witness';
function shells(g: AssemblyGeometryIR): number {
 const geometry=compileAssemblyGeometry(g),material=new MeshBasicMaterial();
 try { const mesh=new Mesh(geometry,material), connectivity=auditMeshConnectedShells(mesh);
  if(!analyzeTopology(mesh).pass || !connectivity.complete) throw Error('Tube taper failed closed-solid topology/connectivity checks.');
  return connectivity.shells;
 }finally{geometry.dispose();material.dispose();}
}
export function editTubeRadiusProfile(ir: AssemblyIR,id: string,stations: Array<[number,number]>): AssemblyIR {
 validateAssemblyIR(ir);
 const component=ir.components.find(c=>c.id===id);
 if(!component || component.geometry.op!=='tube' || !component.geometry.radiusProfile) throw Error('Tube taper edit requires an existing declared radius profile.');
 if(ir.fidelity||ir.visualPlan||ir.dimensionContracts?.length||ir.planFootprint||ir.architecturalProgram) throw Error('Frozen shape/dimension contract: tube taper editing is unsupported.');
 if(component.material.surface!=='raw'||component.material.referenceProjection||(component.material.microNormalStrength??0)!==0) throw Error('Tube taper edit requires raw scalar PBR.');
 const geometry=migrateTubeRadiusProfile(component.geometry,stations);
 auditAssemblyContactWitnesses(ir);const before=shells(component.geometry);
 if(JSON.stringify(stations)===JSON.stringify(component.geometry.radiusProfile.stations)) return ir;
 const next=structuredClone(ir);next.components.find(c=>c.id===id)!.geometry=geometry;
 validateAssemblyIR(next);if(shells(geometry)!==before)throw Error('Tube taper changes connected shells.');auditAssemblyContactWitnesses(next);return next;
}
