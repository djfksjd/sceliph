import { expect, it } from 'vitest';
import { joinedLobes } from './fixtures/implicit-lobes';
import { editImplicitEllipsoidRadii } from '../src/engine/implicit-ellipsoid-edit';


it('blocks an edit that separates a connected solid into two closed shells', () => {
  const ir = joinedLobes(), original = structuredClone(ir);
  expect(() => editImplicitEllipsoidRadii(ir, 'housing', 'right', [8, 15, 15])).toThrow(/connect|shell/i);
  expect(ir).toEqual(original);
});

it('allows a connected shape edit and retains the source', () => {
  const ir = joinedLobes(), original = structuredClone(ir);
  const next = editImplicitEllipsoidRadii(ir, 'housing', 'right', [24, 16, 15]);
  expect(next).not.toEqual(ir); expect(ir).toEqual(original);
});
