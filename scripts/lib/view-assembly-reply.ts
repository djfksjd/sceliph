import type { AssemblyIR } from '../../src/engine/assembly-ir';
import { assessAssemblyCandidate, type AssemblyFeedback } from '../../src/engine/assembly-feedback';

/** Splits the {"view", "assembly"} reply; the assembly goes through the normal staged assessment. */
export function parseViewAssemblyReply(text: string, requiredComponentIds: string[]): { feedback: AssemblyFeedback; ir?: AssemblyIR; view?: { azimuthDeg: number; elevationDeg: number }; viewIssue?: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let wrapper: { view?: { azimuthDeg?: unknown; elevationDeg?: unknown }; assembly?: unknown } | undefined;
  try {
    wrapper = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : undefined;
  } catch {
    wrapper = undefined;
  }
  const feedback = assessAssemblyCandidate(wrapper?.assembly === undefined ? text : JSON.stringify(wrapper.assembly), { schema: 'sceliph.assembly-requirements/0.1', requiredComponentIds });
  const azimuth = wrapper?.view?.azimuthDeg;
  const elevation = wrapper?.view?.elevationDeg;
  const viewValid = typeof azimuth === 'number' && Number.isFinite(azimuth) && typeof elevation === 'number' && elevation >= -80 && elevation <= 80;
  return {
    feedback,
    ...(feedback.pass ? { ir: wrapper!.assembly as AssemblyIR } : {}),
    ...(viewValid ? { view: { azimuthDeg: azimuth, elevationDeg: elevation } } : { viewIssue: 'The reply needs "view": {"azimuthDeg": number, "elevationDeg": number between -80 and 80} next to "assembly".' }),
  };
}

