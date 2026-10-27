import { describe, expect, it } from 'vitest';
import { adviseDepthView, obliqueness } from '../src/engine/depth-view-advice';
import { evaluateSemiProfessionalReadiness } from '../src/engine/evidence-readiness';
import type { ReferenceRole, ReferenceView } from '../src/engine/reference-set';

const photo = (id: string, role: ReferenceRole): ReferenceView => ({
  id, assetKind: 'product', url: `blob:${id}`, fileName: `${id}.jpg`, fileSize: 4096, mimeType: 'image/jpeg', lastModified: 1, role,
  evidence: { fileName: `${id}.jpg`, width: 1600, height: 1600, averageColor: '#777777', brightness: 0.5, portraitSuitability: 90, notes: [] },
});

describe('depth view advice', () => {
  it('folds azimuths to the nearest face', () => {
    expect(obliqueness(0)).toBe(0);
    expect(obliqueness(-30)).toBe(30);
    expect(obliqueness(45)).toBe(45);
    expect(obliqueness(170)).toBe(10);
    expect(obliqueness(-95)).toBe(5);
  });

  it('asks for a 90° side photo when a frontal photo leaves depth guessed', () => {
    const advice = adviseDepthView([photo('front', 'front')], [{ viewId: 'front', azimuthDeg: 5, source: 'model-estimate' }], 'thin-structure');
    expect(advice).toMatchObject({ depthResolved: false, requestSidePhoto: true, reason: 'frontal-thin-structure' });
    expect(advice.request).toMatch(/90°/);
    expect(advice.evidence).toMatch(/10\.3% → 5\.2%/);
  });

  it('accepts one 3/4 photo for box furniture but still asks for thin structures', () => {
    const angles = [{ viewId: 'hero', azimuthDeg: -35, source: 'model-estimate' as const }];
    expect(adviseDepthView([photo('hero', 'front')], angles, 'box-furniture')).toMatchObject({ requestSidePhoto: false, reason: 'oblique-photo-sufficient' });
    expect(adviseDepthView([photo('hero', 'front')], angles, 'thin-structure')).toMatchObject({ requestSidePhoto: true, reason: 'oblique-thin-structure' });
  });

  it('stays silent once a side view resolves depth', () => {
    const advice = adviseDepthView([photo('front', 'front'), photo('side', 'left')], [{ viewId: 'front', azimuthDeg: 0, source: 'model-estimate' }], 'thin-structure');
    expect(advice).toMatchObject({ depthResolved: true, requestSidePhoto: false, reason: 'depth-resolved' });
  });

  it('puts the side-photo request first in the readiness next actions without resolving depth', () => {
    const report = evaluateSemiProfessionalReadiness([photo('front', 'front')], {
      profile: 'product-visualization',
      viewAngles: [{ viewId: 'front', azimuthDeg: 3, source: 'model-estimate' }],
      shapeClass: 'thin-structure',
    });
    expect(report.depthViewAdvice?.requestSidePhoto).toBe(true);
    expect(report.nextActions[0]).toMatch(/^깊이 근거 요청: .*90°/);
    expect(report.unresolvedCapabilities).toContain('depth');
    expect(report.buildReady).toBe(false);
    const without = evaluateSemiProfessionalReadiness([photo('front', 'front')], { profile: 'product-visualization' });
    expect(without.depthViewAdvice).toBeUndefined();
  });
});
