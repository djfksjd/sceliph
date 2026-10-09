import {GEAR_DETERMINISTIC_MATH_REVISION} from './engine/gear-deterministic-math';
import React, { useState } from 'react';
import type { Part, Vec3 } from './engine/element-project';
import {createSphereFitReceipt,sphereFitDisposition,type SphereFitSession} from './sphere-fit-session';
import {fitSphereSurfaceBudget} from './engine/sphere-surface-budget';
import {gearEditPreflight} from './engine/gear-edit-preflight';
import {projectionUvScalarForTileMm} from './engine/projection-uv-tile';
import { toothIds } from './engine/spur-gear';

export function PartInspector({part, version2, version4=false, version5=false, version6=false, version7=false, version8=false, apply, action,featureId='',onFeatureSelect,exportFeature}: {
  part:Part; version2:boolean; version4?:boolean; version5?:boolean; version6?:boolean; version7?:boolean; version8?:boolean; apply:(patch:Partial<Part>)=>void; action:(kind:'visibility'|'lock'|'detach')=>void;featureId?:string;onFeatureSelect?:(id:string)=>void;exportFeature?:(id:string)=>void
}): React.JSX.Element {
  const [draft,setDraft]=useState(()=>structuredClone(part));
  const [tileError,setTileError]=useState('');
  const [sphereTolerance,setSphereTolerance]=useState(.005);
  const [sphereSession,setSphereSession]=useState<SphereFitSession>({status:'idle'});
  const [invalidNumbers,setInvalidNumbers]=useState<Record<string,string>>({});
  const clearNumericErrors=(...labels:string[]):void=>setInvalidNumbers(p=>{const next={...p};for(const label of labels)delete next[label];return next;});
  const gearCheck=draft.geometry?.op==='spur-gear'?gearEditPreflight(draft.geometry,draft.axialChamferMm??0):null;
  const hasInvalidNumber=Object.keys(invalidNumbers).length>0;
  const sphereView=sphereFitDisposition(sphereSession,draft.geometry,sphereTolerance,hasInvalidNumber);
  const scalar=draft.uvScale??1;
  const tileMm=scalar>=.001&&scalar<=1000?1000/scalar:null;
  const number=(label:string,value:number,change:(n:number)=>void,min=-1_000_000,max=1_000_000,step=0.1):React.JSX.Element=>
    <label className="part-number">{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={invalidNumbers[label]??value} aria-invalid={Object.hasOwn(invalidNumbers,label)}
      onChange={e=>{const n=e.currentTarget.valueAsNumber;if(!Number.isFinite(n)||n<min||n>max||(label==='Gear toothCount'&&!Number.isInteger(n))){const text=e.currentTarget.value;setInvalidNumbers(p=>({...p,[label]:text}));return;}clearNumericErrors(label);change(n);}} disabled={part.locked}/>{Object.hasOwn(invalidNumbers,label)&&<span role="alert">{label}: enter {label==='Gear toothCount'?'a whole number':'a number'} from {min} to {max} before applying.</span>}</label>;
  const vector=(key:'position'|'rotation'|'scale',label:string,unit:string):React.JSX.Element=>
    <fieldset><legend>{label} ({unit})</legend>{draft[key].map((v,i)=><React.Fragment key={i}>{number(`${label} ${['X','Y','Z'][i]}`,v,n=>setDraft(p=>{
      const next=[...p[key]] as Vec3;next[i]=n;return {...p,[key]:next};
    }),key==='scale'?0.01:key==='rotation'?-Math.PI*2:-1_000_000,key==='scale'?(part.geometry?100:100_000):key==='rotation'?Math.PI*2:1_000_000)}</React.Fragment>)}</fieldset>;
  const dirty=JSON.stringify(draft)!==JSON.stringify(part);
  return <section className="part-inspector" aria-label="Part parameters">
    <header className="part-inspector-heading"><h3>{part.name}</h3><code>{part.id}</code><p>{part.locked?'Locked · unlock to edit':'Local coordinates · millimetres · right-handed Y-up'}</p></header>
    <p>{part.assemblyId ? `Assembly: ${part.assemblyId} · identity datum` : part.home?.assemblyId ? `Extracted from ${part.home.assemblyId}` : 'Independent part'}</p>
    {vector('position','Position','mm')}{vector('scale','Scale',part.geometry?'multiplier':'mm')}{vector('rotation','Rotation','rad')}
    <label>Color<input aria-label="Color" type="color" value={draft.color} disabled={part.locked} onChange={e=>setDraft(p=>({...p,color:e.target.value}))}/></label>
    {version2 && <fieldset><legend>PBR appearance</legend>
      {number('Part roughness',draft.material?.roughness??0.8,n=>setDraft(p=>({...p,material:{...p.material,roughness:n,metalness:p.material?.metalness??0}})),0,1,0.01)}
      {number('Part metalness',draft.material?.metalness??0,n=>setDraft(p=>({...p,material:{...p.material,roughness:p.material?.roughness??0.8,metalness:n}})),0,1,0.01)}
    </fieldset>}
    {version6 && <fieldset><legend>Authored surface appearance</legend><label>Roughness surface finish<select aria-label="Roughness surface finish" value={draft.material?.surface?.finish??'none'} disabled={part.locked} onChange={e=>setDraft(p=>{const material={roughness:p.material?.roughness??.8,metalness:p.material?.metalness??0,...p.material};if(e.target.value==='none'){delete material.surface;return {...p,material};}return {...p,material:{...material,surface:{finish:e.target.value as 'brushed-metal'|'bead-blasted-metal'|'anodized-metal',channels:'roughness-only',repeat:p.material?.surface?.repeat??[8,8]}}};})}><option value="none">No procedural surface</option><option value="brushed-metal">Directional roughness (brushed-metal recipe)</option><option value="bead-blasted-metal">Bead-blasted roughness recipe</option><option value="anodized-metal">Anodized roughness recipe</option></select></label>
    {draft.material?.surface&&(['U','V'] as const).map((axis,i)=><React.Fragment key={axis}>{number(`Surface repeat ${axis}`,draft.material!.surface!.repeat[i],n=>setDraft(p=>{if(!p.material?.surface)return p;const repeat=[...p.material.surface.repeat] as [number,number];repeat[i]=n;return {...p,material:{...p.material,surface:{...p.material.surface,repeat}}};}),.125,1024,.125)}</React.Fragment>)}<p>Actual 64px roughness map only. Normal/tangent, anisotropy and photo projection are unsupported here. Repeat is per native UV tile; physical scale depends on UV mapping. Authored appearance, not measured material properties.</p></fieldset>}
    {version7 && <fieldset><legend>Corner normals</legend><label>Normal weighting<select aria-label="Normal weighting" value={draft.normalWeighting??'uniform'} disabled={part.locked||!draft.geometry||draft.geometry.op==='sphere'} onChange={e=>setDraft(p=>({...p,normalWeighting:e.target.value as 'uniform'|'corner-angle'}))}><option value="uniform">Legacy uniform</option><option value="corner-angle">Corner-angle weighted</option></select></label><p>{!draft.geometry||draft.geometry.op==='sphere'?'Unavailable: this part uses analytic sphere/cone normals. ':'Changes smooth normals only; crease threshold, shape and UV stay unchanged. '}</p></fieldset>}
    {version4 && <fieldset><legend>Native UV scale</legend>{number('UV scalar (dimensionless)',draft.uvScale??1,n=>{clearNumericErrors('Local projection tile (mm)');setTileError('');setDraft(p=>({...p,uvScale:n}));},.001,1000,.1)}<p>Multiplies native UV coordinates only. 1 restores native mapping; no atlas, padding or texel density guarantee.</p>{draft.geometry?.op==='spur-gear' && <>{tileMm!==null?number('Local projection tile (mm)',tileMm,n=>{try{const uvScale=projectionUvScalarForTileMm(n);clearNumericErrors('UV scalar (dimensionless)');setDraft(p=>({...p,uvScale}));setTileError('');}catch(e){setTileError(String(e));}},1,1_000_000,.1):<p>Enter a valid UV scalar before specifying tile size.</p>}<p>Tile interval along local projected axes, before part scale. Default native mapping is 1000 mm per tile; choose the intended surface scale explicitly. No surface arc-length, atlas or texel-density guarantee.</p>{tileError&&<p role="alert">{tileError}</p>}</>}</fieldset>}
    {draft.geometry?.op==='sphere' && <fieldset><legend>Sphere geometry</legend>
      {number('Ball radius (mm)',draft.geometry.radius,n=>{setDraft(p=>p.geometry?.op==='sphere'?{...p,geometry:{...p.geometry,radius:n}}:p);},0.01,10_000,0.01)}
      {number('Sphere surface tolerance (mm)',sphereTolerance,n=>{setSphereTolerance(n);},.000001,1000,.001)}
      <button disabled={part.locked||hasInvalidNumber} onClick={()=>{if(draft.geometry?.op!=='sphere')return;try{const result=fitSphereSurfaceBudget(draft.geometry,sphereTolerance);setDraft(p=>({...p,geometry:result.geometry}));setSphereSession(createSphereFitReceipt(result.geometry,sphereTolerance,result.measurement));}catch(error){setSphereSession({status:'failed',reason:error instanceof Error?error.message:'Sphere refinement failed.'});}}}>Fit sphere surface tolerance</button>
      <p>Measures actual facets against the authored sphere in primitive-local mm, before part scale. Keeps the radius; changes geometry sampling and UV/normal samples. Preview LOD may be coarser. This is a mesh approximation budget, not measured manufacturing accuracy.</p>
      {sphereView.message&&<p role={sphereView.blocked?'alert':'status'} className={sphereView.blocked?'part-edit-error':undefined}>{sphereView.message}</p>}
    </fieldset>}
    {draft.geometry?.op==='lathe' && <details><summary>Lathe profile (radius / Y in mm)</summary>
      <p>Closed profile; endpoints stay linked. Invalid edits are rejected on Apply.</p>
      {draft.geometry.profile.map((point,i)=><fieldset key={i}><legend>Point {i}</legend>{point.map((v,j)=><React.Fragment key={j}>{number(`Profile ${i} ${j===0?'radius':'Y'} (mm)`,v,n=>setDraft(p=>{
        if(p.geometry?.op!=='lathe')return p;const profile=p.geometry.profile.map(q=>[...q] as [number,number]);profile[i][j]=n;
        if(i===0)profile[profile.length-1]=[...profile[0]];if(i===profile.length-1)profile[0]=[...profile[i]];
        return {...p,geometry:{...p.geometry,profile}};
      }),j===0?0.01:-10_000,10_000,0.01)}</React.Fragment>)}</fieldset>)}
    </details>}
    {draft.geometry?.op==='extrude' && <p>Declared extrude: {draft.geometry.holes?.length??0} real through holes. Pockets regenerate from the Domain Pack inputs.</p>}
    {version5 && draft.geometry?.op==='spur-gear' && <fieldset><legend>Axial chamfer (mm)</legend>{number('Gear axial chamfer (mm)',draft.axialChamferMm??0,n=>setDraft(p=>({...p,axialChamferMm:n})),0,(gearCheck?.maximumChamferMm??0),.001)}<p>0 restores sharp geometry. Positive minimum 0.001 mm; maximum {(gearCheck?.maximumChamferMm??0).toPrecision(4)} mm. Actual topology failure rejects Apply. Source visualization; no manufacturing approval.</p></fieldset>}
    {version8&&draft.geometry?.op==='spur-gear'&&<fieldset><legend>Gear arithmetic policy</legend><label>Gear math revision<select aria-label="Gear math revision" value={draft.geometry.mathRevision??'legacy'} disabled={part.locked} onChange={e=>{const value=e.currentTarget.value;setDraft(p=>{if(p.geometry?.op!=='spur-gear')return p;const geometry={...p.geometry};if(value==='legacy')delete geometry.mathRevision;else geometry.mathRevision=GEAR_DETERMINISTIC_MATH_REVISION;return {...p,geometry};});}}><option value="legacy">Legacy runtime Math · preserve original policy</option><option value={GEAR_DETERMINISTIC_MATH_REVISION}>Explicit IEEE series 0.1 · bounded gear calculations</option></select></label><p>Schema migration alone preserves legacy math. Apply explicitly changes this part's calculation policy; save the modified source separately. No manufacturing precision certification.</p></fieldset>}
    {draft.geometry?.op==='spur-gear' && <fieldset><legend>Spur gear parameters</legend>
      {(['moduleMm','toothCount','pressureAngleDeg','faceWidthMm','boreDiameterMm'] as const).map(key=><React.Fragment key={key}>{number(`Gear ${key}`,draft.geometry?.op==='spur-gear'?draft.geometry[key]:0,n=>setDraft(p=>p.geometry?.op==='spur-gear'?{...p,geometry:{...p.geometry,[key]:n}}:p),key==='toothCount'?18:key==='pressureAngleDeg'?20:key==='moduleMm'?.2:key==='faceWidthMm'?.1:0,key==='toothCount'?64:key==='pressureAngleDeg'?25:key==='moduleMm'?5:key==='faceWidthMm'?100:300,key==='toothCount'?1:0.1)}</React.Fragment>)}
      <p>Connected tooth features; radial root approximation. Nonstandard local tooth edits are for visualization, not meshing approval.</p>
      <label>Connected feature ID<select aria-label="Connected feature ID" value={featureId} onChange={e=>onFeatureSelect?.(e.target.value)}><option value="">Select a feature</option>{toothIds(draft.geometry).map(id=><option key={id} value={id}>{part.id}/{id}</option>)}</select></label>
      {featureId && toothIds(draft.geometry).includes(featureId) && number('Tooth addendum multiplier',draft.geometry.toothOverrides?.[featureId]?.addendumScale??1,n=>setDraft(p=>p.geometry?.op==='spur-gear'?{...p,geometry:{...p.geometry,toothOverrides:{...p.geometry.toothOverrides,[featureId]:{addendumScale:n}}}}:p),0.9,1.1,0.01)}
      <button disabled={hasInvalidNumber||!!tileError||gearCheck?.valid===false||!!part.axialChamferMm||!featureId||dirty||!toothIds(draft.geometry).includes(featureId)} onClick={()=>exportFeature?.(featureId)}>Export diagnostic tooth cut</button><p>{part.axialChamferMm?'Chamfered diagnostic tooth cuts are unsupported; set chamfer to 0 or export the whole gear. ':''}Exports a closed sector copy; does not detach or remove the tooth. Apply pending edits before export.</p>
    </fieldset>}
    {gearCheck&&!gearCheck.valid&&<p role="alert" className="part-edit-error">{gearCheck.reason}. Adjust the gear dimensions or chamfer before applying. The saved part is unchanged.</p>}
    <footer className="part-edit-footer"><p role="status">{hasInvalidNumber||tileError||sphereView.blocked||gearCheck?.valid===false?'Fix invalid inputs before applying':dirty?'Pending part changes':'No pending changes'}</p><div className="part-edit-actions">
    <button className="part-apply" disabled={!dirty||part.locked||!!tileError||hasInvalidNumber||sphereView.blocked||gearCheck?.valid===false} onClick={()=>{if(sphereView.blocked)return;apply({position:draft.position,rotation:draft.rotation,scale:draft.scale,color:draft.color,
      ...(draft.normalWeighting!==undefined?{normalWeighting:draft.normalWeighting}:{}),...(draft.axialChamferMm!==undefined?{axialChamferMm:draft.axialChamferMm}:{}),...(draft.uvScale!==undefined?{uvScale:draft.uvScale}:{}),...(draft.geometry?{geometry:draft.geometry}:{}),...(draft.material?{material:draft.material}:{})});}}>Apply part edit</button>
    <button disabled={!dirty&&!tileError&&!hasInvalidNumber&&sphereSession.status==='idle'} onClick={()=>{setDraft(structuredClone(part));setTileError('');setInvalidNumbers({});setSphereSession({status:'idle'});}}>Cancel edit</button>
    </div></footer><div className="part-management-actions"><button onClick={()=>action('visibility')}>{part.visible?'Hide':'Show'}</button>
    <button onClick={()=>action('lock')}>{part.locked?'Unlock':'Lock'}</button>
    <button disabled={part.locked} onClick={()=>action('detach')}>{part.home?'Restore part':'Extract part'}</button>
    </div>{part.home && <p>Restore recovers the saved assembly position and membership. Detached position/rotation edits are discarded; geometry and PBR edits stay.</p>}
  </section>;
}
