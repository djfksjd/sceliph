import { inferReferenceCapabilities, isObservedReference, type ReferenceView } from './reference-set';

/**
 * When the evidence does not resolve depth, should the agent ask for one more
 * photo, and which one? Backed by the pre-registered ABO tests
 * (docs/OSS_INTEGRATION_20261026.ko.md, slices 8–9b):
 *   - a single 3/4 catalog photo already shows depth well enough for box-like
 *     furniture (photo-only footprint error ~7% median; a 90° second view did
 *     not help that stratum);
 *   - near-frontal photos of thin or hanging products (lamps, light fixtures,
 *     fans) leave depth guessed; a 90° side view halved the footprint error
 *     (10.3% → 5.2% median, 18 of 21 items better).
 * This is advice only: it never marks depth as resolved, so the readiness gates
 * keep their meaning.
 */

export type ProductShapeClass = 'thin-structure' | 'box-furniture' | 'other';

export interface ViewAngleEstimate {
  viewId: string;
  /** Camera azimuth relative to the product's front, degrees (0 = straight on). */
  azimuthDeg: number;
  source: 'model-estimate' | 'calibrated';
}

export interface DepthViewAdvice {
  depthResolved: boolean;
  /** Smallest |azimuth| folded to the nearest principal face, per photo (0 = square to a face, 45 = corner-on). */
  obliqueDegByView: Record<string, number>;
  requestSidePhoto: boolean;
  /** Short machine-readable reason. */
  reason: 'depth-resolved' | 'frontal-thin-structure' | 'frontal-photo' | 'oblique-thin-structure' | 'oblique-photo-sufficient' | 'no-angle-estimate';
  /** What to ask the user for, in the viewer's working language. */
  request?: string;
  /** Effect measured on the ABO holdout, for the agent to quote honestly. */
  evidence?: string;
}

/** |azimuth| folded so 0 means square to some face and 45 means looking at a corner. */
export function obliqueness(azimuthDeg: number): number {
  const folded = ((Math.abs(azimuthDeg) % 90) + 90) % 90;
  return Math.min(folded, 90 - folded);
}

const OBLIQUE_DEG = 20;
const SIDE_REQUEST = '같은 제품을 수직축으로 약 90° 돌려 찍은 측면 사진 한 장(같은 높이·같은 거리)';
const THIN_EVIDENCE = 'ABO 사전 등록 평가(9b): 정면 위주 조명·램프·선풍기 21건에서 90° 측면 사진 추가 시 가로·깊이 오차 중앙값 10.3% → 5.2%';
const FURNITURE_EVIDENCE = 'ABO 사전 등록 평가(9b): 3/4 시점 가구 12건은 90° 측면 사진을 더해도 개선 없음';

export function adviseDepthView(views: ReferenceView[], angles: ViewAngleEstimate[], shapeClass: ProductShapeClass = 'other'): DepthViewAdvice {
  const observed = views.filter(isObservedReference);
  const depthResolved = observed.some((view) => inferReferenceCapabilities(view).includes('depth'));
  const photoIds = new Set(observed.filter((view) => (view.sourceType ?? 'photo') === 'photo').map((view) => view.id));
  const obliqueDegByView = Object.fromEntries(angles.filter((angle) => photoIds.has(angle.viewId) && Number.isFinite(angle.azimuthDeg))
    .map((angle) => [angle.viewId, +obliqueness(angle.azimuthDeg).toFixed(1)]));
  if (depthResolved) return { depthResolved, obliqueDegByView, requestSidePhoto: false, reason: 'depth-resolved' };
  const values = Object.values(obliqueDegByView);
  if (values.length === 0) {
    return { depthResolved, obliqueDegByView, requestSidePhoto: true, reason: 'no-angle-estimate', request: SIDE_REQUEST };
  }
  const mostOblique = Math.max(...values);
  if (mostOblique < OBLIQUE_DEG) {
    return {
      depthResolved, obliqueDegByView, requestSidePhoto: true,
      reason: shapeClass === 'thin-structure' ? 'frontal-thin-structure' : 'frontal-photo',
      request: SIDE_REQUEST,
      ...(shapeClass === 'thin-structure' ? { evidence: THIN_EVIDENCE } : {}),
    };
  }
  if (shapeClass === 'thin-structure') {
    return { depthResolved, obliqueDegByView, requestSidePhoto: true, reason: 'oblique-thin-structure', request: SIDE_REQUEST, evidence: THIN_EVIDENCE };
  }
  return { depthResolved, obliqueDegByView, requestSidePhoto: false, reason: 'oblique-photo-sufficient', ...(shapeClass === 'box-furniture' ? { evidence: FURNITURE_EVIDENCE } : {}) };
}
