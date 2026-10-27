import * as THREE from 'three';
import { compileAssemblyGeometry, validateAssemblyIR } from './assembly-compiler';
import type { AssemblyIR } from './assembly-ir';

/**
 * Scores a candidate AssemblyIR against a ground-truth IR by compiled world
 * bounds: per-part size, offset from the reference part, and floor height.
 * A photo fixes geometry only up to a yaw about +Y and the order of identical
 * parts, so the best of four 90° yaws and the best assignment inside each
 * group of truth parts with identical geometry are used. Evaluation only.
 */

export interface TruthCompareItem {
  componentId: string;
  /** Candidate component matched to this truth component (differs only inside identical groups). */
  candidateId: string | null;
  kind: 'size' | 'offset' | 'floor';
  axis: 'x' | 'y' | 'z';
  truthMm: number;
  candidateMm: number | null;
  /** Size: |Δ| / truth size. Offset and floor: |Δ| / truth assembly extent. */
  relativeError: number | null;
}

export interface TruthCompareResult {
  schema: 'sceliph.assembly-truth-compare/0.1';
  yawDeg: 0 | 90 | 180 | 270;
  extentMm: number;
  items: TruthCompareItem[];
  missingComponentIds: string[];
  summary: {
    medianSizeError: number | null;
    maxSizeError: number | null;
    medianPlacementError: number | null;
    maxPlacementError: number | null;
    /** Share of all items within 5% / 10% (missing items count as misses). */
    within5: number;
    within10: number;
  };
}

interface Bounds { centre: THREE.Vector3; size: THREE.Vector3; min: THREE.Vector3 }

const AXES = ['x', 'y', 'z'] as const;
const MAX_GROUP_PERMUTATION = 6;

function componentBounds(ir: AssemblyIR): Map<string, Bounds> {
  const out = new Map<string, Bounds>();
  for (const component of ir.components) {
    const geometry = compileAssemblyGeometry(component.geometry);
    try {
      geometry.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(...(component.position ?? [0, 0, 0]).map((value) => value / 1000) as [number, number, number]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(component.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(...(component.scale ?? [1, 1, 1])),
      ));
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!.clone();
      box.min.multiplyScalar(1000);
      box.max.multiplyScalar(1000);
      out.set(component.id, { centre: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()), min: box.min.clone() });
    } finally {
      geometry.dispose();
    }
  }
  return out;
}

/** Rotates bounds by a multiple of 90° about +Y (exact for axis-aligned boxes). */
function yawBounds(bounds: Bounds, quarterTurns: number): Bounds {
  const centre = bounds.centre.clone();
  const size = bounds.size.clone();
  for (let turn = 0; turn < quarterTurns; turn += 1) {
    centre.set(centre.z, centre.y, -centre.x);
    size.set(size.z, size.y, size.x);
  }
  return { centre, size, min: new THREE.Vector3(centre.x - size.x / 2, bounds.min.y, centre.z - size.z / 2) };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function compareAssemblyToTruth(candidate: AssemblyIR, truth: AssemblyIR, referenceComponentId: string): TruthCompareResult {
  validateAssemblyIR(truth);
  validateAssemblyIR(candidate);
  if (!truth.components.some((component) => component.id === referenceComponentId)) throw new Error('Reference component is not in the truth assembly.');
  const truthBounds = componentBounds(truth);
  const candidateBounds = componentBounds(candidate);
  const whole = new THREE.Box3();
  for (const bounds of truthBounds.values()) whole.union(new THREE.Box3().setFromCenterAndSize(bounds.centre, bounds.size));
  const extent = Math.max(...whole.getSize(new THREE.Vector3()).toArray());

  const signature = (component: AssemblyIR['components'][number]) => JSON.stringify([component.geometry, component.rotation ?? [0, 0, 0], component.scale ?? [1, 1, 1]]);
  const groups: string[][] = [];
  for (const component of truth.components) {
    const group = component.id === referenceComponentId ? undefined : groups.find((members) => members[0] !== referenceComponentId
      && signature(truth.components.find((item) => item.id === members[0])!) === signature(component));
    if (group) group.push(component.id);
    else groups.push([component.id]);
  }
  for (const group of groups) {
    if (group.length > MAX_GROUP_PERMUTATION) throw new Error(`Identical group ${group.join(', ')} is too large to match exhaustively.`);
  }

  const score = (quarterTurns: number) => {
    const yawed = new Map([...candidateBounds].map(([id, bounds]) => [id, yawBounds(bounds, quarterTurns)]));
    const reference = yawed.get(referenceComponentId);
    const items: TruthCompareItem[] = [];
    let cost = 0;
    const itemsFor = (truthId: string, candidateId: string | null): TruthCompareItem[] => {
      const t = truthBounds.get(truthId)!;
      const c = candidateId === null ? undefined : yawed.get(candidateId);
      const tRef = truthBounds.get(referenceComponentId)!;
      const out: TruthCompareItem[] = AXES.map((axis) => {
        const value = c ? c.size[axis] : null;
        return { componentId: truthId, candidateId: c ? candidateId : null, kind: 'size', axis, truthMm: t.size[axis], candidateMm: value, relativeError: value === null ? null : Math.abs(value - t.size[axis]) / t.size[axis] };
      });
      if (truthId !== referenceComponentId) {
        for (const axis of AXES) {
          const truthOffset = t.centre[axis] - tRef.centre[axis];
          const value = c && reference ? c.centre[axis] - reference.centre[axis] : null;
          out.push({ componentId: truthId, candidateId: c ? candidateId : null, kind: 'offset', axis, truthMm: truthOffset, candidateMm: value, relativeError: value === null ? null : Math.abs(value - truthOffset) / extent });
        }
      }
      const floor = c ? c.min.y : null;
      out.push({ componentId: truthId, candidateId: c ? candidateId : null, kind: 'floor', axis: 'y', truthMm: t.min.y, candidateMm: floor, relativeError: floor === null ? null : Math.abs(floor - t.min.y) / extent });
      return out;
    };
    const itemCost = (list: TruthCompareItem[]) => list.reduce((sum, item) => sum + (item.relativeError ?? 1), 0);
    for (const group of groups) {
      let best: TruthCompareItem[] | undefined;
      let bestCost = Infinity;
      for (const order of permutations(group)) {
        const list = group.flatMap((truthId, index) => itemsFor(truthId, yawed.has(order[index]!) ? order[index]! : null));
        const value = itemCost(list);
        if (value < bestCost) {
          bestCost = value;
          best = list;
        }
      }
      items.push(...best!);
      cost += bestCost;
    }
    return { items, cost };
  };

  let bestTurns = 0;
  let best = score(0);
  for (const turns of [1, 2, 3]) {
    const next = score(turns);
    if (next.cost < best.cost) {
      best = next;
      bestTurns = turns;
    }
  }
  const sizeErrors = best.items.filter((item) => item.kind === 'size' && item.relativeError !== null).map((item) => item.relativeError!);
  const placementErrors = best.items.filter((item) => item.kind !== 'size' && item.relativeError !== null).map((item) => item.relativeError!);
  const within = (limit: number) => best.items.filter((item) => item.relativeError !== null && item.relativeError <= limit).length / best.items.length;
  const round = (value: number | null) => (value === null ? null : +value.toFixed(4));
  return {
    schema: 'sceliph.assembly-truth-compare/0.1',
    yawDeg: (bestTurns * 90) as TruthCompareResult['yawDeg'],
    extentMm: extent,
    items: best.items.map((item) => ({ ...item, truthMm: +item.truthMm.toFixed(2), candidateMm: item.candidateMm === null ? null : +item.candidateMm.toFixed(2), relativeError: round(item.relativeError) })),
    missingComponentIds: truth.components.filter((component) => !candidateBounds.has(component.id)).map((component) => component.id),
    summary: {
      medianSizeError: round(median(sizeErrors)),
      maxSizeError: round(sizeErrors.length ? Math.max(...sizeErrors) : null),
      medianPlacementError: round(median(placementErrors)),
      maxPlacementError: round(placementErrors.length ? Math.max(...placementErrors) : null),
      within5: +within(0.05).toFixed(4),
      within10: +within(0.1).toFixed(4),
    },
  };
}
