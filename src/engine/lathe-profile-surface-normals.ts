import {BufferAttribute,type BufferGeometry}from 'three';
import type {AssemblyGeometryIR}from './assembly-ir';
/** Piecewise surface normals: sharp profile bands, smooth circular direction. */
export function profileSurfaceNormals(source:BufferGeometry,profile:Extract<AssemblyGeometryIR,{op:'lathe'}>['profile'],segments:number):BufferGeometry{
 const g=source.index?source.toNonIndexed():source;
 try{
  const p=g.getAttribute('position'),data=new Float32Array(p.count*3);let offset=0;
  for(let band=0;band<profile.length-1;band++){
   const a=profile[band],b=profile[band+1],axisA=Math.abs(a[0])<1e-6,axisB=Math.abs(b[0])<1e-6;
   const corners=axisA&&axisB?0:segments*(axisA||axisB?3:6);if(!corners)continue;
   const dr=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dr,dy);if(!(length>0)||offset+corners>p.count)throw new Error('Profile surface normal band is invalid.');
   for(let t=offset;t<offset+corners;t+=3){
    let cx=0,cz=0;for(let j=0;j<3;j++){cx+=p.getX(t+j);cz+=p.getZ(t+j)}const centerRadius=Math.hypot(cx,cz);
    for(let j=0;j<3;j++){const i=t+j,x=p.getX(i),z=p.getZ(i),r=Math.hypot(x,z);
     // At an axis singularity the normal is a deterministic triangle limit.
     if(r===0&&dy!==0&&centerRadius===0)throw new Error('Profile surface pole limit is singular.');
     const ux=r?x/r:centerRadius?cx/centerRadius:0,uz=r?z/r:centerRadius?cz/centerRadius:0;
     data.set([-dy/length*ux,dr/length,-dy/length*uz],i*3);
    }
   }offset+=corners;
  }
  if(offset!==p.count)throw new Error('Profile surface normal topology does not match compiler band ordering.');
  g.setAttribute('normal',new BufferAttribute(data,3));return g;
 }catch(error){if(g!==source)g.dispose();throw error;}
}
