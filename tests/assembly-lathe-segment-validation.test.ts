import {expect,it} from 'vitest';
import {validateAssemblyIR,compileAssemblyGeometry} from '../src/engine/assembly-compiler';
const source=(segments:unknown)=>({schema:'morphloom.assembly/0.1',name:'Authored lathe preflight',units:'mm',components:[{id:'lathe',name:'Lathe',category:'mechanical',materialName:'raw',detail:'Authored diagnostic',geometry:{op:'lathe',profile:[[8,-6],[8,6],[14,6],[14,-6],[8,-6]],...(segments===undefined?{}:{segments})},material:{color:'#808080'}}]});
it('rejects fractional and nonnumeric lathe segment declarations during IR preflight',()=>{
 for(const segments of [32.5,3.1,NaN,Infinity,2,513,null,'32',true,[],{}])expect(()=>validateAssemblyIR(source(segments))).toThrow(/segment|numeric/i);
});
it('preserves omitted default and all supported integer segment inputs',()=>{
 for(const segments of [undefined,3,16,32,64,128,512])expect(()=>validateAssemblyIR(source(segments))).not.toThrow();
});
it('never reaches the UV degenerate fallback for the schema-invalid fractional declaration',()=>{
 expect(()=>compileAssemblyGeometry(source(32.5).components[0].geometry as never)).toThrow(/lathe.*segments.*integer/i);
});
