import {deterministicHalfSinCos} from './deterministic-rotation';
export const GEAR_DETERMINISTIC_MATH_REVISION='morphloom.gear-ieee-series/0.1';
export const sin=(x:number)=>deterministicHalfSinCos(x)[0];
export const cos=(x:number)=>deterministicHalfSinCos(x)[1];
export const tan=(x:number)=>{const [s,c]=deterministicHalfSinCos(x);return s/c;};
/** Odd atan series after reciprocal and pi/4 reduction, |r|<=sqrt(2)-1.
 * Truncation tail <= |r|^63/63; floating point error measured separately. */
export function atan(x:number):number{
 if(typeof x!=='number'||Number.isNaN(x))throw new Error('atan number required');if(x===0)return x;if(!Number.isFinite(x))return x>0?Math.PI/2:-Math.PI/2;
 const sign=x<0?-1:1;let a=Math.abs(x),reciprocal=false;
 if(a>1){a=1/a;reciprocal=true;}let offset=0;
 if(a>0.41421356237309503){a=(a-1)/(a+1);offset=Math.PI/4;}
 const square=a*a;let sum=1/61;
 for(let k=29;k>=0;k--)sum=(k%2===0?1:-1)/(2*k+1)+square*sum;
 const result=offset+a*sum;return sign*(reciprocal?Math.PI/2-result:result);
}
export function atan2(y:number,x:number):number{
 if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('atan2 finite inputs required');
 if(x===0){if(y===0)return Object.is(x,-0)?(Object.is(y,-0)?-Math.PI:Math.PI):y;return y>0?Math.PI/2:-Math.PI/2;}
 const a=atan(y/x);return x>0?a:a+((y<0||Object.is(y,-0))?-Math.PI:Math.PI);
}
export function acos(x:number):number{if(!Number.isFinite(x)||x< -1||x>1)throw new Error('acos unit interval');return atan2(Math.sqrt((1-x)*(1+x)),x);}
/** Bounded gear coordinates only; no overflow-scale vector API claim. */
export function hypot(...x:number[]):number{if(x.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw new Error('hypot gear coordinate bounds');let sum=0;for(const v of x)sum+=v*v;return Math.sqrt(sum);}
