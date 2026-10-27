import {validateProject, type ElementProject} from './element-project';
import type {ElementDomainRegistry} from './element-domain-packs';
import {parseDomainInvocation, type DomainInvocation} from './domain-invocation';
import {modelingSourceSHA256} from './element-modeling-recipe';
import {declarationTextSha256} from './parameter-binding';
import {partRegenerationBlocker, regenerateAuthoredPart} from './part-regeneration';

export const PART_PLAN_SCHEMA = 'sceliph.part-regeneration-plan/0.1';
export interface PartRegenerationPlan {
  schema: typeof PART_PLAN_SCHEMA;
  sourceSha256: string;
  steps: Array<{targetId: string; declaration: DomainInvocation}>;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Strict, bounded data contract. A plan never executes model-authored code. */
export function parsePartRegenerationPlan(text: string): PartRegenerationPlan {
  if (new TextEncoder().encode(text).byteLength > 65536) throw Error('Replacement plan exceeds 64 KiB');
  const value: unknown = JSON.parse(text);
  if (!record(value) || Object.keys(value).some(k => !['schema', 'sourceSha256', 'steps'].includes(k)) ||
      value.schema !== PART_PLAN_SCHEMA || typeof value.sourceSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.sourceSha256) || !Array.isArray(value.steps) ||
      value.steps.length < 1 || value.steps.length > 8) throw Error('Invalid replacement plan; requires current source SHA and 1–8 steps');
  const ids = new Set<string>();
  const steps = value.steps.map(step => {
    if (!record(step) || Object.keys(step).length !== 2 || !Object.hasOwn(step, 'declaration') ||
        typeof step.targetId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(step.targetId) || ids.has(step.targetId)) {
      throw Error('Each replacement requires a unique ASCII target ID and declaration');
    }
    ids.add(step.targetId);
    return {targetId: step.targetId, declaration: parseDomainInvocation(JSON.stringify(step.declaration))};
  });
  return {schema: PART_PLAN_SCHEMA, sourceSha256: value.sourceSha256, steps};
}

/** Work on a captured private source. Nothing is returned if any step fails;
 * the caller commits one history entry only after reviewing the full result. */
export async function previewPartRegenerationPlan(registry: ElementDomainRegistry, project: ElementProject, text: string) {
  const original = validateProject(structuredClone(project));
  const plan = parsePartRegenerationPlan(text);
  const sourceSha256 = await modelingSourceSHA256(original);
  if (plan.sourceSha256 !== sourceSha256) throw Error('Stale replacement plan. Prepare a template from the current project.');
  for (const step of plan.steps) {
    const blocker = partRegenerationBlocker(original, step.targetId);
    if (blocker) throw Error(`${step.targetId}: ${blocker}`);
    if (step.declaration.materials?.length) throw Error(`${step.targetId}: geometry plans cannot edit materials`);
  }
  let next = original;
  const steps = [];
  for (const step of plan.steps) {
    const declaration = JSON.stringify(step.declaration);
    const result = await regenerateAuthoredPart(registry, next, step.targetId, declaration, {
      sourceSha256: await modelingSourceSHA256(next),
      declarationSha256: await declarationTextSha256(declaration),
    });
    next = result.project;
    steps.push(result.receipt);
  }
  return {project: next, receipt: {
    schema: PART_PLAN_SCHEMA, sourceSha256,
    planSha256: await declarationTextSha256(text), outputSha256: await modelingSourceSHA256(next),
    steps, scope: 'Atomic authored static extrusion replacement; topology and editable-mesh UV checked, no reference fidelity or whole delivery approval',
  }};
}
