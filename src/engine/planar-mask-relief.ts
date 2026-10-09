import {validatePartGeometry,type PartGeometry} from './part-geometry';
import {validateProject,type ElementProject} from './element-project';
export const PLANAR_MASK_REVISION='sceliph.planar-mask-relief/0.1';
type Point=[number,number];
export interface MaskProfile {points:Point[];holes:Point[][];bounds:[number,number,number,number];pixels:number}
const distance=(p:Point,a:Point,b:Point)=>{const dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy;const t=q?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
function simplify(points:Point[],error:number):Point[]{
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
 while(stack.length){const [a,b]=stack.pop()!;let d=error,k=-1;for(let i=a+1;i<b;i++){const v=distance(points[i],points[a],points[b]);if(v>d){d=v;k=i;}}if(k!==-1){keep.add(k);stack.push([a,k],[k,b]);}}
 return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
function removeCollinear(points:Point[]):Point[]{let p=points;for(let n=0;n<points.length;n++){const next=p.filter((b,i)=>{const a=p[(i+p.length-1)%p.length],c=p[(i+1)%p.length];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])!==0;});if(next.length===p.length)return p;p=next;}return p;}
function closedSimplify(points:Point[],error:number):Point[]{let far=1;for(let i=2;i<points.length;i++)if(Math.hypot(points[i][0]-points[0][0],points[i][1]-points[0][1])>Math.hypot(points[far][0]-points[0][0],points[far][1]-points[0][1]))far=i;return [...simplify(points.slice(0,far+1),error).slice(0,-1),...simplify([...points.slice(far),points[0]],error).slice(0,-1)];}
/** Traces every 4-connected foreground region and every actual hole. Ambiguous
 * touching boundaries and over-budget outlines fail; nothing is filled/dropped. */
export function tracePlanarMask(mask:Uint8Array,width:number,height:number,errorPixels=.5):MaskProfile[]{
 if(!(mask instanceof Uint8Array)||!Number.isInteger(width)||!Number.isInteger(height)||width<4||height<4||width*height!==mask.length||mask.length>2097152||mask.some(x=>x!==0&&x!==1)||!Number.isFinite(errorPixels)||errorPixels<0||errorPixels>.75)throw Error('Invalid bounded binary mask.');
 const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length),profiles:MaskProfile[]=[];
 for(let start=0;start<mask.length;start++){
  if(!mask[start]||seen[start])continue;if(profiles.length>=64)throw Error('Mask component budget exceeded.');
  let head=0,tail=1;queue[0]=start;seen[start]=1;const cells:number[]=[];
  while(head<tail){const n=queue[head++],x=n%width,y=Math.floor(n/width);cells.push(n);for(const next of [x? n-1:-1,x+1<width?n+1:-1,y?n-width:-1,y+1<height?n+width:-1])if(next>=0&&mask[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}}
  const occupied=new Set(cells),edges=new Map<number,number>(),stride=width+1;let minX=width,minY=height,maxX=0,maxY=0;
  const edge=(x:number,y:number,u:number,v:number)=>{const a=y*stride+x,b=v*stride+u;if(edges.has(a))throw Error('Ambiguous touching mask boundary.');edges.set(a,b);if(edges.size>8192)throw Error('Mask edge budget exceeded.');};
  for(const n of cells){const x=n%width,y=Math.floor(n/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+1);maxY=Math.max(maxY,y+1);if(y===0||!occupied.has(n-width))edge(x,y,x+1,y);if(x===width-1||!occupied.has(n+1))edge(x+1,y,x+1,y+1);if(y===height-1||!occupied.has(n+width))edge(x+1,y+1,x,y+1);if(x===0||!occupied.has(n-1))edge(x,y+1,x,y);}
  const loops:Point[][]=[];
  while(edges.size){const first=edges.keys().next().value!;let n=first;const loop:Point[]=[];do{loop.push([n%stride,Math.floor(n/stride)]);const next=edges.get(n);if(next===undefined)throw Error('Open mask boundary.');edges.delete(n);n=next;}while(n!==first);const p=removeCollinear(closedSimplify(loop,errorPixels));if(p.length<3||p.length>256)throw Error('Mask outline budget/area exceeded.');loops.push(p);if(loops.length>33)throw Error('Mask hole budget exceeded.');}
  const area=(p:Point[])=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0);
  loops.sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));const [points,...holes]=loops;
  // Existing polygon checks remain authoritative, including self intersections.
  validatePartGeometry({op:'extrude',points,holes,depth:1});profiles.push({points,holes,bounds:[minX,minY,maxX,maxY],pixels:cells.length});
 }
 if(!profiles.length)throw Error('Empty mask.');return profiles;
}
export function generatePlanarMaskRelief(profiles:MaskProfile[],width:number,height:number,widthMm:number,depthMm:number,maskSha256:string):ElementProject{
 if(!/^[a-f0-9]{64}$/.test(maskSha256)||!Number.isFinite(widthMm)||widthMm<1||widthMm>1000||!Number.isFinite(depthMm)||depthMm<.01||depthMm>100||!Number.isInteger(width)||!Number.isInteger(height)||width<4||height<4||!Array.isArray(profiles)||!profiles.length||profiles.length>64)throw Error('Invalid planar relief declaration.');
 // Dyadic meter coordinates keep pixel-grid collinearity exact in Earcut.
 // The dimensionless uniform object scale restores the declared world width.
 const latticeMm=1000/1024,scale=widthMm/width/latticeMm,point=(p:Point):Point=>[(p[0]-width/2)*latticeMm,(height/2-p[1])*latticeMm];
 return validateProject({schema:'morphloom.elements/0.6',units:'mm',coordinates:'right-handed-y-up',seed:42,parts:profiles.map((p,i)=>{const geometry:PartGeometry={op:'extrude',points:p.points.map(point),holes:p.holes.map(h=>h.map(point)),depth:depthMm/scale};validatePartGeometry(geometry);return {id:'outline_'+String(i).padStart(3,'0'),name:'Reference outline '+i,shape:'assembly-geometry',geometry,position:[0,0,0],rotation:[0,0,0],scale:[scale,scale,scale],color:'#303030',material:{roughness:.68,metalness:0},visible:true,locked:false,evidence:{status:'inferred',source:PLANAR_MASK_REVISION+'; binary-mask SHA256 '+maskSha256+'; XY traced from source, width and depth authored, no hidden/backside recovery'}};}),regions:[],groups:[],elements:[]});
}
