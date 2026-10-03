export const BOUND_BLENDER_ROUNDTRIP_SCHEMA='morphloom.blender-roundtrip/0.3';
export interface BlenderRoundTripExpectation {
  compilerRevision: string;
  assetId: string;
  assemblyFingerprint: string;
  sourceSha256: string;
  finalDeliverySha256: string;
}
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const digest=(value:unknown):boolean=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const count=(value:unknown,minimum=0):boolean=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=minimum;
/** Historical receipts remain readable but cannot establish a current release. */
export function auditBlenderRoundTripProof(value: unknown, expected: BlenderRoundTripExpectation): string[] {
  const report=object(value);if(!report)return ['Blender proof must be an object.'];
  const blockers:string[]=[];
  if(report.assemblyFingerprintRepresentation!=='source-json/0.1')blockers.push('IR fingerprint must explicitly describe saved source JSON.');
  if(report.schema!==BOUND_BLENDER_ROUNDTRIP_SCHEMA)blockers.push('Legacy/unrecognized Blender proof: rerun the bound-proof generator; metadata-only migration is unsupported.');
  if(report.compilerRevision!==expected.compilerRevision||report.assetId!==expected.assetId)blockers.push('Blender compiler or asset binding mismatch.');
  for(const key of ['assemblyFingerprint','sourceSha256','finalDeliverySha256'] as const)if(!digest(expected[key])||!digest(report[key])||report[key]!==expected[key])blockers.push(`Blender ${key} mismatch.`);
  if(!digest(report.roundTripSha256))blockers.push('Missing raw Blender reexport SHA.');
  for(const key of ['sourceBytes','roundTripBytes','finalDeliveryBytes'])if(!count(report[key],1)||Number(report[key])>256_000_000)blockers.push(`Invalid Blender ${key}.`);
  if(report.pass!==true||report.geometryParity!==true||report.imageParity!==true||report.skinningParity!==true)blockers.push('Blender semantic parity failed.');
  if(typeof report.blenderVersion!=='string'||!/^5\.2\./.test(report.blenderVersion))blockers.push('Unsupported Blender version.');
  if(typeof report.boundsErrorMm!=='number'||!Number.isFinite(report.boundsErrorMm)||report.boundsErrorMm<0||report.boundsErrorMm>.1
    ||typeof report.boundsToleranceMm!=='number'||!Number.isFinite(report.boundsToleranceMm)||report.boundsToleranceMm<0||report.boundsToleranceMm>.1||report.boundsErrorMm>report.boundsToleranceMm)blockers.push('Blender bounds exceed the fixed 0.1mm contract.');
  const imported=object(report.imported),reopened=object(report.reopened);
  for(const key of ['meshes','polygons','materials'])if(!count(imported?.[key],key==='materials'?0:1)||!count(reopened?.[key],key==='materials'?0:1)||imported?.[key]!==reopened?.[key])blockers.push(`Missing or inconsistent Blender ${key}.`);
  const standard=object(report.roundTripStandardValidation);
  if(standard?.status!=='pass'||standard.khronosErrors!==0||standard.khronosWarnings!==0||standard.independentReadStatus!=='pass'
    ||!digest(standard.validatedSha256)||standard.validatedSha256!==report.finalDeliverySha256)blockers.push('Final delivery bytes lack bound Khronos and independent-read proof.');
  return blockers;
}
