import {useEffect, useRef, useState} from 'react';
import type {ElementProject} from './engine/element-project';
import type {ElementDomainRegistry} from './engine/element-domain-packs';
import {modelingSourceSHA256} from './engine/element-modeling-recipe';
import {PART_PLAN_SCHEMA, previewPartRegenerationPlan} from './engine/part-regeneration-plan';
import {partRegenerationBlocker} from './engine/part-regeneration';

type Preview = Awaited<ReturnType<typeof previewPartRegenerationPlan>>;
export function PartRegenerationPlanPanel({registry, project, targetId, disabled, captureIntent, onApply}: {
  registry: ElementDomainRegistry; project: ElementProject; targetId: string; disabled: boolean;
  captureIntent: () => () => boolean; onApply: (next: ElementProject) => void;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewSource = useRef<ElementProject | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0), alive = useRef(true);
  const latest = useRef({project, disabled}); latest.current = {project, disabled};
  const checked = !disabled && previewSource.current === project ? preview : null;
  useEffect(() => {alive.current = true; return () => {alive.current = false; epoch.current++;};}, []);
  useEffect(() => {epoch.current++; setPreview(null); setError(''); setBusy(false);}, [project, disabled]);
  const begin = () => {
    const ticket = ++epoch.current, ownerCurrent = captureIntent(), source = project;
    setPreview(null); setError(''); setBusy(true);
    return {
      current: () => alive.current && ticket === epoch.current && ownerCurrent() && latest.current.project === source && !latest.current.disabled,
      finish: () => {if (alive.current && ticket === epoch.current) setBusy(false);},
    };
  };
  const prepare = async () => {
    if (disabled || busy) return;
    const {current, finish} = begin();
    try {
      const sourceSha256 = await modelingSourceSHA256(project);
      const target = !partRegenerationBlocker(project, targetId) ? targetId :
        project.parts.find(p => !partRegenerationBlocker(project, p.id))?.id;
      if (!target) throw Error('Load a static authored extrusion project, then select a part.');
      if (current()) setText(JSON.stringify({schema: PART_PLAN_SCHEMA, sourceSha256, steps: [{targetId: target, declaration: {
        schema: 'sceliph.domain-invocation/0.1', units: 'mm', coordinates: 'right-handed-y-up',
        packId: 'product.deterministic-beveled-plate', input: {widthMm: 32, heightMm: 14, thicknessMm: 5, boreDiameterMm: 4, edgeBevelMm: 0.6},
        requiredCapabilities: ['authored-single-extrusion', 'deterministic-descriptor'],
      }}]}, null, 2));
    } catch (e) {if (current()) setError(e instanceof Error ? e.message : String(e));}
    finally {finish();}
  };
  const check = async () => {
    if (disabled || busy || !text.trim()) return;
    const {current, finish} = begin();
    try {const result = await previewPartRegenerationPlan(registry, project, text); if (current()) {previewSource.current = project; setPreview(result);}}
    catch (e) {if (current()) setError(e instanceof Error ? e.message : String(e));}
    finally {finish();}
  };
  return <details className="editor-section regeneration-plan">
    <summary>Replace parts from a JSON plan</summary>
    <p>Prepare the current source identity, then edit the template yourself or with an LLM. Check all replacements before applying them as one Undo step.</p>
    <button type="button" disabled={disabled || busy} onClick={() => void prepare()}>Prepare replacement template</button>
    <p className="plan-scope">Static authored extrusions · 1–8 distinct parts · mm. Template dimensions are new inputs. Materials and placement are preserved.</p>
    <label>Replacement plan JSON<textarea aria-label="Replacement plan JSON" spellCheck={false} rows={12} maxLength={65536} value={text}
      disabled={disabled || busy} onChange={e => {epoch.current++; setText(e.target.value); setPreview(null); setError('');}} /></label>
    <div className="plan-actions"><button type="button" disabled={disabled || busy || !text.trim()} onClick={() => void check()}>{busy ? 'Checking replacements…' : 'Check replacement plan'}</button>
      <button type="button" className="plan-apply" disabled={disabled || busy || !checked} onClick={() => {if (checked) onApply(checked.project);}}>Apply checked replacements</button></div>
    {checked && <div className="plan-result" role="status"><p>Topology and UV checks passed for {checked.receipt.steps.length} replacement(s). Project is unchanged until Apply.</p>
      <ul>{checked.receipt.steps.map(s => <li key={s.targetId}><code>{s.targetId}</code> ← <code>{s.packId}</code></li>)}</ul>
      <button type="button" disabled={disabled} onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(checked.receipt, null, 2)], {type: 'application/json'}));
        const a = document.createElement('a'); a.href = url; a.download = 'sceliph-replacement-receipt.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Save check receipt</button></div>}
    {error && <p role="alert">{error} Original project is unchanged.</p>}
  </details>;
}
