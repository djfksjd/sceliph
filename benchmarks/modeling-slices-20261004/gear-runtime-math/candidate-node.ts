import {readFileSync,writeFileSync} from 'node:fs';import * as candidate from './candidate-spur-gear';import * as baseline from '../../src/engine/spur-gear';import * as math from './candidate-math';
const cases=JSON.parse(readFileSync('work/gear-runtime-math-20261004/cases.json','utf8'));
export function candidateProbe(cases:baseline.SpurGearGeometry[]){return cases.map(g=>({input:g,profile:candidate.gearProfile(g),extracted:candidate.extractToothGeometry(g,'tooth_0003'),extruded:candidate.gearExtrude(g)}));}
const result=candidateProbe(cases);writeFileSync('work/gear-runtime-math-20261004/candidate-node.json',JSON.stringify(result));
let atanError=0,atan2Error=0,acosError=0;
for(let i=0;i<=8192;i++){const t=-10+20*i/8192;atanError=Math.max(atanError,Math.abs(math.atan(t)-Math.atan(t)));const x=-1+2*i/8192;acosError=Math.max(acosError,Math.abs(math.acos(x)-Math.acos(x)));const angle=-Math.PI+2*Math.PI*i/8192;atan2Error=Math.max(atan2Error,Math.abs(math.atan2(Math.sin(angle),Math.cos(angle))-Math.atan2(Math.sin(angle),Math.cos(angle))));}
let maximumPointDistanceMm=0;
for(const g of cases){const a=candidate.gearProfile(g),b=baseline.gearProfile(g);if(a.points.length!==b.points.length)throw Error('profile length changed');for(let i=0;i<a.points.length;i++)maximumPointDistanceMm=Math.max(maximumPointDistanceMm,Math.hypot(a.points[i][0]-b.points[i][0],a.points[i][1]-b.points[i][1]));}
writeFileSync('work/gear-runtime-math-20261004/candidate-error.json',JSON.stringify({atanError,atan2Error,acosError,maximumPointDistanceMm,status:'diagnostic error comparison only; not strict byte PASS or product activation'},null,2));console.log({atanError,atan2Error,acosError,maximumPointDistanceMm});
