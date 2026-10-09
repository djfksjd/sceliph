import { joinedLobes } from './fixtures/implicit-lobes';
import { expect, it, vi } from 'vitest';
import { createBirdPrimaryStudy } from '../src/engine/bird-primary-study';
import { fingerprintAssemblyIR } from '../src/engine/assembly-edit';
import { applyAssemblyPrimaryRecipe, ASSEMBLY_PRIMARY_RECIPE_SCHEMA } from '../src/engine/assembly-primary-recipe';
import { compileAssemblyGeometry } from '../src/engine/assembly-compiler';
const step = { op: 'ellipsoid-radii', componentId: 'organic_core', primitiveId: 'head', radiiMm: [22, 22, 26] };
async function recipe(ir = createBirdPrimaryStudy(), steps = [step]) { return { schema: ASSEMBLY_PRIMARY_RECIPE_SCHEMA, sourceFingerprint: await fingerprintAssemblyIR(ir), steps }; }

it('executes source-bound absolute edits, preserves non-targets and regenerates exactly after JSON reopen', async () => {
  const ir = createBirdPrimaryStudy(), original = structuredClone(ir), text = JSON.stringify(await recipe(ir));
  const a = await applyAssemblyPrimaryRecipe(ir, text), b = await applyAssemblyPrimaryRecipe(ir, text);
  expect(ir).toEqual(original); expect(a.ir).toEqual(b.ir); expect(a.receipt).toEqual(b.receipt);
  expect(a.ir.components.slice(1)).toEqual(ir.components.slice(1));
  const reopened = JSON.parse(JSON.stringify(a.ir));
  const c = compileAssemblyGeometry(a.ir.components[0].geometry), d = compileAssemblyGeometry(reopened.components[0].geometry);
  try { for (const key of ['position', 'normal', 'uv']) expect(c.getAttribute(key).array).toEqual(d.getAttribute(key).array); expect(c.index?.array ?? null).toEqual(d.index?.array ?? null); } finally { c.dispose(); d.dispose(); }
  const noOp = await applyAssemblyPrimaryRecipe(reopened, JSON.stringify(await recipe(reopened)));
  expect(noOp.ir).toEqual(a.ir); expect(noOp.receipt.inputFingerprint).toBe(noOp.receipt.outputFingerprint);
});

it('rejects wrong source/version/code/operation/duplicate/size/count without modifying source', async () => {
  const ir = createBirdPrimaryStudy(), before = structuredClone(ir), r = await recipe(ir);
  const invalid = [
    { ...r, sourceFingerprint: '0'.repeat(64) }, { ...r, schema: 'future/0.2' }, { ...r, code: 'run()' },
    { ...r, steps: [{ ...step, op: 'execute' }] }, { ...r, steps: [step, step] },
    { ...r, steps: [] }, { ...r, steps: Array(5).fill(step) }, { ...r, steps: [{ ...step, radiiMm: [-1, 22, 26] }] },
  ];
  for (const bad of invalid) await expect(applyAssemblyPrimaryRecipe(ir, JSON.stringify(bad))).rejects.toThrow();
  await expect(applyAssemblyPrimaryRecipe(ir, ' '.repeat(16385))).rejects.toThrow(/16384/);
  expect(ir).toEqual(before);
});

it('does not partially apply an earlier valid step when a later target fails', async () => {
  const ir = createBirdPrimaryStudy(), original = structuredClone(ir);
  await expect(applyAssemblyPrimaryRecipe(ir, JSON.stringify(await recipe(ir, [step, { ...step, primitiveId: 'missing' }])))).rejects.toThrow(/ellipsoid/);
  expect(ir).toEqual(original);
});

it('snapshots source before the first await, so caller mutation cannot contaminate a bound edit', async () => {
  const ir = createBirdPrimaryStudy(), r = await recipe(ir), old = structuredClone(ir);
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => { await new Promise(resolve => setTimeout(resolve, 10)); return digest(...args); });
  try { const pending = applyAssemblyPrimaryRecipe(ir, JSON.stringify(r)); ir.name = 'changed caller'; const result = await pending; expect(result.ir.name).toBe(old.name); } finally { spy.mockRestore(); }
});

it('uses the same recipe on a differently named mechanical form and blocks disconnection atomically', async () => {
  const ir=joinedLobes(), before=structuredClone(ir);
  const r={schema:ASSEMBLY_PRIMARY_RECIPE_SCHEMA,sourceFingerprint:await fingerprintAssemblyIR(ir),steps:[{op:'ellipsoid-radii',componentId:'housing',primitiveId:'right',radiiMm:[24,16,15]}]};
  expect((await applyAssemblyPrimaryRecipe(ir,JSON.stringify(r))).ir).not.toEqual(ir);
  r.steps[0].radiiMm=[8,15,15];await expect(applyAssemblyPrimaryRecipe(ir,JSON.stringify(r))).rejects.toThrow(/shell/);expect(ir).toEqual(before);
});
