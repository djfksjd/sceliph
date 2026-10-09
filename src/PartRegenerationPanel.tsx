import React,{useEffect,useRef,useState}from'react';
import type {ElementProject}from'./engine/element-project';
import type {ElementDomainRegistry}from'./engine/element-domain-packs';
import {regenerateAuthoredPart,partRegenerationBlocker}from'./engine/part-regeneration';
import {modelingSourceSHA256}from'./engine/element-modeling-recipe';
import {declarationTextSha256}from'./engine/parameter-binding';
export function PartRegenerationPanel({registry,project,targetId,disabled,onApply,captureIntent}:{registry:ElementDomainRegistry;project:ElementProject;targetId:string;disabled:boolean;onApply:(project:ElementProject)=>void;captureIntent:()=>()=>boolean}):React.JSX.Element{
 const packs=registry.list().filter(p=>p.capabilities.includes('authored-single-extrusion'));
 const [packId,setPackId]=useState('product.beveled-plate'),[input,setInput]=useState<Record<string,string>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const epoch=useRef(0),alive=useRef(true),latest=useRef({project,targetId,disabled});latest.current={project,targetId,disabled};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;};},[]);
 useEffect(()=>{epoch.current++;setBusy(false);setError('');},[project,targetId,disabled]);
 const meta=packs.find(p=>p.id===packId),blocked=partRegenerationBlocker(project,targetId),fields=meta?.parameters.dimensions??{};
 const valid=!!meta&&Object.entries(fields).every(([key,b])=>{const text=input[key];if(text!==undefined&&!text.trim())return false;const n=text===undefined?b.default:Number(text);return Number.isFinite(n)&&n>=b.min&&n<=b.max;});
 const apply=async()=>{if(disabled||blocked||!valid||!meta||busy)return;const captured=project,id=targetId,ticket=++epoch.current,ownerCurrent=captureIntent();setBusy(true);setError('');
 const current=()=>alive.current&&ownerCurrent()&&epoch.current===ticket&&latest.current.project===captured&&latest.current.targetId===id&&!latest.current.disabled;
 try{const declaration=JSON.stringify({schema:'sceliph.domain-invocation/0.1',units:'mm',coordinates:'right-handed-y-up',packId,input:Object.fromEntries(Object.entries(fields).map(([key,b])=>[key,input[key]===undefined?b.default:Number(input[key])])),requiredCapabilities:['authored-single-extrusion']});const [sourceSha256,declarationSha256]=await Promise.all([modelingSourceSHA256(captured),declarationTextSha256(declaration)]);if(!current())return;const result=await regenerateAuthoredPart(registry,captured,id,declaration,{sourceSha256,declarationSha256});if(!current())return;onApply(result.project);
 }catch(e){if(current())setError(String(e));}finally{if(alive.current&&epoch.current===ticket)setBusy(false);}};
 return <details><summary>Replace selected authored shape</summary><p>New local geometry in mm. Transform, ID, material and other parts stay. Existing shape is replaced; these defaults are not recovered from it. Use Undo to restore.</p>{blocked&&<p role="status">{blocked}</p>}<label>Geometry generator<select value={packId} disabled={disabled||busy||!!blocked} onChange={e=>{epoch.current++;setPackId(e.target.value);setInput({});setError('');}}>{packs.map(p=><option key={p.id} value={p.id}>{p.id}</option>)}</select></label>{Object.entries(fields).map(([key,b])=><label key={key}>{key}<input aria-label={'Replacement '+key} type="number" min={b.min} max={b.max} step="any" value={input[key]??b.default} disabled={disabled||busy||!!blocked} onChange={e=>{const text=e.currentTarget.value;epoch.current++;setInput(v=>({...v,[key]:text}));setError('');}}/></label>)}<button type="button" disabled={disabled||busy||!!blocked||!valid} onClick={()=>void apply()}>{busy?'Checking geometry…':'Replace geometry · keep other properties'}</button>{!valid&&<p role="alert">Enter valid finite generator values.</p>}{error&&<p role="alert">{error}</p>}</details>;
}
