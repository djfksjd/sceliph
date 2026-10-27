import { validateAssemblyIR } from '../engine/assembly-compiler';
import type { AssemblyComponentIR, AssemblyIR } from '../engine/assembly-ir';

/**
 * The viewer's command bar talks to the user's own Claude CLI through the
 * local dev/preview server (vite-plugins/sceliph-assist.mjs). The model never
 * edits the scene directly: it returns whole-component changes, which are
 * checked here against the requested scope and the IR validator, shown as a
 * diff, and applied only after the user approves. The applied change list is
 * the deterministic record: replaying it on the same IR gives the same IR.
 */

export type AssistMode = 'chat' | 'edit';
export type AssistModel = 'haiku' | 'sonnet' | 'opus';

export type AssistChange =
  | { op: 'update'; id: string; component: AssemblyComponentIR }
  | { op: 'add'; component: AssemblyComponentIR }
  | { op: 'remove'; id: string };

export interface AssistTurn { role: 'user' | 'assistant'; text: string }

export interface AssistRequest {
  mode: AssistMode;
  model: AssistModel;
  locale: string;
  message: string;
  ir: AssemblyIR;
  /** Component ids the user pointed at; edits outside them are refused. */
  scopeIds: string[];
  /** PNG data URL of the current viewport. */
  snapshot?: string;
  history: AssistTurn[];
}

export interface AssistCallRecord { modelIds: string[]; costUsd: number; durationMs: number; isError: boolean }
export interface AssistServerReply { text: string; record: AssistCallRecord }
export interface AssistReply { reply: string; changes: AssistChange[] }

export interface AssistChangeSummary {
  op: AssistChange['op'];
  id: string;
  name: string;
  /** Top-level component fields that differ (update), or every field (add/remove). */
  fields: string[];
}

const MAX_CHANGES = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Pulls the first balanced JSON object out of a model reply (fences and prose tolerated). */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('The reply contains no JSON object.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('The reply JSON object is not closed.');
}

export function parseAssistReply(text: string, mode: AssistMode): AssistReply {
  const value = extractJsonObject(text);
  if (!isRecord(value) || typeof value.reply !== 'string') throw new Error('The reply needs a "reply" string.');
  const rawChanges = value.changes ?? [];
  if (!Array.isArray(rawChanges)) throw new Error('"changes" must be an array.');
  if (rawChanges.length > MAX_CHANGES) throw new Error(`At most ${MAX_CHANGES} changes per request.`);
  if (mode === 'chat' && rawChanges.length > 0) throw new Error('Chat mode does not change the model.');
  const changes = rawChanges.map((change, index): AssistChange => {
    if (!isRecord(change)) throw new Error(`Change ${index + 1} is not an object.`);
    if (change.op === 'remove') {
      if (typeof change.id !== 'string') throw new Error(`Change ${index + 1} needs an id.`);
      return { op: 'remove', id: change.id };
    }
    if (change.op !== 'update' && change.op !== 'add') throw new Error(`Change ${index + 1} has an unknown op.`);
    if (!isRecord(change.component) || typeof change.component.id !== 'string') throw new Error(`Change ${index + 1} needs a component with an id.`);
    const component = change.component as unknown as AssemblyComponentIR;
    if (change.op === 'add') return { op: 'add', component };
    const id = typeof change.id === 'string' ? change.id : component.id;
    return { op: 'update', id, component };
  });
  return { reply: value.reply.trim(), changes };
}

/**
 * Applies changes to a copy of the IR. Refuses unknown or renamed ids, adds
 * that collide, and (when a scope is given) updates or removals outside it.
 * The result passes validateAssemblyIR or this throws.
 */
export function applyAssistChanges(ir: AssemblyIR, changes: AssistChange[], scopeIds: string[] = []): { ir: AssemblyIR; summary: AssistChangeSummary[] } {
  const scope = new Set(scopeIds);
  const components = structuredClone(ir.components);
  const summary: AssistChangeSummary[] = [];
  for (const change of changes) {
    if (change.op === 'add') {
      if (components.some((component) => component.id === change.component.id)) throw new Error(`Component ${change.component.id} already exists.`);
      components.push(structuredClone(change.component));
      summary.push({ op: 'add', id: change.component.id, name: change.component.name, fields: Object.keys(change.component) });
      continue;
    }
    const index = components.findIndex((component) => component.id === change.id);
    if (index < 0) throw new Error(`Component ${change.id} does not exist.`);
    if (scope.size > 0 && !scope.has(change.id)) throw new Error(`Component ${change.id} is outside the selected scope.`);
    const before = components[index]!;
    if (change.op === 'remove') {
      components.splice(index, 1);
      summary.push({ op: 'remove', id: change.id, name: before.name, fields: Object.keys(before) });
      continue;
    }
    if (change.component.id !== change.id) throw new Error(`Component ${change.id} cannot be renamed to ${change.component.id}.`);
    const after = structuredClone(change.component);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const fields = [...keys].filter((key) => JSON.stringify((before as unknown as Record<string, unknown>)[key]) !== JSON.stringify((after as unknown as Record<string, unknown>)[key]));
    components[index] = after;
    if (fields.length > 0) summary.push({ op: 'update', id: change.id, name: after.name, fields });
  }
  const next: AssemblyIR = { ...structuredClone(ir), components };
  validateAssemblyIR(next);
  return { ir: next, summary };
}
