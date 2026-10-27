import { describe, expect, it } from 'vitest';
import { PART_BOX_INSTRUCTIONS, validatePartBoxResponse, type PartBoxRequest } from '../src/engine/part-box-response';

const request: PartBoxRequest = {
  schema: 'sceliph.part-box-request/0.1',
  image: { sha256: 'a'.repeat(64), width: 640, height: 480, maxSide: 640 },
  parts: [{ id: 'stand', description: 'metal stand', componentIds: ['stand'] }, { id: 'knob', description: 'knob', componentIds: [] }],
  instructions: PART_BOX_INSTRUCTIONS,
};
const valid = { schema: 'sceliph.part-box-response/0.1', imageSha256: 'a'.repeat(64), width: 640, height: 480, parts: [{ id: 'stand', boxes: [[10, 20, 60, 400], [500, 20, 600, 400]], note: 'two legs' }] };

describe('part box response contract', () => {
  it('accepts multi-box parts and omitted parts, and normalizes the result', () => {
    const result = validatePartBoxResponse(structuredClone(valid), request);
    expect(result.parts).toEqual([{ id: 'stand', boxes: [[10, 20, 60, 400], [500, 20, 600, 400]], note: 'two legs' }]);
    expect(PART_BOX_INSTRUCTIONS).toMatch(/top-left/);
  });

  it('rejects responses bound to another image or with unsafe boxes', () => {
    const mutate = (change: (value: typeof valid) => void) => {
      const copy = structuredClone(valid) as typeof valid;
      change(copy);
      return () => validatePartBoxResponse(copy, request);
    };
    expect(mutate((v) => { v.imageSha256 = 'b'.repeat(64); })).toThrow(/different image/);
    expect(mutate((v) => { v.width = 641; })).toThrow(/size differs/);
    expect(mutate((v) => { v.parts[0]!.id = 'hub'; })).toThrow(/unrequested/);
    expect(mutate((v) => { v.parts.push(structuredClone(v.parts[0]!)); })).toThrow(/twice/);
    expect(mutate((v) => { v.parts[0]!.boxes = [[0, 0, 700, 10]]; })).toThrow(/outside/);
    expect(mutate((v) => { v.parts[0]!.boxes = [[5, 5, 6, 50]]; })).toThrow(/smaller/);
    expect(mutate((v) => { v.parts[0]!.boxes = []; })).toThrow(/1–8 boxes/);
    expect(mutate((v) => { v.parts[0]!.boxes = [[1, 2, 3, Number.NaN]]; })).toThrow(/finite/);
    expect(() => validatePartBoxResponse('nope', request)).toThrow(/object/);
  });
});
