import { describe, expect, it } from 'vitest';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import {
  assessAssemblyCandidate,
  formatAssemblyFeedback,
  runAssemblyCorrectionLoop,
  selectBestAssemblyCandidate,
  type AssemblyRequirements,
} from '../src/engine/assembly-feedback';

const evidence = { status: 'datasheet' as const, source: 'test requirement' };
const requirements: AssemblyRequirements = {
  schema: 'sceliph.assembly-requirements/0.1',
  requiredComponentIds: ['body', 'post'],
  dimensions: [
    { id: 'body-height', label: 'Body height', target: { kind: 'component', componentId: 'body' }, axis: 'y', measurement: 'size', expectedMm: 150, toleranceMm: 0.5, evidence },
    { id: 'post-height', label: 'Post height', target: { kind: 'component', componentId: 'post' }, axis: 'y', measurement: 'size', expectedMm: 180, toleranceMm: 0.5, evidence },
    { id: 'post-width', label: 'Post diameter', target: { kind: 'component', componentId: 'post' }, axis: 'x', measurement: 'size', expectedMm: 80, toleranceMm: 0.5, evidence },
  ],
  maxTriangles: 50_000,
};

const candidate = (bodyHeight: number, postDepth: number, postRadius: number, withPost = true): AssemblyIR => ({
  schema: 'morphloom.assembly/0.1',
  name: 'feedback-fixture',
  units: 'mm',
  components: [
    { id: 'body', name: 'Body', category: 'enclosure', materialName: 'abs', detail: 'fixture', geometry: { op: 'roundedBox', size: [300, bodyHeight, 200], radius: 2 }, material: { color: '#888888' } },
    ...(withPost ? [{ id: 'post', name: 'Post', category: 'mechanical' as const, materialName: 'steel', detail: 'fixture', geometry: { op: 'cylinder' as const, radiusTop: postRadius, radiusBottom: postRadius, depth: postDepth, radialSegments: 32 }, position: [0, 200, 0] as [number, number, number], material: { color: '#cccccc' } }] : []),
  ],
});

describe('assembly execution feedback', () => {
  it('stages parse, schema and fenced-JSON handling', () => {
    expect(assessAssemblyCandidate('Here is your model!', requirements)).toMatchObject({ stage: 'parse', score: 0, pass: false });
    expect(assessAssemblyCandidate(JSON.stringify({ schema: 'morphloom.assembly/0.1', name: 'x', units: 'mm', components: [] }), requirements)).toMatchObject({ stage: 'schema', score: 0.05 });
    const fenced = `\`\`\`json\n${JSON.stringify(candidate(150, 180, 40))}\n\`\`\``;
    expect(assessAssemblyCandidate(fenced, requirements)).toMatchObject({ stage: 'pass', pass: true, score: 1 });
  });

  it('reports measured mismatches with exact parameter fixes', () => {
    const feedback = assessAssemblyCandidate(JSON.stringify(candidate(120, 140, 30)), requirements);
    expect(feedback.stage).toBe('requirements');
    expect(feedback.measured!.dimensionChecks.map((check) => check.pass)).toEqual([false, false, false]);
    const fixes = feedback.issues.map((issue) => issue.fix);
    expect(fixes).toContain('set components[0] (body).geometry.size[1] to 150');
    expect(fixes).toContain('set components[1] (post).geometry.depth to 180');
    expect(fixes.find((fix) => fix?.includes('radiusTop'))).toMatch(/to 40/);
    expect(formatAssemblyFeedback(feedback)).toMatch(/^The previous AssemblyIR failed at the requirements stage/);
    const missing = assessAssemblyCandidate(JSON.stringify(candidate(150, 180, 40, false)), requirements);
    expect(missing.issues.some((issue) => issue.code === 'missing-component')).toBe(true);
    expect(missing.score).toBeLessThan(feedback.score + 0.5);
  });

  it('diagnoses tessellation shortfall instead of asking for a larger radius', () => {
    const pipe = (radialSegments?: number) => JSON.stringify({
      schema: 'morphloom.assembly/0.1', name: 'pipe', units: 'mm',
      components: [{ id: 'pipe', name: 'Pipe', category: 'mechanical', materialName: 'steel', detail: 'fixture',
        geometry: { op: 'tube', points: [[0, 0, 0], [0, 800, 0]], radius: 25, ...(radialSegments ? { radialSegments } : {}) }, material: { color: '#888888' } }],
    });
    const pipeRequirements: AssemblyRequirements = {
      schema: 'sceliph.assembly-requirements/0.1',
      dimensions: [{ id: 'pipe-d', label: 'Pipe diameter', target: { kind: 'component', componentId: 'pipe' }, axis: 'x', measurement: 'size', expectedMm: 50, toleranceMm: 1.5, evidence }],
    };
    const coarse = assessAssemblyCandidate(pipe(), pipeRequirements);
    expect(coarse.pass).toBe(false);
    expect(coarse.issues[0]!.fix).toMatch(/keep the declared radius 25.*radialSegments to 32/);
    expect(coarse.issues[0]!.fix).not.toMatch(/scale/);
    expect(assessAssemblyCandidate(pipe(32), pipeRequirements).pass).toBe(true);
  });

  it('keeps the best candidate and stops at the first pass', async () => {
    const scripted = [JSON.stringify(candidate(120, 140, 30)), JSON.stringify(candidate(150, 180, 40))];
    const prompts: string[] = [];
    const result = await runAssemblyCorrectionLoop(async (prompt, round) => {
      prompts.push(prompt);
      return scripted[round]!;
    }, 'Build the fixture.', requirements, 3);
    expect(result.rounds).toHaveLength(2);
    expect(result.best.round).toBe(1);
    expect(result.best.feedback.pass).toBe(true);
    expect(prompts[1]).toMatch(/Fix: set components\[0\] \(body\)\.geometry\.size\[1\] to 150/);

    const regressing = [JSON.stringify(candidate(150, 140, 40)), 'not json'];
    const kept = await runAssemblyCorrectionLoop(async (_prompt, round) => regressing[round]!, 'Build the fixture.', requirements, 2);
    expect(kept.best.round).toBe(0);
    expect(kept.best.feedback.pass).toBe(false);
    expect(selectBestAssemblyCandidate([{ score: 0.5 }, { score: 0.5 }] as never)).toBe(0);
    await expect(runAssemblyCorrectionLoop(async () => '', 't', requirements, 0)).rejects.toThrow(/rounds/);
  });
});
