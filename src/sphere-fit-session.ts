import type {PartGeometry} from './engine/part-geometry';
import type {SphereSurfaceMeasurement} from './engine/sphere-surface-budget';
export type SphereFitSession =
 | {status:'idle'}
 | {status:'failed';reason:string}
 | {status:'ready';geometryKey:string;toleranceMm:number;measurement:SphereSurfaceMeasurement};
/** Session-only receipt. It is never an IR quality approval or persisted PASS. */
export function createSphereFitReceipt(geometry:PartGeometry,toleranceMm:number,measurement:SphereSurfaceMeasurement):SphereFitSession{
 return {status:'ready',geometryKey:JSON.stringify(geometry),toleranceMm,measurement:{...measurement}};
}
export function sphereFitDisposition(session:SphereFitSession,geometry:PartGeometry|undefined,toleranceMm:number,invalidInput:boolean):{blocked:boolean;kind:'idle'|'failed'|'stale'|'ready';message:string}{
 if(session.status==='idle')return {blocked:false,kind:'idle',message:''};
 if(session.status==='failed')return {blocked:true,kind:'failed',message:`${session.reason} Fit again successfully or cancel the edit before applying.`};
 if(invalidInput||session.geometryKey!==JSON.stringify(geometry)||session.toleranceMm!==toleranceMm)return {blocked:true,kind:'stale',message:'Sphere inputs changed or are incomplete. Fit again successfully or cancel the edit before applying.'};
 return {blocked:false,kind:'ready',message:`Maximum facet deviation ${session.measurement.maximumDeviationMm.toPrecision(5)} mm · ${session.measurement.triangles} triangles. Apply to retain these subdivisions.`};
}
