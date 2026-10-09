import {readFileSync,writeFileSync,mkdirSync}from'node:fs';
import {resolve}from'node:path';
import {createHash}from'node:crypto';
import {Canvas,ImageData,createCanvas,loadImage}from'@napi-rs/canvas';
import {GLTFExporter}from'three/addons/exporters/GLTFExporter.js';
import {WebIO}from'@gltf-transform/core';
import {ALL_EXTENSIONS}from'@gltf-transform/extensions';
import {tracePlanarMask,generatePlanarMaskRelief}from'../src/engine/planar-mask-relief';
import {exportSelectedScene}from'../src/engine/element-renderer';
import {serializeProject,parseProject}from'../src/engine/element-project';
import {prepareElementExportSource}from'../src/engine/element-export-source';
import {analyzeTopology}from'../src/engine/topology';
import {validateGlbStandard}from'../src/engine/gltf-standard-validation';
import {compareReferenceFrames}from'../src/engine/reference-comparison';
const [mode,baseArg,outputArg]=process.argv.slice(2),base=resolve(baseArg),out=resolve(outputArg);mkdirSync(out);
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),check=(b:boolean,why:string)=>{if(!b)throw Error(why);};
const contract=JSON.parse(readFileSync(resolve(base,'contract.json'),'utf8')),source=readFileSync(contract.sourcePath);check(sha(source)===contract.sourceSha256,'Original reference binding');
const original=await loadImage(source),crop=contract.crop??[0,0,original.width,original.height],image={width:crop[2],height:crop[3]},canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(original,crop[0],crop[1],crop[2],crop[3],0,0,image.width,image.height);const rgba=ctx.getImageData(0,0,image.width,image.height).data,mask=new Uint8Array(image.width*image.height);for(let i=0;i<mask.length;i++)mask[i]=Number(rgba[i*4]<contract.darkThreshold&&rgba[i*4+1]<contract.darkThreshold&&rgba[i*4+2]<contract.darkThreshold&&rgba[i*4+3]>127);
const maskSha=sha(mask),profiles=tracePlanarMask(mask,image.width,image.height,contract.maximumContourErrorPixels);
writeFileSync(resolve(out,'profiles.json'),JSON.stringify({maskSha,width:image.width,height:image.height,profiles},null,2));
if(mode==='prepare'){console.log(JSON.stringify({profiles:profiles.length,holes:profiles.reduce((n,p)=>n+p.holes.length,0),maskSha}));process.exit(0);}
check(mode==='verify','Expected prepare/verify');
const raw=readFileSync(resolve(base,'model-run','reference.response.txt'),'utf8'),receipt=JSON.parse(readFileSync(resolve(base,'model-run','run.json'),'utf8'));check(receipt.rows[0].responseSha256===sha(new TextEncoder().encode(raw))&&receipt.networkCalls===0,'Model response binding');const chosen=JSON.parse(JSON.parse(raw));check(JSON.stringify(chosen)===JSON.stringify(contract.declaration),'Reference routing/depth/scale mismatch');
class Reader{result:unknown;onloadend?:()=>void;async readAsArrayBuffer(b:Blob){this.result=await b.arrayBuffer();this.onloadend?.();}}
class Offscreen extends Canvas{async convertToBlob(options?:{type?:string}){const type=options?.type??'image/png';return new Blob([new Uint8Array(this.encodeSync(type==='image/jpeg'?'jpeg':'png'))],{type});}}
Object.assign(globalThis,{FileReader:Reader,OffscreenCanvas:Offscreen,ImageData});
const project=generatePlanarMaskRelief(profiles,image.width,image.height,chosen.canvasWidthMm,chosen.depthMm,maskSha),sourceJSON=serializeProject(project);writeFileSync(resolve(out,'relief.source.json'),sourceJSON);
async function bytes(){const b=exportSelectedScene(prepareElementExportSource(parseProject(readFileSync(resolve(out,'relief.source.json'),'utf8'))),project.parts.map(p=>p.id));try{const topology=analyzeTopology(b.root);writeFileSync(resolve(out,'topology.json'),JSON.stringify(topology,null,2)+'\n');check(topology.pass,'Actual topology gate');check(b.stats.triangles<=contract.maximumTriangles,'Triangle budget');return new Uint8Array(await new GLTFExporter().parseAsync(b.root,{binary:true})as ArrayBuffer);}finally{b.dispose();}}
const first=await bytes(),second=await bytes();writeFileSync(resolve(out,'relief.glb'),first);writeFileSync(resolve(out,'relief-reopened.glb'),second);check(Buffer.from(first).equals(Buffer.from(second)),'Whole-byte regeneration');const validation=await validateGlbStandard(first.buffer as ArrayBuffer);check(validation.status==='pass','Khronos validation');
const doc=await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(first),renderMask=new Uint8Array(mask.length),regions:any[]=[];
// CPU orthographic binary raster of the actual independently reopened GLB triangles.
// No lights, DOF, perspective fit or postprocess; z faces project onto source XY.
const scale=chosen.canvasWidthMm/image.width;
for(let n=0;n<profiles.length;n++){
 const node=doc.getRoot().listNodes().find(nod=>nod.getName()==='outline_'+String(n).padStart(3,'0'))!,primitive=node.getMesh()!.listPrimitives()[0],positions=primitive.getAttribute('POSITION')!.getArray()!,indices=primitive.getIndices()?.getArray();check(!indices,'Expected actual unindexed native extrusion');
 const translation=node.getTranslation(),scaling=node.getScale(),partMask=new Uint8Array(mask.length);let triangles=0,minZ=Infinity,maxZ=-Infinity;for(let i=2;i<positions.length;i+=3){const z=positions[i]*scaling[2]*1000;minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}check(Math.abs(maxZ-minZ-chosen.depthMm)<=.0001,'Actual reopened world thickness');
 for(let i=0;i<positions.length;i+=9){const p=[0,1,2].map(j=>[(positions[i+j*3]*scaling[0]+translation[0])*1000/scale+image.width/2,image.height/2-(positions[i+j*3+1]*scaling[1]+translation[1])*1000/scale]);const cross=(a:number[],b:number[],x:number,y:number)=>(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);const area=cross(p[0],p[1],p[2][0],p[2][1]);if(Math.abs(area)<1e-8)continue;triangles++;
  const x0=Math.max(0,Math.floor(Math.min(...p.map(v=>v[0])))),x1=Math.min(image.width-1,Math.ceil(Math.max(...p.map(v=>v[0])))),y0=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1])))),y1=Math.min(image.height-1,Math.ceil(Math.max(...p.map(v=>v[1]))));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const a=cross(p[0],p[1],x+.5,y+.5),b=cross(p[1],p[2],x+.5,y+.5),c=cross(p[2],p[0],x+.5,y+.5);if(a>=-1e-5&&b>=-1e-5&&c>=-1e-5||a<=1e-5&&b<=1e-5&&c<=1e-5)partMask[y*image.width+x]=1;}
 }
 for(let i=0;i<mask.length;i++)renderMask[i]|=partMask[i];const [x,y,u,v]=profiles[n].bounds;regions.push({featureId:node.getName(),x,y,width:u-x,height:v-y});check(triangles>0,'Missing projected cap');
}
const makeFrame=(m:Uint8Array)=>({width:image.width,height:image.height,rgba,mask:m}),comparison=compareReferenceFrames(makeFrame(mask),makeFrame(renderMask),regions);
check(comparison.silhouetteIoU>=contract.minimumIoU,'Global silhouette mismatch');for(const r of comparison.regions)check(r.silhouetteIoU>=contract.minimumFeatureIoU,'Critical outline failure '+r.featureId);
const resultCanvas=createCanvas(image.width,image.height),resultCtx=resultCanvas.getContext('2d'),pixels=resultCtx.createImageData(image.width,image.height);for(let i=0;i<mask.length;i++){const match=mask[i]===renderMask[i];pixels.data[i*4]=match?(mask[i]?35:255):(mask[i]?240:0);pixels.data[i*4+1]=match?(mask[i]?35:255):(mask[i]?0:160);pixels.data[i*4+2]=match?(mask[i]?35:255):0;pixels.data[i*4+3]=255;}resultCtx.putImageData(pixels,0,0);writeFileSync(resolve(out,'same-view-difference.png'),resultCanvas.encodeSync('png'));
writeFileSync(resolve(out,'report.json'),JSON.stringify({pass:true,referenceSha:sha(source),maskSha,sourceJSONSha:sha(new TextEncoder().encode(sourceJSON)),glbSha:sha(first),reopenedSha:sha(second),comparison,validation,profiles:profiles.length,holes:profiles.reduce((n,p)=>n+p.holes.length,0),browser:'not-run',blender:'not-run',scope:'Actual original 2D logo and orthographic GLB silhouette; scale/thickness authored; no 3D recovery or material appearance render'},null,2)+'\n');console.log(JSON.stringify({pass:true,iou:comparison.silhouetteIoU,minimumFeatureIoU:Math.min(...comparison.regions.map(r=>r.silhouetteIoU))}));
