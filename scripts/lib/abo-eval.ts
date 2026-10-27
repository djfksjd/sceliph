import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as THREE from 'three';
import { compileAssemblyGeometry } from '../../src/engine/assembly-compiler';
import type { AssemblyIR } from '../../src/engine/assembly-ir';
import type { MeshCompareResult } from '../../src/engine/mesh-shape-compare';
import { worldTriangleMesh, type WorldTriangleMesh } from '../../src/engine/mesh-silhouette-raster';
import { readMaskPng } from './moge-runtime';

/** Shared pieces of the ABO catalog-photo evaluations (scripts/abo-*-eval.ts). */

/** Pads with white and scales so the longest side is maxSide; returns PNG bytes and the RGBA pixels. */
export async function preparePhoto(path: string, protocol: { padShare: number; maxSide: number }): Promise<{ png: Buffer; rgba: Uint8ClampedArray; width: number; height: number }> {
  const image = await loadImage(readFileSync(path));
  const pad = Math.round(protocol.padShare * Math.max(image.width, image.height));
  const scale = protocol.maxSide / (Math.max(image.width, image.height) + 2 * pad);
  const width = Math.round((image.width + 2 * pad) * scale);
  const height = Math.round((image.height + 2 * pad) * scale);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, pad * scale, pad * scale, image.width * scale, image.height * scale);
  return { png: canvas.toBuffer('image/png'), rgba: context.getImageData(0, 0, width, height).data, width, height };
}

export function maskBox(mask: Uint8Array, width: number): [number, number, number, number] | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return x1 < 0 ? undefined : [x0, y0, x1 + 1, y1 + 1];
}

/** B1: the silhouette inside its bounding box, on a grid, extruded to depth = width; exterior faces only. */
export function extrudedSilhouette(mask: Uint8Array, width: number, box: [number, number, number, number], heightMm: number): WorldTriangleMesh {
  const [x0, y0, x1, y1] = box;
  const cols = 64;
  const rows = Math.max(4, Math.min(256, Math.round(cols * (y1 - y0) / (x1 - x0))));
  const widthMm = heightMm * (x1 - x0) / (y1 - y0);
  const depth = widthMm;
  const on = (c: number, r: number): boolean => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    let hit = 0;
    let total = 0;
    for (let y = Math.floor(y0 + r * (y1 - y0) / rows); y < Math.floor(y0 + (r + 1) * (y1 - y0) / rows); y += 1) {
      for (let x = Math.floor(x0 + c * (x1 - x0) / cols); x < Math.floor(x0 + (c + 1) * (x1 - x0) / cols); x += 1) {
        hit += mask[y * width + x] ? 1 : 0;
        total += 1;
      }
    }
    return total > 0 && hit * 2 >= total;
  };
  const positions: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  const cw = widthMm / cols;
  const ch = heightMm / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!on(c, r)) continue;
      const xa = -widthMm / 2 + c * cw;
      const xb = xa + cw;
      const yb = heightMm - r * ch;
      const ya = yb - ch;
      const [za, zb] = [-depth / 2, depth / 2];
      quad([xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb]);
      quad([xb, ya, za], [xa, ya, za], [xa, yb, za], [xb, yb, za]);
      if (!on(c - 1, r)) quad([xa, ya, za], [xa, ya, zb], [xa, yb, zb], [xa, yb, za]);
      if (!on(c + 1, r)) quad([xb, ya, zb], [xb, ya, za], [xb, yb, za], [xb, yb, zb]);
      if (!on(c, r - 1)) quad([xa, yb, zb], [xb, yb, zb], [xb, yb, za], [xa, yb, za]);
      if (!on(c, r + 1)) quad([xa, ya, za], [xb, ya, za], [xb, ya, zb], [xa, ya, zb]);
    }
  }
  return { positions: Float64Array.from(positions) };
}

export function boxMesh(widthMm: number, heightMm: number, depthMm: number): WorldTriangleMesh {
  const geometry = new THREE.BoxGeometry(widthMm / 1000, heightMm / 1000, depthMm / 1000);
  const mesh = worldTriangleMesh(geometry, new THREE.Matrix4().makeTranslation(0, heightMm / 2000, 0));
  geometry.dispose();
  return mesh;
}

export function assemblyMeshes(ir: AssemblyIR): WorldTriangleMesh[] {
  return ir.components.map((component) => {
    const geometry = compileAssemblyGeometry(component.geometry);
    try {
      return worldTriangleMesh(geometry, new THREE.Matrix4().compose(
        new THREE.Vector3(...(component.position ?? [0, 0, 0]).map((value) => value / 1000) as [number, number, number]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(component.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(...(component.scale ?? [1, 1, 1])),
      ));
    } finally {
      geometry.dispose();
    }
  });
}

/** Largest compiled bounding-box volume: the part that anchors world coordinates. */
export function largestComponent(ir: AssemblyIR): string {
  let best = ir.components[0]!.id;
  let volume = -1;
  for (const [index, mesh] of assemblyMeshes(ir).entries()) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i += 3) for (let a = 0; a < 3; a += 1) { min[a] = Math.min(min[a]!, mesh.positions[i + a]!); max[a] = Math.max(max[a]!, mesh.positions[i + a]!); }
    const v = (max[0]! - min[0]!) * (max[1]! - min[1]!) * (max[2]! - min[2]!);
    if (v > volume) {
      volume = v;
      best = ir.components[index]!.id;
    }
  }
  return best;
}

export const summarize = (result: MeshCompareResult) => ({ meanIoU: result.meanIoU, chamfer: result.chamfer, fScore5: result.fScore.at5, fScore2: result.fScore.at2, extentError: result.extentError, yawDeg: result.yawDeg });

/** Foreground pixels: any channel below the threshold (the dataset's background is white). */
export function foregroundMask(rgba: Uint8ClampedArray, width: number, height: number, threshold: number): Uint8Array {
  const foreground = new Uint8Array(width * height);
  for (let i = 0; i < foreground.length; i += 1) {
    foreground[i] = Math.min(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!) < threshold ? 1 : 0;
  }
  return foreground;
}

/** SAM 2.1 object mask through scripts/segment-parts.ts, prompted with one box. */
export async function samObjectMask(options: { photoFile: string; box: [number, number, number, number]; workDir: string; stem: string; width: number; height: number; maxSide: number; samRuntimeDir: string; samModelDir: string }): Promise<Uint8Array> {
  const segDir = join(options.workDir, `${options.stem}-sam`);
  const promptsFile = join(options.workDir, `${options.stem}-prompts.json`);
  writeFileSync(promptsFile, JSON.stringify([{ id: 'object', text: 'the product', box: options.box }]));
  const run = spawnSync('npx', ['vite-node', 'scripts/segment-parts.ts', '--', '--runtime-dir', resolve(options.samRuntimeDir), '--model-dir', resolve(options.samModelDir),
    '--input', options.photoFile, '--prompts', promptsFile, '--output', segDir, '--max-side', String(options.maxSide)], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`SAM failed for ${options.stem}: ${run.stderr.slice(-600)}`);
  return readMaskPng(join(segDir, 'object.png'), options.width, options.height, 'luma');
}

/** Majority vote of the mask pixels in each cell of a cols × rows grid over the box. */
function maskGrid(mask: Uint8Array, width: number, box: [number, number, number, number], cols: number, rows: number): Uint8Array {
  const [x0, y0, x1, y1] = box;
  const grid = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      let hit = 0;
      let total = 0;
      for (let y = Math.floor(y0 + r * (y1 - y0) / rows); y < Math.floor(y0 + (r + 1) * (y1 - y0) / rows); y += 1) {
        for (let x = Math.floor(x0 + c * (x1 - x0) / cols); x < Math.floor(x0 + (c + 1) * (x1 - x0) / cols); x += 1) {
          hit += mask[y * width + x] ? 1 : 0;
          total += 1;
        }
      }
      grid[r * cols + c] = total > 0 && hit * 2 >= total ? 1 : 0;
    }
  }
  return grid;
}

/**
 * B2: two-view visual hull. The front silhouette swept along Z intersected with
 * the side silhouette (the turntable photo a quarter turn later) swept along X.
 * Each silhouette's height is scaled to the listed height, so the two photos'
 * different crops do not matter; exterior voxel faces only.
 */
export function visualHull(front: { mask: Uint8Array; width: number; box: [number, number, number, number] }, side: { mask: Uint8Array; width: number; box: [number, number, number, number] }, heightMm: number): WorldTriangleMesh {
  const aspect = (box: [number, number, number, number]) => (box[2] - box[0]) / (box[3] - box[1]);
  const widthMm = heightMm * aspect(front.box);
  const depthMm = heightMm * aspect(side.box);
  const cols = 64;
  const layers = 64;
  const rows = Math.max(4, Math.min(256, Math.round(cols * heightMm / Math.max(widthMm, depthMm))));
  const frontGrid = maskGrid(front.mask, front.width, front.box, cols, rows);
  const sideGrid = maskGrid(side.mask, side.width, side.box, layers, rows);
  const on = (c: number, k: number, r: number): boolean => c >= 0 && k >= 0 && r >= 0 && c < cols && k < layers && r < rows && frontGrid[r * cols + c] === 1 && sideGrid[r * layers + k] === 1;
  const positions: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  const cw = widthMm / cols;
  const cd = depthMm / layers;
  const ch = heightMm / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let k = 0; k < layers; k += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!on(c, k, r)) continue;
        const xa = -widthMm / 2 + c * cw;
        const xb = xa + cw;
        const za = -depthMm / 2 + k * cd;
        const zb = za + cd;
        const yb = heightMm - r * ch;
        const ya = yb - ch;
        if (!on(c, k + 1, r)) quad([xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb]);
        if (!on(c, k - 1, r)) quad([xb, ya, za], [xa, ya, za], [xa, yb, za], [xb, yb, za]);
        if (!on(c - 1, k, r)) quad([xa, ya, za], [xa, ya, zb], [xa, yb, zb], [xa, yb, za]);
        if (!on(c + 1, k, r)) quad([xb, ya, zb], [xb, ya, za], [xb, yb, za], [xb, yb, zb]);
        if (!on(c, k, r - 1)) quad([xa, yb, zb], [xb, yb, zb], [xb, yb, za], [xa, yb, za]);
        if (!on(c, k, r + 1)) quad([xa, ya, za], [xb, ya, za], [xb, ya, zb], [xa, ya, zb]);
      }
    }
  }
  return { positions: Float64Array.from(positions) };
}
