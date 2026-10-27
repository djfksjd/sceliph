import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Manifold, ManifoldToplevel } from '../../vendor/manifold-3d-3.5.4/manifold';
import type { AssemblyGeometryIR } from './assembly-ir';

/**
 * Exact mesh booleans for AssemblyIR through Manifold (Apache-2.0,
 * vendor/manifold-3d-3.5.4: only the runtime manifold.js/manifold.wasm are
 * copied). The single-threaded WASM build is deterministic. Booleans run on
 * the compiled operand meshes, so the result is as exact as those meshes; it is
 * not a BREP/CAD kernel.
 */

export interface BooleanOperandIR {
  geometry: AssemblyGeometryIR;
  /** Operand placement inside the component, millimetres. */
  position?: [number, number, number];
  /** Radians, XYZ Euler. */
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface BooleanCsgIR {
  op: 'booleanCSG';
  /** `difference` subtracts every later operand from the first. */
  operation: 'union' | 'difference' | 'intersection';
  operands: BooleanOperandIR[];
}

export const MAX_BOOLEAN_OPERANDS = 8;
export const MAX_BOOLEAN_DEPTH = 2;
const CREASE_ANGLE = Math.PI / 6;
const MERGE_TOLERANCE_M = 1e-7;

let toplevel: ManifoldToplevel | undefined;
let loading: Promise<ManifoldToplevel> | undefined;

/** Loads the Manifold WASM once. Compiling a booleanCSG before this resolves throws. */
export async function initManifold(): Promise<void> {
  if (toplevel) return;
  loading ??= (async () => {
    const { default: Module } = await import('../../vendor/manifold-3d-3.5.4/manifold.js');
    const wasm = await Module();
    wasm.setup();
    return wasm;
  })();
  toplevel = await loading;
}

export function isManifoldReady(): boolean {
  return toplevel !== undefined;
}

/** True when an assembly declares any boolean (operands can only nest inside booleans). */
export function assemblyNeedsManifold(ir: { components: Array<{ geometry: AssemblyGeometryIR }> }): boolean {
  return ir.components.some((component) => component.geometry?.op === 'booleanCSG');
}

/** Loads optional runtimes an assembly needs before the synchronous compiler runs. */
export async function prepareAssemblyRuntime(ir: { components: Array<{ geometry: AssemblyGeometryIR }> }): Promise<void> {
  if (assemblyNeedsManifold(ir)) await initManifold();
}

function operandMatrix(operand: BooleanOperandIR): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(operand.position ?? [0, 0, 0]).map((value) => value / 1000) as [number, number, number]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(operand.rotation ?? [0, 0, 0]))),
    new THREE.Vector3(...(operand.scale ?? [1, 1, 1])),
  );
}

function toManifold(wasm: ManifoldToplevel, source: THREE.BufferGeometry, matrix: THREE.Matrix4, label: string): Manifold {
  const positionOnly = new THREE.BufferGeometry();
  positionOnly.setAttribute('position', source.getAttribute('position').clone());
  if (source.index) positionOnly.setIndex(source.index.clone());
  positionOnly.applyMatrix4(matrix);
  const merged = mergeVertices(positionOnly, MERGE_TOLERANCE_M);
  positionOnly.dispose();
  try {
    const position = merged.getAttribute('position');
    const index = merged.index!;
    const mesh = new wasm.Mesh({
      numProp: 3,
      vertProperties: Float32Array.from(position.array as ArrayLike<number>),
      triVerts: Uint32Array.from(index.array as ArrayLike<number>),
    });
    mesh.merge();
    const manifold = wasm.Manifold.ofMesh(mesh);
    const status = manifold.status();
    if (status !== 'NoError') {
      manifold.delete();
      throw new Error(`Boolean operand ${label} is not a closed manifold mesh (${status}).`);
    }
    return manifold;
  } finally {
    merged.dispose();
  }
}

/**
 * Compiles a booleanCSG descriptor. `compileOperand` returns an operand's mesh
 * in metres (the compiler's internal unit); the result is returned in metres
 * with crease-angle normals and no UVs (the compiler adds primary UVs).
 */
export function compileBooleanCsg(geometry: BooleanCsgIR, compileOperand: (operand: AssemblyGeometryIR) => THREE.BufferGeometry): THREE.BufferGeometry {
  if (!toplevel) throw new Error('booleanCSG requires the Manifold runtime; await initManifold() before compiling.');
  const wasm = toplevel;
  const live: Manifold[] = [];
  try {
    for (const [index, operand] of geometry.operands.entries()) {
      const compiled = compileOperand(operand.geometry);
      try {
        live.push(toManifold(wasm, compiled, operandMatrix(operand), String(index)));
      } finally {
        compiled.dispose();
      }
    }
    const result = geometry.operation === 'union'
      ? wasm.Manifold.union(live)
      : geometry.operation === 'difference'
        ? wasm.Manifold.difference(live)
        : wasm.Manifold.intersection(live);
    live.push(result);
    if (result.status() !== 'NoError') throw new Error(`Boolean ${geometry.operation} failed (${result.status()}).`);
    if (result.isEmpty()) throw new Error(`Boolean ${geometry.operation} produced an empty solid.`);
    const mesh = result.getMesh();
    const indexed = new THREE.BufferGeometry();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let vertex = 0; vertex < mesh.numVert; vertex += 1) {
      positions[vertex * 3] = mesh.vertProperties[vertex * mesh.numProp]!;
      positions[vertex * 3 + 1] = mesh.vertProperties[vertex * mesh.numProp + 1]!;
      positions[vertex * 3 + 2] = mesh.vertProperties[vertex * mesh.numProp + 2]!;
    }
    indexed.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    indexed.setIndex(new THREE.BufferAttribute(Uint32Array.from(mesh.triVerts), 1));
    const creased = toCreasedNormals(indexed, CREASE_ANGLE);
    indexed.dispose();
    creased.userData.booleanCsg = { operation: geometry.operation, operands: geometry.operands.length, genus: result.genus(), triangles: mesh.numTri };
    return creased;
  } finally {
    for (const manifold of live) manifold.delete();
  }
}
