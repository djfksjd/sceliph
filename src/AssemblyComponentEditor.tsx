import {editImplicitEllipsoidRadii,implicitEllipsoidEditBlocker} from './engine/implicit-ellipsoid-edit';
import {LATHE_CHAMFER_SCHEMA,latheChamferBlocker} from './engine/lathe-chamfer';
import {editLatheProfile} from './engine/lathe-profile-edit';
import {latheSegmentEditBlocker,LATHE_SEGMENT_EDIT_SCHEMA} from './engine/lathe-segment-edit';
import {applyWireCapPatch} from './engine/wire-cap-finish';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createLatestIntentGate} from './engine/latest-intent';
import type {AssemblyIR,AssemblyComponentIR} from './engine/assembly-ir';
import {applyAssemblyComponentPatch,fingerprintAssemblyIR,type AssemblyComponentPatch} from './engine/assembly-edit';
import {validateAssemblyIR} from './engine/assembly-compiler';
import {inferSurfaceFinish,SURFACE_LIBRARY} from './engine/surface-system';
import {migrateReferenceProjectionOrientation} from './engine/reference-projection-orientation';
interface Draft {implicitRadii:Record<string,string[]>;latheNormalMode:'corner-angle'|'profile-surfaces';chamferMm:string;latheProfile:string[][];latheSegments:string;lathePolicy:boolean;creaseAngleDeg:string;position:string[];scale:string[];roughness:string;metalness:string;direction:'legacy'|'positive'|'negative';flipU:boolean;bladeOutward:boolean;capFlat:boolean;capOutward:boolean;curveEnabled:boolean;controlPoint:string[]}
function draftFor(c:AssemblyComponentIR):Draft {
 const tube=c.geometry.op==='tube'?c.geometry:undefined;
 const control=tube?.curve?.controlPointMm??(tube?.points.length===2?tube.points[0]!.map((v,i)=>(v+tube.points[1]![i]!)/2):[0,0,0]);
 const recipe=SURFACE_LIBRARY[inferSurfaceFinish(c.materialName,c.material.surface)],orientation=c.material.referenceProjection?.orientation;
 return {implicitRadii:c.geometry.op==='implicitSurface'?Object.fromEntries(c.geometry.descriptor.primitives.filter(p=>p.type==='ellipsoid').map(p=>[p.id,(p.radii??p.radius as [number,number,number]).map(String)])):{},latheNormalMode:c.geometry.op==='lathe'&&c.geometry.normalPolicy?.schema==='morphloom.lathe-normals/0.2'?'profile-surfaces':'corner-angle',chamferMm:'0',latheProfile:c.geometry.op==='lathe'?c.geometry.profile.map(p=>p.map(String)):[],latheSegments:String(c.geometry.op==='lathe'?c.geometry.segments??64:64),lathePolicy:c.geometry.op==='lathe'&&Boolean(c.geometry.normalPolicy),creaseAngleDeg:String(c.geometry.op==='lathe'&&c.geometry.normalPolicy?.schema==='morphloom.lathe-normals/0.1'?c.geometry.normalPolicy.creaseAngleRad*180/Math.PI:30),bladeOutward:c.geometry.op==='bladeLoft'&&Boolean(c.geometry.sideWinding),capFlat:tube?.capFinish==='flat-outward',capOutward:tube?.capWinding==='outward',curveEnabled:Boolean(tube?.curve),controlPoint:control.map(String),position:(c.position??[0,0,0]).map(String),scale:(c.scale??[1,1,1]).map(String),roughness:String(c.material.roughness??recipe.roughness),metalness:String(c.material.metalness??recipe.metalness),direction:orientation?.direction??'legacy',flipU:orientation?.flipU??false};
}
export default function AssemblyComponentEditor({ir,selectedId,onCommit,sourceCurrent=true}:{ir:AssemblyIR;selectedId?:string;onCommit:(next:AssemblyIR)=>void;sourceCurrent?:boolean}) {
 const wire=ir.electrical?.wires.find(w=>w.id===selectedId);
 const component=ir.components.find(c=>c.id===selectedId),latest=useRef(ir),alive=useRef(true),expected=useRef(ir),inFlight=useRef(false),selected=useRef(selectedId),history=useRef<AssemblyIR[]>([ir]),cursor=useRef(0);
 latest.current=ir;selected.current=selectedId;
 const sourceReady=useRef(sourceCurrent);sourceReady.current=sourceCurrent;
 const draftSource=useRef<{ir:AssemblyIR;id?:string}>({ir, id:undefined});
 const [intentGate]=useState(createLatestIntentGate);
 useLayoutEffect(()=>{intentGate.cancel();return()=>intentGate.cancel();},[intentGate,ir,selectedId,sourceCurrent]);
 const [wireFlat,setWireFlat]=useState(false);
 const [lathePoint,setLathePoint]=useState(0);
 const [implicitPrimitive,setImplicitPrimitive]=useState('');
 const [draft,setDraft]=useState<Draft>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[,refresh]=useState(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(ir!==expected.current){history.current=[ir];cursor.current=0;expected.current=ir;}draftSource.current={ir,id:component?.id??wire?.id};setDraft(component?draftFor(component):undefined);setLathePoint(0);setImplicitPrimitive(component?.geometry.op==='implicitSurface'?component.geometry.descriptor.primitives.find(p=>p.type==='ellipsoid')?.id??'':'');setWireFlat(wire?.capFinish?.finish==='flat-outward');setError('');},[ir,component,wire]);
 const commit=(next:AssemblyIR)=>{expected.current=next;history.current=history.current.slice(0,cursor.current+1);history.current.push(next);if(history.current.length>33)history.current.shift();cursor.current=history.current.length-1;onCommit(next);refresh(n=>n+1);};
 const move=(step:number)=>{const index=cursor.current+step;if(busy||!sourceCurrent||index<0||index>=history.current.length)return;cursor.current=index;expected.current=history.current[index]!;onCommit(expected.current);refresh(n=>n+1);};
 const apply=async()=>{
  if(!component||!draft||inFlight.current||!sourceCurrent)return;
  if(draftSource.current.ir!==ir||draftSource.current.id!==component.id){setError('초안의 원본/선택이 바뀌었습니다. 현재 부품을 다시 확인하세요.');return;}
  inFlight.current=true;const intent=intentGate.begin(),source=ir,initial=draftFor(component);
  const ownsResult=()=>alive.current&&sourceReady.current&&intentGate.isCurrent(intent)&&latest.current===source&&selected.current===component.id;setBusy(true);setError('');
  try{
   const number=(value:string,min:number,max:number)=>{const n=Number(value);if(!value.trim()||!Number.isFinite(n)||n<min||n>max)throw new Error(`숫자는 ${min}..${max} 범위여야 합니다.`);return n;};
   const position=draft.position.map(n=>number(n,-100000,100000)) as [number,number,number],scale=draft.scale.map(n=>number(n,.01,100)) as [number,number,number];
   const material:NonNullable<AssemblyComponentPatch['material']>={};if(draft.roughness!==initial.roughness)material.roughness=number(draft.roughness,0,1);if(draft.metalness!==initial.metalness)material.metalness=number(draft.metalness,0,1);
   const translate=position.map((n,i)=>n-(component.position??[0,0,0])[i]!) as [number,number,number],multiply=scale.map((n,i)=>n/(component.scale??[1,1,1])[i]!) as [number,number,number];
   const curveChanged=draft.curveEnabled!==initial.curveEnabled||(draft.curveEnabled&&JSON.stringify(draft.controlPoint)!==JSON.stringify(initial.controlPoint));
   const geometry:AssemblyComponentPatch['geometry']=curveChanged?(draft.curveEnabled?{operation:'tube-quadratic-control',action:'set',curve:{schema:'morphloom.tube-quadratic-bezier/0.1',controlPointMm:draft.controlPoint.map(n=>number(n,-100000,100000)) as [number,number,number]}}:{operation:'tube-quadratic-control',action:'clear'}):undefined;
   const patch:AssemblyComponentPatch={schema:geometry?'morphloom.component-patch/0.2':'morphloom.component-patch/0.1',...(geometry?{geometry}:{}),operationId:'ui-'+component.id,componentId:component.id,expectedInputFingerprint:await fingerprintAssemblyIR(source),...(translate.some(n=>n!==0)?{translateMm:translate}:{}),...(multiply.some(n=>n!==1)?{scaleMultiplier:multiply}:{}),...(Object.keys(material).length?{material}:{})};
   const scalarChange=patch.translateMm||patch.scaleMultiplier||patch.material||patch.geometry;
   let next=scalarChange?(await applyAssemblyComponentPatch(source,patch)).ir:source;
   if(draft.latheSegments!==initial.latheSegments){
    const segments=number(draft.latheSegments,3,512);if(!Number.isInteger(segments))throw new Error('Lathe segments must be an integer from 3 to 512.');
    next=(await applyAssemblyComponentPatch(next,{schema:'morphloom.component-patch/0.2',operationId:'ui-lathe-segments-'+component.id,componentId:component.id,expectedInputFingerprint:await fingerprintAssemblyIR(next),geometry:{operation:'lathe-segments',schema:LATHE_SEGMENT_EDIT_SCHEMA,segments}})).ir;
   }
   if(JSON.stringify(draft.latheProfile)!==JSON.stringify(initial.latheProfile)){
    const profile=draft.latheProfile.map(p=>[number(p[0],0,100000),number(p[1],-100000,100000)] as [number,number]);
    next=await editLatheProfile(next,component.id,profile);
   }
   if(draft.chamferMm!==initial.chamferMm&&number(draft.chamferMm,0,100000)!==0){
    next=(await applyAssemblyComponentPatch(next,{schema:'morphloom.component-patch/0.2',operationId:'ui-lathe-chamfer-'+component.id,componentId:component.id,expectedInputFingerprint:await fingerprintAssemblyIR(next),geometry:{operation:'lathe-corner-chamfer',schema:LATHE_CHAMFER_SCHEMA,pointIndex:lathePoint,setbackMm:number(draft.chamferMm,.001,100000)}})).ir;
   }
   if(draft.lathePolicy!==initial.lathePolicy||draft.lathePolicy&&(draft.latheNormalMode!==initial.latheNormalMode||draft.latheNormalMode==='corner-angle'&&draft.creaseAngleDeg!==initial.creaseAngleDeg)){
    const policy=draft.latheNormalMode==='profile-surfaces'?{schema:'morphloom.lathe-normals/0.2' as const,weighting:'profile-surfaces' as const}:{schema:'morphloom.lathe-normals/0.1' as const,creaseAngleRad:Number(draft.creaseAngleDeg)*Math.PI/180,weighting:'corner-angle' as const};
    if(draft.lathePolicy&&draft.latheNormalMode==='corner-angle'&&draft.creaseAngleDeg.trim()==='')throw new Error('Crease angle is required.');
    next=(await applyAssemblyComponentPatch(next,{schema:'morphloom.component-patch/0.2',operationId:'ui-lathe-normals-'+component.id,componentId:component.id,expectedInputFingerprint:await fingerprintAssemblyIR(next),geometry:draft.lathePolicy?{operation:'lathe-normal-policy',action:'set',policy}:{operation:'lathe-normal-policy',action:'clear'}})).ir;
   }
   if(draft.bladeOutward!==initial.bladeOutward){
    next=(await applyAssemblyComponentPatch(next,{schema:'morphloom.component-patch/0.2',operationId:'ui-blade-winding-'+component.id,componentId:component.id,expectedInputFingerprint:await fingerprintAssemblyIR(next),geometry:{operation:'blade-side-winding',action:draft.bladeOutward?'set':'clear'}})).ir;
   }
   if(draft.capOutward!==initial.capOutward){
    next=(await applyAssemblyComponentPatch(next,{schema:'morphloom.component-patch/0.2',operationId:'ui-cap-'+component.id,componentId:component.id,expectedInputFingerprint:await fingerprintAssemblyIR(next),geometry:{operation:'tube-cap-winding',action:draft.capOutward?'set':'clear'}})).ir;
   }
   if(draft.capFlat!==initial.capFlat){
    next=(await applyAssemblyComponentPatch(next,{schema:'morphloom.component-patch/0.2',operationId:'ui-flat-cap-'+component.id,componentId:component.id,expectedInputFingerprint:await fingerprintAssemblyIR(next),geometry:{operation:'tube-cap-finish',action:draft.capFlat?'set':'clear'}})).ir;
   }
   if(component.material.referenceProjection&&(draft.direction!==initial.direction||draft.flipU!==initial.flipU)){
    const projection=structuredClone(component.material.referenceProjection);if(draft.direction==='legacy')delete projection.orientation;
    const declared=draft.direction==='legacy'?projection:migrateReferenceProjectionOrientation(projection,draft.direction,draft.flipU);
    next={...next,components:next.components.map(c=>c.id===component.id?{...c,material:{...c.material,referenceProjection:declared}}:c)};
   }
   for(const [primitiveId,radii] of Object.entries(draft.implicitRadii))if(JSON.stringify(radii)!==JSON.stringify(initial.implicitRadii[primitiveId]))next=editImplicitEllipsoidRadii(next,component.id,primitiveId,radii.map(n=>number(n,.1,100000)) as [number,number,number]);
   validateAssemblyIR(next);
   if(!ownsResult())return;
   if(next!==source)commit(next);
  }catch(e){if(ownsResult())setError(e instanceof Error?e.message:'Component edit failed');}finally{inFlight.current=false;if(alive.current)setBusy(false);}
 };
 const applyWire=async()=>{
  if(!wire||inFlight.current||!sourceCurrent)return;
  if(draftSource.current.ir!==ir||draftSource.current.id!==wire.id){setError('선택한 배선의 원본이 바뀌었습니다. 다시 확인하세요.');return;}
  inFlight.current=true;const source=ir,intent=intentGate.begin();
  const ownsResult=()=>alive.current&&sourceReady.current&&intentGate.isCurrent(intent)&&latest.current===source&&selected.current===wire.id;setBusy(true);setError('');
  try{const result=await applyWireCapPatch(source,{schema:'morphloom.wire-cap-patch/0.1',operationId:'ui-wire-cap',wireId:wire.id,expectedInputFingerprint:await fingerprintAssemblyIR(source),action:wireFlat?'set':'clear'});validateAssemblyIR(result.ir);if(ownsResult())commit(result.ir);}
  catch(e){if(ownsResult())setError(e instanceof Error?e.message:'배선 편집 실패');}
  finally{inFlight.current=false;if(alive.current)setBusy(false);}
 };
 const dirty=component&&draft&&JSON.stringify(draft)!==JSON.stringify(draftFor(component));
 return <section className="selected-part-card" aria-label="Assembly component editor"><span className="eyebrow">COMPONENT EDIT · MM</span>
 <button disabled={busy||!sourceCurrent||cursor.current===0} onClick={()=>move(-1)}>Undo component edit</button><button disabled={busy||!sourceCurrent||cursor.current>=history.current.length-1} onClick={()=>move(1)}>Redo component edit</button>
 {wire&&!component?<><p>Stable ID: <b>{wire.id}</b> · {wire.name}</p><label><input aria-label="Wire flat cap finish" type="checkbox" disabled={busy} checked={wireFlat} onChange={e=>setWireFlat(e.target.checked)}/>배선 끝면을 평평하게 마감</label><p>끝면 방향·노멀·UV를 교정합니다. 경로와 단자 위치는 유지됩니다.</p><button disabled={busy||!sourceCurrent||wireFlat===(wire.capFinish?.finish==='flat-outward')} onClick={()=>void applyWire()}>Apply wire cap edit</button><button disabled={busy||!sourceCurrent||wireFlat===(wire.capFinish?.finish==='flat-outward')} onClick={()=>{setWireFlat(wire.capFinish?.finish==='flat-outward');setError('');}}>Cancel wire cap edit</button></>:!component||!draft?<p>부품을 선택하면 수치와 사진 투영 방향을 편집할 수 있습니다.</p>:<><p>Stable ID: <b>{component.id}</b></p>
 {(['position','scale'] as const).map(key=><fieldset key={key}><legend>{key==='position'?'위치 (mm)':'크기 배율 (원래 부품 기준)'}</legend>{['X','Y','Z'].map((axis,i)=><label key={axis}>{key} {axis}<input aria-label={`Component ${key} ${axis}`} type="number" step={key==='position'?1:.01} value={draft[key][i]} disabled={busy} onChange={e=>setDraft(d=>d?{...d,[key]:d[key].map((n,j)=>i===j?e.target.value:n)}:d)}/></label>)}</fieldset>)}
 {(['roughness','metalness'] as const).map(key=><label key={key}>{key} (추정 appearance)<input aria-label={`Component ${key}`} type="number" min="0" max="1" step="0.01" disabled={busy} value={draft[key]} onChange={e=>setDraft(d=>d?{...d,[key]:e.target.value}:d)}/></label>)}
 {component.geometry.op==='implicitSurface'&&<fieldset disabled={busy||Boolean(implicitEllipsoidEditBlocker(ir,component))}><legend>Organic primary form · primitive local mm</legend><label>Ellipsoid primitive<select aria-label="Implicit ellipsoid primitive" value={implicitPrimitive} onChange={e=>setImplicitPrimitive(e.target.value)}>{Object.keys(draft.implicitRadii).map(id=><option key={id} value={id}>{id}</option>)}</select></label>{['X','Y','Z'].map((axis,i)=><label key={axis}>Semi-axis {axis} (mm)<input aria-label={`Implicit radius ${axis} mm`} type="number" min="0.1" max="100000" step="0.1" value={draft.implicitRadii[implicitPrimitive]?.[i]??''} disabled={!implicitPrimitive} onChange={e=>setDraft(d=>d?{...d,implicitRadii:{...d.implicitRadii,[implicitPrimitive]:d.implicitRadii[implicitPrimitive].map((v,j)=>j===i?e.target.value:v)}}:d)}/></label>)}<p>{implicitEllipsoidEditBlocker(ir,component)??'Semi-axes use primitive local mm; rotation, scale and union order remain. Target positions/normals/UV regenerate; other components stay intact. Bounds or closed-topology failure blocks the whole edit. Attached parts are not auto-fitted.'}</p></fieldset>}
 {component.geometry.op==='tube'&&component.geometry.points.length===2&&!component.geometry.closed&&<fieldset><legend>Wire 곡선 · 부품 로컬 좌표 (mm)</legend><label><input aria-label="Enable quadratic tube curve" type="checkbox" checked={draft.curveEnabled} disabled={busy} onChange={e=>setDraft(d=>d?{...d,curveEnabled:e.target.checked}:d)}/>2차 Bezier 곡선 사용</label>{draft.curveEnabled&&['X','Y','Z'].map((axis,i)=><label key={axis}>제어점 {axis}<input aria-label={`Tube control ${axis} mm`} type="number" step="0.1" disabled={busy} value={draft.controlPoint[i]} onChange={e=>setDraft(d=>d?{...d,controlPoint:d.controlPoint.map((v,j)=>i===j?e.target.value:v)}:d)}/></label>)}<p>양 끝점은 유지됩니다. 제어점은 곡선이 통과하는 점이 아닙니다. 연결된 링·부품은 자동 이동하지 않습니다.</p></fieldset>}
 {component.geometry.op==='bladeLoft'&&<fieldset><legend>검신 옆면 방향</legend><label><input aria-label="Outward blade side walls" type="checkbox" checked={draft.bladeOutward} disabled={busy} onChange={e=>setDraft(d=>d?{...d,bladeOutward:e.target.checked}:d)}/>옆면을 바깥 방향으로 교정</label><p>정점·치수·UV는 유지됩니다. 공유 정점의 평균 normal은 다시 계산합니다. 해제하면 기존 방향을 복원합니다.</p></fieldset>}
 {component.geometry.op==='tube'&&!component.geometry.closed&&<fieldset><legend>Tube cap winding</legend><label><input aria-label="Explicit outward tube caps" type="checkbox" checked={draft.capOutward} disabled={busy} onChange={e=>setDraft(d=>d?{...d,capOutward:e.target.checked}:d)}/>Explicit outward caps</label><p>Positions and UV stay unchanged. Clearing restores existing path behavior. Bezier caps are already outward. Flat finish also uses outward faces while enabled.</p><label><input aria-label="Flat tube cap finish" type="checkbox" checked={draft.capFlat} disabled={busy} onChange={e=>setDraft(d=>d?{...d,capFlat:e.target.checked}:d)}/>Flat end normals and planar UV</label><p>Only cap rim vertices split. Cap UV charts intentionally overlap; this is not an atlas.</p></fieldset>}
 {component.material.referenceProjection&&<fieldset><legend>사진 투영 · 평면 대응은 추정</legend><label>Source-facing direction<select aria-label="Projection source direction" value={draft.direction} disabled={busy} onChange={e=>setDraft(d=>d?{...d,direction:e.target.value as Draft['direction']}:d)}><option value="legacy">기존 +축 · orientation 없음</option><option value="positive">명시적 +축</option><option value="negative">명시적 −축</option></select></label><label><input aria-label="Reflect source UV U" type="checkbox" disabled={busy||draft.direction==='legacy'} checked={draft.flipU} onChange={e=>setDraft(d=>d?{...d,flipU:e.target.checked}:d)}/>사진 면 U 반전 · 숨은 면 UV 보존</label><p>적용 시 선택 부품의 사진 면·UV가 변경됩니다. 원본 사진이나 다른 부품은 변경하지 않습니다.</p></fieldset>}
 {component.geometry.op==='lathe'&&<fieldset disabled={busy||Boolean(latheSegmentEditBlocker(ir,component))}><legend>회전체 원주 분할</legend><label>분할 수 (정수 3–512)<input aria-label="Lathe radial segments" type="number" min="3" max="512" step="1" value={draft.latheSegments} onChange={e=>setDraft(d=>d?{...d,latheSegments:e.target.value}:d)}/></label><p>{latheSegmentEditBlocker(ir,component)??'원주 근사를 조절합니다. 대상 정점·UV·법선 수가 바뀌며, 비대상 부품은 유지됩니다. 치수·베벨을 추가하는 도구가 아닙니다.'}</p></fieldset>}
 {component.geometry.op==='lathe'&&<fieldset disabled={busy||Boolean(latheSegmentEditBlocker(ir,component))||component.geometry.profile.length>128}><legend>회전체 단면 점 · 로컬 mm</legend><label>점 번호<select aria-label="Lathe profile point" value={lathePoint} onChange={e=>setLathePoint(Number(e.target.value))}>{component.geometry.profile.slice(0,128).map((_,i)=><option key={i} value={i}>{i}</option>)}</select></label>{(['Radius','Height'] as const).map((axis,i)=><label key={axis}>{axis} (mm)<input aria-label={`Lathe profile ${axis.toLowerCase()} mm`} type="number" step="0.1" min={i===0?0:-100000} max="100000" value={draft.latheProfile[lathePoint]?.[i]??''} onChange={e=>setDraft(d=>d?{...d,latheProfile:d.latheProfile.map((p,j)=>j===lathePoint?p.map((v,k)=>k===i?e.target.value:v):p)}:d)}/></label>)}<p>{latheSegmentEditBlocker(ir,component)??'반경과 로컬 Y 높이를 편집합니다. 닫힌 단면 양 끝점은 함께 갱신합니다. 대상 UV·법선·형상은 바뀌며, 폐쇄 토폴로지를 확인한 뒤 적용합니다. 최대128점/10000삼각형. 자동 베벨·조립 제약 보정은 제공하지 않습니다.'}</p></fieldset>}
 {component.geometry.op==='lathe'&&<fieldset disabled={busy||Boolean(latheChamferBlocker(ir,component))||lathePoint<1||lathePoint>=component.geometry.profile.length-1}><legend>선택 단면 모서리 · 실제 chamfer</legend><label>양쪽 선분을 따라 물러나는 거리(mm)<input aria-label="Lathe chamfer setback mm" type="number" min="0" step="0.1" value={draft.chamferMm} onChange={e=>setDraft(d=>d?{...d,chamferMm:e.target.value}:d)}/></label><p>{latheChamferBlocker(ir,component)??'단면의 내부 점을 선택하세요. 0은 작업 없음입니다. 양쪽 선분 길이의 절반 미만으로 볼록 모서리를 한 번 잘라냅니다. 필렛 반경이나 자동 마모가 아닙니다. 적용 후 점 번호가 바뀌므로 다시 선택하세요. 원상 복원은 Undo로 수행합니다.'}</p></fieldset>}
 {component.geometry.op==='lathe'&&<fieldset disabled={busy}><legend>회전체 법선 · 명시적 옵션</legend><label><input aria-label="Enable lathe corner-angle normals" type="checkbox" checked={draft.lathePolicy} onChange={e=>setDraft(d=>d?{...d,lathePolicy:e.target.checked}:d)} />명시적 회전체 법선</label><label>계산 방식<select aria-label="Lathe normal mode" disabled={!draft.lathePolicy} value={draft.latheNormalMode} onChange={e=>setDraft(d=>d?{...d,latheNormalMode:e.target.value as Draft['latheNormalMode']}:d)}><option value="corner-angle">0.1 · 모서리 각도 평균</option><option value="profile-surfaces">0.2 · 단면 면 보존 / 원주 연속</option></select></label><label>Crease angle (°)<input aria-label="Lathe crease angle degrees" type="number" min="0" max="180" step="1" disabled={!draft.lathePolicy||draft.latheNormalMode==='profile-surfaces'} value={draft.creaseAngleDeg} onChange={e=>setDraft(d=>d?{...d,creaseAngleDeg:e.target.value}:d)}/></label><p>0.2는 각 단면 선분의 원추·원통·평면 법선을 분리하며, 원주 방향은 연속으로 계산합니다. 축 위에서는 삼각형별 극한 방향을 사용합니다. 0.1의30°는 직각 끝면을 분리합니다. 형상·UV는 유지되며 GLB에 모서리별 법선을 저장합니다. 해제하면 기존 계산으로 복원됩니다.</p></fieldset>}
 <p>연결 부품/치수 계약은 자동으로 맞추지 않습니다. 적용 후 기존 품질 검사를 다시 확인하세요. Undo는 최대32단계이며 새 IR 로드 시 초기화됩니다.</p>
 <button disabled={busy||!sourceCurrent||!dirty} onClick={()=>void apply()}>Apply component edit</button><button disabled={busy||!dirty} onClick={()=>{setDraft(draftFor(component));setError('');}}>Cancel component edit</button></>}
 {error&&<p role="alert">{error}</p>}<AssemblyPrimaryRecipePanel ir={ir} onCommit={commit} sourceCurrent={sourceCurrent}/></section>;
}
import AssemblyPrimaryRecipePanel from './AssemblyPrimaryRecipePanel';
