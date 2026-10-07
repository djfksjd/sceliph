import {expect,it} from 'vitest';
import {fitSphereSurfaceBudget,measureSphereSurfaceError} from '../src/engine/sphere-surface-budget';
it('keeps authored high latitude subdivisions without escalating longitude to the maximum',()=>{
 for(const heightSegments of [80,96,128]){
  const source={op:'sphere' as const,radius:3,widthSegments:16,heightSegments};
  expect(measureSphereSurfaceError(source).maximumDeviationMm).toBeGreaterThan(.005);
  const fitted=fitSphereSurfaceBudget(source,.005);
  expect(fitted.geometry.heightSegments).toBe(heightSegments);
  expect(fitted.geometry.widthSegments).toBeLessThan(128);
  expect(fitted.measurement.maximumDeviationMm).toBeLessThanOrEqual(.005);
  expect(fitted.measurement.triangles).toBeLessThan(20000);
  expect(fitSphereSurfaceBudget(fitted.geometry,.005).geometry).toEqual(fitted.geometry);
 }
});
it('preserves previously chosen standard bearing geometry and rejects impossible refinements',()=>{
 for(const [radius,widthSegments,heightSegments] of [[1.5,64,32],[3,80,40],[6,112,56]]){
  const fit=fitSphereSurfaceBudget({op:'sphere',radius,widthSegments:48,heightSegments:32},.005);
  expect(fit.geometry).toEqual({op:'sphere',radius,widthSegments,heightSegments});
 }
 const source={op:'sphere' as const,radius:100,widthSegments:16,heightSegments:128},before=JSON.stringify(source);
 expect(()=>fitSphereSurfaceBudget(source,.000001)).toThrow(/unattainable/);expect(JSON.stringify(source)).toBe(before);
});
