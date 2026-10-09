import { Matrix4, Mesh, MeshBasicMaterial, Quaternion, Euler, Triangle, Vector3, type BufferGeometry } from 'three';
import type { AssemblyIR, AssemblyComponentIR } from './assembly-ir';
import { compileAssemblyGeometry, validateAssemblyIR } from './assembly-compiler';
import { analyzeTopology } from './topology';

export const CONTACT_WITNESS_SCHEMA = 'sceliph.contact-witnesses/0.1';
export interface ContactWitness {
  id: string; ownerId: string; hostId: string;
  /** Interior overlap witness in owner's local millimetres, not a measured joint. */
  ownerLocalMm: [number, number, number]; minimumClearanceMm: number;
}
export interface ContactWitnessMeasurement { id: string; ownerClearanceMm: number; hostClearanceMm: number }

// Only successful numeric measurements are retained, never meshes or mutable
// IR. This process-local cache belongs to this implementation revision.
export const CONTACT_AUDIT_CACHE_REVISION = 'sceliph.contact-audit-cache/0.1';
const MAX_CACHE_ENTRIES = 16, MAX_CACHE_PAYLOAD_BYTES = 512 * 1024;
const measurementCache = new Map<string, { text: string; bytes: number }>();
let cachePayloadBytes = 0;
export function inspectContactWitnessCache() {
  return { entries: measurementCache.size, payloadBytes: cachePayloadBytes,
    maximumEntries: MAX_CACHE_ENTRIES, maximumPayloadBytes: MAX_CACHE_PAYLOAD_BYTES };
}

/** Exact JSON input binding, including -0. Non-JSON inputs simply bypass the
 * cache and continue through the original checks; serialization hooks are not
 * executed. Limits bound key construction independently of the retained cache.
 */
function measurementKey(ir: AssemblyIR): string | undefined {
  const ancestors = new Set<object>(), negativeZeros: number[] = [];
  let visited = 0, numberIndex = 0;
  const jsonSafe = (value: unknown, depth: number): boolean => {
    if (++visited > 10000 || depth > 32) return false;
    if (typeof value === 'number') {
      if (Object.is(value, -0)) negativeZeros.push(numberIndex);
      numberIndex++;
      return Number.isFinite(value);
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value !== 'object' || ancestors.has(value)) return false;
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (array && (proto !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1
      || Object.keys(value).some(key => !/^(0|[1-9][0-9]*)$/.test(key)))) return false;
    if (!array && proto !== Object.prototype && proto !== null) return false;
    if (proto && Object.getOwnPropertyDescriptor(proto, 'toJSON')) return false;
    if (Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON')) return false;
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (array && key === 'length') continue;
      const descriptor = descriptors[key as string];
      if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)
        || !jsonSafe(descriptor.value, depth + 1)) { ancestors.delete(value); return false; }
    }
    ancestors.delete(value);
    return true;
  };
  if (!jsonSafe(ir, 0)) return undefined;
  const text = JSON.stringify(ir);
  if (text.length > 128 * 1024) return undefined;
  return JSON.stringify([CONTACT_AUDIT_CACHE_REVISION, text, negativeZeros]);
}
function storeMeasurements(key: string | undefined, measurements: ContactWitnessMeasurement[]): void {
  if (key === undefined) return;
  const text = JSON.stringify(measurements), bytes = (key.length + text.length) * 2;
  if (bytes > MAX_CACHE_PAYLOAD_BYTES) return;
  measurementCache.set(key, { text, bytes }); cachePayloadBytes += bytes;
  while (measurementCache.size > MAX_CACHE_ENTRIES || cachePayloadBytes > MAX_CACHE_PAYLOAD_BYTES) {
    const oldest = measurementCache.keys().next().value!;
    cachePayloadBytes -= measurementCache.get(oldest)!.bytes; measurementCache.delete(oldest);
  }
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Contact contract requires JSON objects.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v,k))) throw Error('Contact contract has missing or unsupported fields.');
  return v;
}
function contract(ir: AssemblyIR): ContactWitness[] {
  const raw = ir.metadata?.sceliphContactWitnesses;
  if (raw === undefined) return [];
  if (typeof raw !== 'string' || raw.length > 8192) throw Error('Contact contract requires at most 8192 JSON characters.');
  const parsed = object(JSON.parse(raw), ['schema','witnesses']);
  if (parsed.schema !== CONTACT_WITNESS_SCHEMA) throw Error('Unsupported contact contract version.');
  if (!Array.isArray(parsed.witnesses) || parsed.witnesses.length < 1 || parsed.witnesses.length > 8) throw Error('Contact contract requires 1..8 witnesses.');
  const ids = new Set<string>();
  return parsed.witnesses.map(entry => {
    const w = object(entry,['id','ownerId','hostId','ownerLocalMm','minimumClearanceMm']);
    for (const key of ['id','ownerId','hostId']) if (typeof w[key] !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(w[key] as string)) throw Error('Invalid contact ID.');
    if (ids.has(w.id as string) || w.ownerId === w.hostId) throw Error('Duplicate contact or identical contact components.');
    ids.add(w.id as string);
    if (!Array.isArray(w.ownerLocalMm) || w.ownerLocalMm.length !== 3 || w.ownerLocalMm.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 100000)) throw Error('Invalid contact point in local mm.');
    if (typeof w.minimumClearanceMm !== 'number' || !Number.isFinite(w.minimumClearanceMm) || w.minimumClearanceMm < .01 || w.minimumClearanceMm > 100) throw Error('Contact clearance requires 0.01..100 mm.');
    return w as unknown as ContactWitness;
  });
}
function componentMatrix(c: AssemblyComponentIR): Matrix4 {
  return new Matrix4().compose(new Vector3(...(c.position ?? [0,0,0])).multiplyScalar(.001),
    new Quaternion().setFromEuler(new Euler(...(c.rotation ?? [0,0,0]))), new Vector3(...(c.scale ?? [1,1,1])));
}

/** Tests the delivered polygon mesh, not primitive SDF or a bounding box. */
function clearance(geometry: BufferGeometry, matrix: Matrix4, point: Vector3): number {
  const p = geometry.getAttribute('position'), index = geometry.index;
  const count = index?.count ?? p.count;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), near = new Vector3();
  const va = new Vector3(), vb = new Vector3(), vc = new Vector3(), cross = new Vector3();
  const triangle = new Triangle(a,b,c);
  let angle = 0, distance = Infinity;
  for (let i=0;i<count;i+=3) {
    a.fromBufferAttribute(p,index ? index.getX(i) : i).applyMatrix4(matrix);
    b.fromBufferAttribute(p,index ? index.getX(i+1) : i+1).applyMatrix4(matrix);
    c.fromBufferAttribute(p,index ? index.getX(i+2) : i+2).applyMatrix4(matrix);
    triangle.closestPointToPoint(point,near); distance = Math.min(distance, near.distanceTo(point));
    va.copy(a).sub(point); vb.copy(b).sub(point); vc.copy(c).sub(point);
    const la=va.length(), lb=vb.length(), lc=vc.length();
    angle += 2*Math.atan2(va.dot(cross.crossVectors(vb,vc)),la*lb*lc+va.dot(vb)*lc+vb.dot(vc)*la+vc.dot(va)*lb);
  }
  if (!Number.isFinite(angle) || !Number.isFinite(distance)) throw Error('Contact mesh contains invalid numeric data.');
  // A closed interior accumulates +/-4pi; an exterior accumulates 0.
  return (Math.abs(angle) > 2*Math.PI ? 1 : -1)*distance*1000;
}

/** Optional, versioned contract stored in the existing serializable metadata envelope. */
export function auditAssemblyContactWitnesses(ir: AssemblyIR): ContactWitnessMeasurement[] {
  const witnesses = contract(ir);
  if (!witnesses.length) return [];
  validateAssemblyIR(ir);
  // Never reuse a PASS before validating the current declaration and whole IR.
  const key = measurementKey(ir), cached = key === undefined ? undefined : measurementCache.get(key);
  if (cached && key !== undefined) {
    measurementCache.delete(key); measurementCache.set(key, cached);
    return JSON.parse(cached.text) as ContactWitnessMeasurement[];
  }
  const geometries = new Map<string,{geometry: BufferGeometry; matrix: Matrix4}>();
  let triangleCount = 0;
  const material = new MeshBasicMaterial();
  try {
    for (const id of new Set(witnesses.flatMap(w => [w.ownerId,w.hostId]))) {
      const component = ir.components.find(c => c.id === id);
      if (!component) throw Error(`Contact component is missing: ${id}.`);
      const geometry = compileAssemblyGeometry(component.geometry);
      const matrix = componentMatrix(component);
      geometries.set(id,{geometry,matrix}); // Own before any check which may throw.
      const triangles = (geometry.index?.count ?? geometry.getAttribute('position').count)/3;
      triangleCount += triangles;
      if (triangles > 50000 || triangleCount > 200000) throw Error('Contact geometry exceeds triangle budget (50000/200000).');
      if (!analyzeTopology(new Mesh(geometry,material)).pass) throw Error(`Contact requires a closed manifold component: ${id}.`);
      if (!Number.isFinite(matrix.determinant()) || matrix.determinant() <= 0) throw Error('Contact requires a positive, nonsingular component transform.');
    }
    const measurements = witnesses.map(w => {
      const owner=geometries.get(w.ownerId)!, host=geometries.get(w.hostId)!;
      const point = new Vector3(...w.ownerLocalMm).multiplyScalar(.001).applyMatrix4(owner.matrix);
      const ownerClearanceMm=clearance(owner.geometry,owner.matrix,point), hostClearanceMm=clearance(host.geometry,host.matrix,point);
      if (ownerClearanceMm < w.minimumClearanceMm || hostClearanceMm < w.minimumClearanceMm)
        throw Error(`Contact ${w.id} failed: owner ${ownerClearanceMm.toFixed(4)} mm, host ${hostClearanceMm.toFixed(4)} mm; requires ${w.minimumClearanceMm} mm interior clearance. Restore dimensions or explicitly revise the authored contact contract.`);
      return {id:w.id,ownerClearanceMm,hostClearanceMm};
    });
    storeMeasurements(key, measurements);
    return measurements;
  } finally { for (const {geometry} of geometries.values()) geometry.dispose(); material.dispose(); }
}
