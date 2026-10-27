import { validateAssemblyIR } from '../engine/assembly-compiler';
import type { AssemblyComponentIR, AssemblyIR, EvidenceStatusIR } from '../engine/assembly-ir';
import { prepareAssemblyRuntime } from '../engine/boolean-csg';

/** One opened result in the session library. Imported IR lives in memory only. */
export interface LibraryEntry {
  key: string;
  number: number;
  kind: 'preset' | 'imported';
  /** Viewer preset id for presets; imported entries share the 'imported' asset slot. */
  presetId: string;
  name: string;
  fileName?: string;
  ir?: AssemblyIR;
  /** The IR as opened, for per-component "edited" marks and revert. */
  originalIr?: AssemblyIR;
  thumb?: string;
  seen: boolean;
}

export type EvidenceStatus = EvidenceStatusIR | 'undocumented';
export const EVIDENCE_ORDER: EvidenceStatus[] = ['measured', 'datasheet', 'estimated', 'inferred', 'undocumented'];

export function evidenceOf(component: AssemblyComponentIR | undefined): EvidenceStatus {
  return component?.evidence?.status ?? 'undocumented';
}

const MAX_FILE_BYTES = 2_000_000;

/** Same checks as the single-file loader: size, JSON, schema, boolean runtime. */
export async function readAssemblyFile(file: Pick<File, 'name' | 'size' | 'text'>): Promise<AssemblyIR> {
  if (file.size > MAX_FILE_BYTES) throw new Error('AssemblyIR exceeds 2 MB.');
  const value: unknown = JSON.parse(await file.text());
  validateAssemblyIR(value);
  await prepareAssemblyRuntime(value);
  return value;
}

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, failure: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (success: (entries: FileSystemEntryLike[]) => void, failure: (error: unknown) => void) => void };
};

async function walk(entry: FileSystemEntryLike, out: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    if (!entry.name.toLowerCase().endsWith('.json')) return;
    out.push(await new Promise<File>((resolve, reject) => entry.file!(resolve, reject)));
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;
  const reader = entry.createReader();
  // readEntries returns batches until it hands back an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const child of batch) await walk(child, out);
  }
}

/** JSON files from a drop, folders included, in name order. */
export async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const entries = [...transfer.items].flatMap((item) => {
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry?.();
    return entry ? [entry] : [];
  });
  const files: File[] = [];
  if (entries.length > 0) for (const entry of entries) await walk(entry, files);
  else files.push(...[...transfer.files].filter((file) => file.name.toLowerCase().endsWith('.json')));
  return files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Rough solid volume in mm³ from the declared geometry, for the outliner's size dots. */
export function approximateVolume(component: AssemblyComponentIR): number {
  const g = component.geometry as unknown as Record<string, unknown> & { op: string };
  const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? Math.abs(value) : fallback);
  const scale = component.scale ? Math.abs(component.scale[0] * component.scale[1] * component.scale[2]) : 1;
  let volume = 0;
  switch (g.op) {
    case 'roundedBox':
    case 'box': {
      const size = Array.isArray(g.size) ? g.size : [];
      volume = num(size[0]) * num(size[1]) * num(size[2]);
      break;
    }
    case 'cylinder': {
      const r = (num(g.radiusTop) + num(g.radiusBottom)) / 2;
      volume = Math.PI * r * r * num(g.depth);
      break;
    }
    case 'sphere':
      volume = (4 / 3) * Math.PI * num(g.radius) ** 3;
      break;
    case 'torus':
      volume = 2 * Math.PI * Math.PI * num(g.radius) * num(g.tube) ** 2;
      break;
    case 'lathe': {
      const profile = Array.isArray(g.profile) ? g.profile as number[][] : [];
      const radius = Math.max(0, ...profile.map((point) => num(point[0])));
      const ys = profile.map((point) => num(point[1]));
      volume = Math.PI * radius * radius * (ys.length ? Math.max(...ys) - Math.min(...ys) : 0);
      break;
    }
    case 'extrude': {
      const points = Array.isArray(g.points) ? g.points as number[][] : [];
      const xs = points.map((point) => point[0] ?? 0);
      const ys = points.map((point) => point[1] ?? 0);
      volume = xs.length ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) * num(g.depth) : 0;
      break;
    }
    case 'tube': {
      const points = Array.isArray(g.points) ? g.points as number[][] : [];
      let length = 0;
      for (let i = 1; i < points.length; i += 1) length += Math.hypot(...points[i]!.map((v, axis) => v - (points[i - 1]![axis] ?? 0)));
      volume = Math.PI * num(g.radius) ** 2 * length;
      break;
    }
    default:
      volume = 0;
  }
  return volume * scale;
}

/** Ids whose component differs from the IR as it was opened. */
export function editedComponentIds(current: AssemblyIR | undefined, original: AssemblyIR | undefined): Set<string> {
  const edited = new Set<string>();
  if (!current || !original) return edited;
  const before = new Map(original.components.map((component) => [component.id, JSON.stringify(component)]));
  for (const component of current.components) {
    if (before.get(component.id) !== JSON.stringify(component)) edited.add(component.id);
  }
  return edited;
}
