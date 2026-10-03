import {UV_DOUBLE_AREA_EPSILON} from './uv-quality';
/** Describes the existing legacy count; does not make or change a gate decision. */
export function describeUvMinimumArea(count:number,total:number):string{
 return `${count}/${total} double-area <= ${UV_DOUBLE_AREA_EPSILON} or non-finite`;
}
