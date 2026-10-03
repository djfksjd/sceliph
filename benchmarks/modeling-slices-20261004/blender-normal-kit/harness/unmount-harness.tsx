import React,{createRef} from 'react';
import {createRoot}from'react-dom/client';
import {ResultViewport,type ViewportHandle}from'../../src/components/ResultViewport';
import {loadHumanPack}from'../../src/engine/ohpk';
import {DEFAULT_SPEC,DEFAULT_PRODUCT_SPEC}from'../../src/types';
import ir from'../../benchmarks/modeling-slices-20261004/lathe-profile-surface-normals/default-after.json';
export async function verifyUnmount(){
 const pack=await loadHumanPack('/assets/oxihuman-core-v1.ohpk');
 const element=document.createElement('div');element.style.cssText='width:600px;height:600px;position:fixed;inset:0';document.body.append(element);
 const root=createRoot(element),ref=createRef<ViewportHandle>();
 root.render(<ResultViewport ref={ref} assetKind="product" pack={pack} spec={DEFAULT_SPEC} productSpec={DEFAULT_PRODUCT_SPEC} assemblyIR={ir as never} mode="beauty"/>);
 for(let i=0;i<100&&!ref.current;i++)await new Promise(requestAnimationFrame);
 if(!ref.current)throw Error('Actual viewport did not mount');
 const original=crypto.subtle.digest.bind(crypto.subtle);let release:(()=>void)|undefined;const downloads:string[]=[];const click=HTMLAnchorElement.prototype.click;
 HTMLAnchorElement.prototype.click=function(){if(this.download)downloads.push(this.download);return click.call(this)};
 Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:(...args:Parameters<typeof original>)=>{delete (crypto.subtle as unknown as {digest?:unknown}).digest;return new Promise(resolve=>{release=()=>resolve(original(...args))})}});
 const pending=ref.current.exportBlenderNormalKit(ir as never).then(()=>({resolved:true,error:''}),e=>({resolved:false,error:String(e)}));
 for(let i=0;i<300&&!release;i++)await new Promise(requestAnimationFrame);
 if(!release)throw Error('No pending actual export digest');
 root.unmount();element.remove();release();const result=await pending;
 HTMLAnchorElement.prototype.click=click;
 if(result.resolved||downloads.length||!result.error.includes('취소'))throw Error('Export survived actual React unmount');
 return {pass:true,actualReactUnmount:true,downloads,result};
}
