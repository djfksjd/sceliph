import { describe, expect, it } from 'vitest';
import type { AssemblyIR } from '../src/engine/assembly-ir';
import { applyAssistChanges, extractJsonObject, parseAssistReply } from '../src/viewer/assist-protocol';

const ir: AssemblyIR = {
  schema: 'morphloom.assembly/0.1',
  name: 'Stool',
  units: 'mm',
  components: [
    { id: 'seat', name: 'Seat', category: 'mechanical', materialName: 'oak', detail: 'top', geometry: { op: 'cylinder', radiusTop: 180, radiusBottom: 180, depth: 30, radialSegments: 32 }, position: [0, 450, 0], material: { color: '#a07850' } },
    { id: 'leg', name: 'Leg', category: 'mechanical', materialName: 'oak', detail: 'leg', geometry: { op: 'cylinder', radiusTop: 20, radiusBottom: 20, depth: 435, radialSegments: 16 }, position: [0, 217.5, 0], material: { color: '#a07850' } },
  ],
} as AssemblyIR;

describe('command bar protocol', () => {
  it('extracts the reply object from fenced or chatty text', () => {
    expect(extractJsonObject('Sure:\n```json\n{"reply":"a {b}","changes":[]}\n```')).toEqual({ reply: 'a {b}', changes: [] });
    expect(() => parseAssistReply('{"reply":"x","changes":[{"op":"remove","id":"leg"}]}', 'chat')).toThrow(/Chat mode/);
  });

  it('applies a scoped update and reports the changed fields', () => {
    const wider = { ...ir.components[0]!, geometry: { op: 'cylinder', radiusTop: 200, radiusBottom: 200, depth: 30, radialSegments: 32 } };
    const reply = parseAssistReply(JSON.stringify({ reply: 'Wider seat.', changes: [{ op: 'update', id: 'seat', component: wider }] }), 'edit');
    const { ir: next, summary } = applyAssistChanges(ir, reply.changes, ['seat']);
    expect(summary).toEqual([{ op: 'update', id: 'seat', name: 'Seat', fields: ['geometry'] }]);
    expect(next.components[0]!.geometry).toMatchObject({ radiusTop: 200 });
    expect(ir.components[0]!.geometry).toMatchObject({ radiusTop: 180 });
    // Replaying the recorded changes on the same source is deterministic.
    expect(applyAssistChanges(ir, reply.changes, ['seat']).ir).toEqual(next);
  });

  it('refuses edits outside the scope, renames and unknown ids', () => {
    const leg = { ...ir.components[1]!, position: [0, 200, 0] as [number, number, number] };
    expect(() => applyAssistChanges(ir, [{ op: 'update', id: 'leg', component: leg }], ['seat'])).toThrow(/outside the selected scope/);
    expect(() => applyAssistChanges(ir, [{ op: 'update', id: 'leg', component: { ...leg, id: 'leg2' } }])).toThrow(/renamed/);
    expect(() => applyAssistChanges(ir, [{ op: 'remove', id: 'nope' }])).toThrow(/does not exist/);
    expect(() => applyAssistChanges(ir, [{ op: 'add', component: ir.components[0]! }])).toThrow(/already exists/);
  });
});
