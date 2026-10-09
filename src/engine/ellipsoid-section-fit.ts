/** Fixed-axis, fixed-radial-power fit. Points are declarations, not independent measurement certification. */
export interface EllipsoidSectionFitInput {
  schema: 'sceliph.ellipsoid-section-fit/0.1'; frame: 'primitive-local'; units: 'mm';
  evidence: { status: 'designed' | 'measured' | 'estimated'; sourceId: string };
  pointsMm: Array<[number, number, number]>;
}
export interface EllipsoidSectionFitResult {
  axialPower: number; residuals: number[]; pointPowers: number[];
  evidence: EllipsoidSectionFitInput['evidence'];
}
function object(value: unknown, keys: string[]): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value)!==Object.prototype) throw Error('Section fit requires plain JSON objects.');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).length!==keys.length || keys.some(k=>!Object.hasOwn(v,k))) throw Error('Section fit has missing or unsupported fields.');
  return v;
}
export function fitEllipsoidAxialPower(radii: [number,number,number], radialPower: number, value: unknown): EllipsoidSectionFitResult {
  if(!Array.isArray(radii)||radii.length!==3||radii.some(n=>!Number.isFinite(n)||n<.1||n>100000)||!Number.isFinite(radialPower)||radialPower<1.5||radialPower>4) throw Error('Section fit requires valid fixed semi-axes and radial power.');
  const input=object(value,['schema','frame','units','evidence','pointsMm']);
  if(input.schema!=='sceliph.ellipsoid-section-fit/0.1'||input.frame!=='primitive-local'||input.units!=='mm') throw Error('Section fit requires version 0.1, primitive-local mm. No coordinate or unit inference.');
  const evidence=object(input.evidence,['status','sourceId']);
  if(!['designed','measured','estimated'].includes(evidence.status as string)||typeof evidence.sourceId!=='string'||!evidence.sourceId.trim()||evidence.sourceId.length>128) throw Error('Section fit requires declared evidence status and source ID.');
  if(!Array.isArray(input.pointsMm)||input.pointsMm.length<2||input.pointsMm.length>16) throw Error('Section fit requires 2..16 points.');
  const sections=input.pointsMm.map(point=>{
    if(!Array.isArray(point)||point.length!==3||point.some(n=>typeof n!=='number'||!Number.isFinite(n))) throw Error('Section fit points require finite mm triples.');
    const u=(Math.abs(point[0]/radii[0])**radialPower+Math.abs(point[1]/radii[1])**radialPower)**(1/radialPower),v=Math.abs(point[2]/radii[2]);
    if(u<.1||u>.95||v<.1||v>.9) throw Error('Section fit point is uninformative or outside bounded interior section range.');
    const residual=(q:number)=>u**q+v**q-1;
    if(residual(1.5)<-1e-12||residual(4)>1e-12) throw Error('Section point cannot fit supported 1.5..4 axial power.');
    let lo=1.5,hi=4;
    for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(residual(mid)>0)lo=mid;else hi=mid;}
    return {v,residual,power:(lo+hi)/2};
  });
  if(!sections.some(a=>sections.some(b=>Math.abs(a.v-b.v)>=.1))) throw Error('Section fit needs distinct axial slices separated by at least 0.1 of the semi-axis.');
  const pointPowers=sections.map(s=>s.power);
  if(Math.max(...pointPowers)-Math.min(...pointPowers)>.02) throw Error('Inconsistent section points: per-point powers differ by more than 0.02.');
  // Quantization makes repeat fit/JSON reopen absolute edits stable, never accumulated.
  const axialPower=Math.round(pointPowers.reduce((a,b)=>a+b,0)/sections.length*1e8)/1e8;
  const residuals=sections.map(s=>s.residual(axialPower));
  if(residuals.some(n=>Math.abs(n)>.002)) throw Error('Section point residual exceeds fixed 0.002 bound.');
  return {axialPower,residuals,pointPowers,evidence:{status:evidence.status as EllipsoidSectionFitInput['evidence']['status'],sourceId:evidence.sourceId as string}};
}
