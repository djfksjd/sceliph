import {expect,it} from 'vitest';
import {createSurfaceMaterial} from '../src/engine/surface-system';

it('preserves actual pixels while repeat variants own independent texture payloads and transforms',()=>{
 const context={mode:'beauty' as const,category:'surface',materialName:'asphalt'};
 const a=createSurfaceMaterial({color:'#555555',surface:'asphalt',textureScale:[2,3]},context);
 const b=createSurfaceMaterial({color:'#555555',surface:'asphalt',textureScale:[7,9]},context);
 try{
  for(const channel of ['map','normalMap','roughnessMap'] as const){
   const x=a[channel]!,y=b[channel]!;
   expect(x).not.toBe(y);expect(x.image.data).not.toBe(y.image.data);
   expect(new Uint8Array(x.image.data)).toEqual(new Uint8Array(y.image.data));
   expect(x.repeat.toArray()).toEqual([2,3]);expect(y.repeat.toArray()).toEqual([7,9]);
  }
 }finally{a.dispose();b.dispose();}
});

it('does not reuse another finish or pattern payload for a repeated surface',()=>{
 const context={mode:'beauty' as const,category:'surface',materialName:'metal'};
 const a=createSurfaceMaterial({color:'#555555',surface:'brushed-metal',textureScale:[2,3]},context);
 const b=createSurfaceMaterial({color:'#555555',surface:'bead-blasted-metal',textureScale:[7,9]},context);
 try{expect(a.normalMap!.image.data).not.toEqual(b.normalMap!.image.data);}finally{a.dispose();b.dispose();}
});
