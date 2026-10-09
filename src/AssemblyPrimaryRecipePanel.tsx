import { inspectSavedSectionChecks,refreshSavedSectionChecks,type SavedSectionStatus } from './engine/saved-section-checks';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AssemblyIR } from './engine/assembly-ir';
import { fingerprintAssemblyIR } from './engine/assembly-edit';
import { applyAssemblyPrimaryRecipe, ASSEMBLY_PRIMARY_RECIPE_SCHEMA, ASSEMBLY_PRIMARY_RECIPE_V2_SCHEMA, ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA, ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA, ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA, ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA, type AssemblyPrimaryRecipeReceipt } from './engine/assembly-primary-recipe';
import { createLatestIntentGate } from './engine/latest-intent';

export default function AssemblyPrimaryRecipePanel({ ir, onCommit, sourceCurrent, isSourceCurrent = () => true }: { ir: AssemblyIR; onCommit: (next: AssemblyIR) => void; sourceCurrent: boolean; isSourceCurrent?: () => boolean }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ project: AssemblyIR; value: AssemblyPrimaryRecipeReceipt }>();
  const [savedResult,setSavedResult]=useState<{project:AssemblyIR;items:SavedSectionStatus[]}>(),[savedError,setSavedError]=useState('');
  const savedStatus=sourceCurrent&&savedResult?.project===ir?savedResult.items:undefined;
  const latest = useRef(ir), latestText = useRef(text), alive = useRef(true), inFlight = useRef(false);
  latest.current = ir; latestText.current = text;
  const ready = useRef(sourceCurrent); ready.current = sourceCurrent;
  const [gate] = useState(createLatestIntentGate);
  useLayoutEffect(() => {
    gate.cancel();
    setReceipt(current => sourceCurrent && current?.project === ir ? current : undefined);
    return () => gate.cancel();
  }, [gate, ir, sourceCurrent]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; gate.cancel(); }; }, [gate]);
  useEffect(()=>{
    let cancelled=false;setSavedResult(undefined);setSavedError('');
    if(sourceCurrent&&isSourceCurrent())void inspectSavedSectionChecks(ir).then(value=>{if(!cancelled&&alive.current&&ready.current&&isSourceCurrent()&&latest.current===ir)setSavedResult({project:ir,items:value});},e=>{if(!cancelled&&alive.current&&ready.current&&isSourceCurrent()&&latest.current===ir)setSavedError(e instanceof Error?e.message:'Saved checks failed.');});
    return ()=>{cancelled=true;};
  },[ir,sourceCurrent]);
  const refreshSaved=async()=>{
    if(inFlight.current||!sourceCurrent||!isSourceCurrent())return;inFlight.current=true;const source=ir,intent=gate.begin();setBusy(true);setError('');
    const owns=()=>alive.current&&ready.current&&isSourceCurrent()&&gate.isCurrent(intent)&&latest.current===source;
    try{const next=await refreshSavedSectionChecks(source);if(owns()){if(JSON.stringify(next)!==JSON.stringify(source))onCommit(next);}}
    catch(e){if(owns())setError(e instanceof Error?e.message:'Saved check refresh failed.');}
    finally{inFlight.current=false;if(alive.current)setBusy(false);}
  };
  const run = async (template: boolean, taper = false, section = false, fit = false, budget = false, record = false) => {
    if (inFlight.current || !sourceCurrent || !isSourceCurrent()) return;
    inFlight.current = true;
    const source = ir, inputText = text, intent = gate.begin();
    const ownsResult = () => alive.current && ready.current && isSourceCurrent() && gate.isCurrent(intent) && latest.current === source && latestText.current === inputText;
    setBusy(true); setError(''); setReceipt(undefined);
    try {
      if (template) {
        const snapshot = structuredClone(source);
        if(fit){
          const component=snapshot.components.find(c=>c.geometry.op==='implicitSurface'&&c.geometry.descriptor.primitives.length===1&&(c.geometry.descriptor.operations?.length??0)===0&&c.geometry.descriptor.primitives[0].type==='ellipsoid');
          if(!component||component.geometry.op!=='implicitSurface')throw Error('No independent ellipsoid is available; fitting a composed surface is unsupported.');
          const p=component.geometry.descriptor.primitives[0],r=p.radii??p.radius,q=p.sectionShape?.axialPower??2;
          if(!Array.isArray(r))throw Error('Independent ellipsoid requires explicit semi-axes.');
          const sourceFingerprint=await fingerprintAssemblyIR(snapshot);if(!ownsResult())return;
          const value=JSON.stringify({schema:record?ASSEMBLY_PRIMARY_RECIPE_V6_SCHEMA:budget?ASSEMBLY_PRIMARY_RECIPE_V5_SCHEMA:ASSEMBLY_PRIMARY_RECIPE_V4_SCHEMA,sourceFingerprint,steps:[{...(budget?{budget:{schema:"sceliph.section-mesh-budget/0.1",toleranceMm:.15,maximumResolution:48}}:{}),op:record?'ellipsoid-section-fit-record':budget?'ellipsoid-section-fit-budget':'ellipsoid-section-fit',componentId:component.id,primitiveId:p.id,fit:{schema:'sceliph.ellipsoid-section-fit/0.1',frame:'primitive-local',units:'mm',evidence:{status:'designed',sourceId:'current-shape-template'},pointsMm:[.75,.88].map(z=>[r[0]*(1-z**q)**(1/q),0,r[2]*z])}}]},null,2);
          latestText.current=value;setText(value);return;
        }
        if(section){
          const component=snapshot.components.find(c=>c.geometry.op==='implicitSurface'&&c.geometry.descriptor.primitives.some(p=>p.type==='ellipsoid'));
          if(!component||component.geometry.op!=='implicitSurface')throw Error('No implicit ellipsoid is available.');
          const primitive=component.geometry.descriptor.primitives.find(p=>p.type==='ellipsoid')!,shape=primitive.sectionShape;
          const sourceFingerprint=await fingerprintAssemblyIR(snapshot);if(!ownsResult())return;
          const value=JSON.stringify({schema:ASSEMBLY_PRIMARY_RECIPE_V3_SCHEMA,sourceFingerprint,steps:[{op:'ellipsoid-section-shape',componentId:component.id,primitiveId:primitive.id,radialPower:shape?.radialPower??2,axialPower:shape?.axialPower??2}]},null,2);
          latestText.current=value;setText(value);return;
        }
        if(taper){
          const tube=snapshot.components.find(c=>c.geometry.op==='tube'&&c.geometry.radiusProfile);
          if(!tube||tube.geometry.op!=='tube'||!tube.geometry.radiusProfile)throw Error('No declared tube radius profile is available.');
          const sourceFingerprint=await fingerprintAssemblyIR(snapshot);
          if(!ownsResult())return;
          const value=JSON.stringify({schema:ASSEMBLY_PRIMARY_RECIPE_V2_SCHEMA,sourceFingerprint,steps:[{op:'tube-radius-profile',componentId:tube.id,stations:tube.geometry.radiusProfile.stations}]},null,2);
          latestText.current=value;setText(value);return;
        }
        const component = snapshot.components.find(c => c.geometry.op === 'implicitSurface' && c.geometry.descriptor.primitives.some(p => p.type === 'ellipsoid'));
        if (!component || component.geometry.op !== 'implicitSurface') throw new Error('No implicit ellipsoid is available in this IR.');
        const primitive = component.geometry.descriptor.primitives.find(p => p.type === 'ellipsoid')!;
        const sourceFingerprint = await fingerprintAssemblyIR(snapshot);
        if (!ownsResult()) return;
        const value = JSON.stringify({ schema: ASSEMBLY_PRIMARY_RECIPE_SCHEMA, sourceFingerprint, steps: [{ op: 'ellipsoid-radii', componentId: component.id, primitiveId: primitive.id, radiiMm: primitive.radii ?? primitive.radius }] }, null, 2);
        latestText.current = value; setText(value);
      } else {
        const result = await applyAssemblyPrimaryRecipe(source, inputText);
        if (!ownsResult()) return;
        const changed = result.receipt.inputFingerprint !== result.receipt.outputFingerprint;
        setReceipt({ project: changed ? result.ir : source, value: result.receipt });
        if (changed) onCommit(result.ir);
      }
    } catch (e) { if (ownsResult()) setError(e instanceof Error ? e.message : 'Primary recipe failed.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  return <details><summary>Primary form recipe · local JSON</summary>
    <p>LLM 또는 사용자가 기존 component/primitive ID와 반축 mm를 선언합니다. 코드 실행·외부 전송은 없습니다. 최대4연산이며 원본 fingerprint, 폐쇄 토폴로지와 연결 성분 보존을 검사합니다. 접촉 계약이 있는 IR은 선언된 지점이 생성 메시 내부에 유지되는지도 검사하며, 접촉 단절 시 전체 변경을 거부합니다. 준비된 template의 수치를 수정한 뒤 적용하세요.</p>
    {!sourceCurrent && <p role="alert">새로 선택한 IR 검사가 완료되지 않아 이전 원본의 편집 결과를 적용할 수 없습니다.</p>}
    <button disabled={busy || !sourceCurrent} onClick={() => void run(true)}>Prepare primary recipe template</button>
    <button disabled={busy || !sourceCurrent} onClick={() => void run(true,true)}>Prepare tube taper recipe</button>
    <p>Tube taper는 이미 선언된 프로필의 반지름 mm를 수정합니다. 0..1은 경로의 정규화된 호 길이이며, 시작 반지름·끝점·곡선 경로는 유지합니다. 감소 프로필과 폐쇄 토폴로지·접촉을 검사합니다.</p>
    <button disabled={busy || !sourceCurrent} onClick={() => void run(true,false,true)}>Prepare section shape recipe</button>
    <p>Section shape는 반축과 위치를 유지하며 XY 단면(radialPower)과 Z축 윤곽(axialPower)을 조절합니다. 2는 기존 타원체, 1.5..4 범위를 지원합니다. 자료가 없는 값은 창작 형상입니다.</p>
    <button disabled={busy || !sourceCurrent} onClick={() => void run(true,false,false,true)}>Prepare section fit recipe</button>
    <p>Section fit은독립 타원체의 반축·XY 지수를 고정하고 primitive-local mm 지점2..16개에서 Z 지수 하나를 계산합니다. template 지점은 현재 형상에서 만든 창작 예시이며 독립 실측이 아닙니다. 원하는 설계 지점으로 교체하세요. 사진·월드 좌표·합성 형상은 지원하지 않으며 지점별 불일치를 거부합니다.</p>
    <button disabled={busy || !sourceCurrent} onClick={() => void run(true,false,false,true,true)}>Prepare section mesh budget recipe</button>
    <p>Mesh budget은 각 선언 지점의 실제 생성 메시 단면 오차를 mm로 검사합니다. toleranceMm와 최대 해상도를 직접 정하세요. 최대4후보, 해상도48·기존 삼각형 예산 안에서 실패하면 적용을 차단합니다. 전체 표면 정확도나 제조 공차 검증은 아닙니다. 이후 형상 편집 시 다시 검사해야 합니다.</p>
    <button disabled={busy || !sourceCurrent} onClick={() => void run(true,false,false,true,true,true)}>Prepare saved section check recipe</button>
    <p>Saved check는 입력 지점·오차 예산·대상 형상 fingerprint를 IR에 저장합니다. 저장된 PASS를 사용하지 않고 재열기 시 실제 메시를 다시 검사합니다. 형상이 바뀌면 stale이며, 현재 메시가 예산을 만족할 때만 명시적으로 binding을 갱신할 수 있습니다. 전체 납품 승인과 별개입니다.</p>
    {ir.sectionMeshChecks && <section aria-label="Saved section checks"><p>{!sourceCurrent?'새 원본 검사 대기':savedStatus?'현재 메시 재검사 완료':'현재 메시 검사 중'}</p><pre aria-label="Saved section check results">{JSON.stringify(savedStatus??[],null,2)}</pre><button disabled={busy||!sourceCurrent||!savedStatus?.length||savedStatus.some(s=>!s.withinBudget)} onClick={()=>void refreshSaved()}>Refresh saved section bindings</button></section>}
    {savedError&&<p role="alert">{savedError}</p>}
    <textarea aria-label="Assembly primary recipe JSON" maxLength={16384} value={text} onChange={e => { gate.cancel(); latestText.current = e.target.value; setText(e.target.value); setReceipt(undefined); setError(''); }} />
    <button disabled={busy || !sourceCurrent || !text.trim()} onClick={() => void run(false)}>Apply primary recipe</button>
    {error && <p role="alert">{error}</p>}
    {sourceCurrent && receipt?.project === ir && <><p>현재 IR에 적용했습니다. SAVE IR로 저장하고 OPEN RESULT로 다시 불러올 수 있습니다. 변경은 기존 component Undo/Redo 한 단계입니다.</p><pre aria-label="Primary recipe receipt">{JSON.stringify(receipt.value, null, 2)}</pre></>}
  </details>;
}
