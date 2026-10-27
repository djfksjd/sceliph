import * as THREE from 'three';
import { compileAssemblyIR, validateAssemblyIR } from './assembly-compiler';
import type { AssemblyIR } from './assembly-ir';
import { initManifold } from './boolean-csg';
import { auditDimensionContracts, validateDimensionContracts, type DimensionContract } from './dimension-contract';

/**
 * Execution feedback for LLM-authored AssemblyIR, following the multi-turn
 * "compile, measure, correct, keep the best" pattern reported by CAD
 * generation work such as IterCAD and CADENA. Requirements come from the user
 * or an evidence pack, never from the candidate itself. Feedback is advisory
 * text for the next model turn; this module never edits a candidate.
 */

export interface AssemblyRequirements {
  schema: 'sceliph.assembly-requirements/0.1';
  /** Component ids the candidate must declare. */
  requiredComponentIds?: string[];
  /** Evidence-bound dimensions re-measured on the compiled candidate. */
  dimensions?: DimensionContract[];
  /** Upper bound on compiled triangles. */
  maxTriangles?: number;
}

export type AssemblyFeedbackStage = 'parse' | 'schema' | 'compile' | 'requirements' | 'pass';

export interface AssemblyFeedbackIssue {
  code: 'parse-error' | 'schema-error' | 'compile-error' | 'missing-component' | 'dimension' | 'topology' | 'triangle-budget';
  message: string;
  /** A concrete edit that would satisfy the check, when one can be derived exactly. */
  fix?: string;
}

export interface AssemblyFeedback {
  schema: 'sceliph.assembly-feedback/0.1';
  stage: AssemblyFeedbackStage;
  pass: boolean;
  /** 0..1, monotone in how far the candidate got; used only to rank candidates. */
  score: number;
  issues: AssemblyFeedbackIssue[];
  measured?: {
    triangles: number;
    topologyPass: boolean;
    assemblySizeMm: [number, number, number];
    dimensionChecks: Array<{ id: string; expectedMm: number; actualMm: number | null; toleranceMm: number; pass: boolean }>;
  };
}

const MAX_CANDIDATE_BYTES = 512 * 1024;
const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Exact parameter edit for a component-size mismatch on simple primitives (identity rotation). */
function sizeFix(ir: AssemblyIR, contract: DimensionContract, actualMm: number): string | undefined {
  if (contract.target.kind !== 'component' || contract.measurement !== 'size' || contract.axis === 'spatial') return undefined;
  const componentId = contract.target.componentId;
  const index = ir.components.findIndex((component) => component.id === componentId);
  const component = ir.components[index];
  if (!component || (component.rotation ?? [0, 0, 0]).some((value) => value !== 0)) return undefined;
  const axis = AXIS_INDEX[contract.axis];
  const scale = Math.abs(component.scale?.[axis] ?? 1);
  if (!(scale > 0)) return undefined;
  const target = contract.expectedMm / scale;
  const geometry = component.geometry;
  const at = `components[${index}] (${componentId})`;
  // A curved part whose declared diameter already matches but measures short
  // is a tessellation shortfall: ask for more segments, never a larger radius.
  const tessellation = (field: string, radius: number, current: number): string | undefined => {
    if (!(actualMm < contract.expectedMm) || Math.abs(2 * radius * scale - contract.expectedMm) > contract.toleranceMm) return undefined;
    const ratio = Math.min(1, Math.max(1e-6, (contract.expectedMm - contract.toleranceMm / 2) / (2 * radius * scale)));
    const needed = ratio >= 1 ? current * 2 : Math.ceil(Math.PI / Math.acos(ratio));
    const segments = Math.max(32, Math.ceil(Math.max(needed, current + 1) / 4) * 4);
    return `keep the declared radius ${round(radius)} (it already matches); the shortfall is polygon tessellation, so set ${at}.geometry.${field} to ${segments}`;
  };
  if (geometry.op === 'tube') {
    const fix = tessellation('radialSegments', geometry.radius, geometry.radialSegments ?? 10);
    if (fix) return fix;
  }
  if (geometry.op === 'cylinder' && axis !== 1) {
    const fix = tessellation('radialSegments', Math.max(geometry.radiusTop, geometry.radiusBottom), geometry.radialSegments ?? 48);
    if (fix) return fix;
  }
  if (geometry.op === 'sphere') {
    const fix = tessellation(axis === 1 ? 'heightSegments' : 'widthSegments', geometry.radius, axis === 1 ? geometry.heightSegments ?? 28 : geometry.widthSegments ?? 48);
    if (fix) return fix;
  }
  if (geometry.op === 'roundedBox') return `set ${at}.geometry.size[${axis}] to ${round(target)}`;
  if (geometry.op === 'sphere') return `set ${at}.geometry.radius to ${round(target / 2)}`;
  if (geometry.op === 'cylinder') {
    if (axis === 1) return `set ${at}.geometry.depth to ${round(target)}`;
    const ratio = target / (actualMm / scale);
    return `scale ${at}.geometry.radiusTop and radiusBottom by ${round(ratio)} (to ${round(geometry.radiusTop * ratio)} and ${round(geometry.radiusBottom * ratio)})`;
  }
  const ratio = contract.expectedMm / actualMm;
  return `scale ${at} geometry along ${contract.axis} by ${round(ratio)} so its compiled size becomes ${round(contract.expectedMm)} mm`;
}

export function assessAssemblyCandidate(text: string, requirements: AssemblyRequirements): AssemblyFeedback {
  if (requirements.schema !== 'sceliph.assembly-requirements/0.1') throw new Error('Unsupported assembly requirements schema.');
  if (requirements.dimensions) {
    // Validate the requirements on their own terms; whether the candidate has
    // the referenced parts is reported as feedback, not as an exception.
    const referenced = new Set(requirements.requiredComponentIds ?? []);
    const anchors = new Map<string, Set<string>>();
    for (const contract of requirements.dimensions) {
      if (contract.target.kind === 'component') referenced.add(contract.target.componentId);
      if (contract.target.kind === 'anchorPair') {
        for (const ref of [contract.target.from, contract.target.to]) {
          referenced.add(ref.componentId);
          anchors.set(ref.componentId, (anchors.get(ref.componentId) ?? new Set()).add(ref.anchorId));
        }
      }
    }
    validateDimensionContracts(requirements.dimensions, referenced, anchors);
  }
  const base = { schema: 'sceliph.assembly-feedback/0.1' as const };
  if (typeof text !== 'string' || text.length > MAX_CANDIDATE_BYTES) {
    return { ...base, stage: 'parse', pass: false, score: 0, issues: [{ code: 'parse-error', message: `Candidate must be a JSON string of at most ${MAX_CANDIDATE_BYTES} bytes.` }] };
  }
  let ir: AssemblyIR;
  try {
    // Accept a single fenced JSON block, which chat models commonly emit.
    const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text);
    ir = JSON.parse(fenced ? fenced[1]! : text) as AssemblyIR;
  } catch (error) {
    return { ...base, stage: 'parse', pass: false, score: 0, issues: [{ code: 'parse-error', message: `Not valid JSON: ${(error as Error).message}`, fix: 'Reply with exactly one JSON object and no prose.' }] };
  }
  try {
    validateAssemblyIR(ir);
  } catch (error) {
    return { ...base, stage: 'schema', pass: false, score: 0.05, issues: [{ code: 'schema-error', message: (error as Error).message }] };
  }
  let build: ReturnType<typeof compileAssemblyIR>;
  try {
    build = compileAssemblyIR(ir, 'clay');
  } catch (error) {
    return { ...base, stage: 'compile', pass: false, score: 0.1, issues: [{ code: 'compile-error', message: (error as Error).message }] };
  }
  try {
    const issues: AssemblyFeedbackIssue[] = [];
    const ids = new Set(ir.components.map((component) => component.id));
    for (const id of requirements.requiredComponentIds ?? []) {
      if (!ids.has(id)) issues.push({ code: 'missing-component', message: `Required component ${id} is missing.`, fix: `add a component with id "${id}"` });
    }
    const audit = requirements.dimensions?.length ? auditDimensionContracts(build.root, requirements.dimensions) : undefined;
    for (const check of audit?.checks ?? []) {
      if (check.pass) continue;
      const contract = requirements.dimensions!.find((item) => item.id === check.id)!;
      issues.push({
        code: 'dimension',
        message: check.actualMm === null
          ? `${check.id} (${check.label}): target has no compiled bounds.`
          : `${check.id} (${check.label}): measured ${round(check.actualMm)} mm along ${check.axis}, required ${round(check.expectedMm)} ± ${round(check.toleranceMm)} mm.`,
        ...(check.actualMm === null ? {} : { fix: sizeFix(ir, contract, check.actualMm) }),
      });
    }
    const topology = build.metrics.topology;
    if (!topology.pass) {
      issues.push({ code: 'topology', message: `Compiled mesh topology fails: ${topology.boundaryEdges} boundary edges, ${topology.nonManifoldEdges} non-manifold edges, ${topology.degenerateTriangles} degenerate triangles.` });
    }
    if (requirements.maxTriangles !== undefined && topology.triangles > requirements.maxTriangles) {
      issues.push({ code: 'triangle-budget', message: `Compiled mesh has ${topology.triangles} triangles; the budget is ${requirements.maxTriangles}.`, fix: 'lower segment counts on curved parts' });
    }
    const extent = new THREE.Box3().setFromObject(build.root).getSize(new THREE.Vector3()).multiplyScalar(1000);
    const size: [number, number, number] = [round(extent.x), round(extent.y), round(extent.z)];
    const checks = audit?.checks ?? [];
    const passed = checks.filter((check) => check.pass).length;
    const requiredCount = requirements.requiredComponentIds?.length ?? 0;
    const presentCount = (requirements.requiredComponentIds ?? []).filter((id) => ids.has(id)).length;
    const total = checks.length + requiredCount;
    let score = 0.2 + 0.8 * (total === 0 ? 1 : (passed + presentCount) / total);
    if (!topology.pass) score = Math.min(score, 0.5);
    if (requirements.maxTriangles !== undefined && topology.triangles > requirements.maxTriangles) score = Math.min(score, 0.6);
    const pass = issues.length === 0;
    return {
      ...base,
      stage: pass ? 'pass' : 'requirements',
      pass,
      score: pass ? 1 : Math.min(score, 0.99),
      issues,
      measured: {
        triangles: topology.triangles,
        topologyPass: topology.pass,
        assemblySizeMm: size,
        dimensionChecks: checks.map((check) => ({ id: check.id, expectedMm: check.expectedMm, actualMm: check.actualMm, toleranceMm: check.toleranceMm, pass: check.pass })),
      },
    };
  } finally {
    build.root.traverse((object) => {
      const mesh = object as { geometry?: { dispose(): void }; material?: { dispose(): void } | Array<{ dispose(): void }> };
      mesh.geometry?.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) material.dispose();
    });
  }
}

/** Compact, deterministic correction message for the next model turn. */
export function formatAssemblyFeedback(feedback: AssemblyFeedback): string {
  if (feedback.pass) return 'All checks passed.';
  const lines = [`The previous AssemblyIR failed at the ${feedback.stage} stage. Fix every item and reply with the complete corrected JSON only:`];
  feedback.issues.forEach((issue, index) => lines.push(`${index + 1}. ${issue.message}${issue.fix ? ` Fix: ${issue.fix}.` : ''}`));
  return lines.join('\n');
}

/** Index of the best candidate: highest score, earliest on ties. */
export function selectBestAssemblyCandidate(feedbacks: readonly AssemblyFeedback[]): number {
  if (feedbacks.length === 0) throw new Error('No candidates to select from.');
  return feedbacks.reduce((best, feedback, index) => (feedback.score > feedbacks[best]!.score ? index : best), 0);
}

export interface AssemblyCorrectionRound {
  round: number;
  candidate: string;
  feedback: AssemblyFeedback;
}

/**
 * Model-agnostic bounded correction loop. `generate` receives the task prompt
 * (round 0) or the task plus formatted feedback, and returns raw model text.
 * Stops on the first passing candidate or after `maxRounds`; returns the best
 * candidate, not the last one.
 */
export async function runAssemblyCorrectionLoop(
  generate: (prompt: string, round: number) => Promise<string>,
  task: string,
  requirements: AssemblyRequirements,
  maxRounds = 3,
): Promise<{ best: AssemblyCorrectionRound; rounds: AssemblyCorrectionRound[] }> {
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 6) throw new Error('Correction rounds must be within 1–6.');
  const rounds: AssemblyCorrectionRound[] = [];
  let prompt = task;
  for (let round = 0; round < maxRounds; round += 1) {
    const candidate = await generate(prompt, round);
    // Load the boolean runtime only when a candidate may use it.
    if (candidate.includes('booleanCSG')) await initManifold();
    const feedback = assessAssemblyCandidate(candidate, requirements);
    rounds.push({ round, candidate, feedback });
    if (feedback.pass) break;
    prompt = `${task}\n\nPrevious answer:\n${candidate}\n\n${formatAssemblyFeedback(feedback)}`;
  }
  const best = rounds[selectBestAssemblyCandidate(rounds.map((item) => item.feedback))]!;
  return { best, rounds };
}
