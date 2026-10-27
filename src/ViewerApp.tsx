import { createBirdPrimaryStudy } from './engine/bird-primary-study';
import SceliphIcon from './SceliphIcon';
import AssemblyComponentEditor from './AssemblyComponentEditor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Check, ChevronLeft, ChevronRight, Columns2, Download, FolderOpen, Keyboard, Layers, Maximize2, Moon, Palette, Redo2, RotateCcw, RotateCw, Ruler, Settings, ShieldCheck, Sun, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { CommandBar, type CommandLogEntry } from './viewer/CommandBar';
import { LOCALES, useLocale, type Locale, type MessageKey } from './viewer/i18n';
import { approximateVolume, editedComponentIds, EVIDENCE_ORDER, evidenceOf, filesFromDrop, readAssemblyFile, type EvidenceStatus, type LibraryEntry } from './viewer/library';
import { Outliner, type OutlinerRow } from './viewer/Outliner';
import './viewer/studio.css';
import type { CharacterBuild } from './engine/character';
import type { ProductBuild } from './engine/product';
import type { AssemblyIR } from './engine/assembly-ir';
import { COOLING_ASSEMBLY_IR } from './engine/cooling-assembly';
import { GALAXY_Z_FOLD8_EXTERIOR_IR } from './engine/galaxy-fold8-exterior';
import { LAUREL_HOMES_BUILDING_B_IR } from './engine/laurel-homes-building-b';
import { MODERNCAT_CONCEPT_RESIDENCE_IR } from './engine/moderncat-concept-residence';
import { POOR_COYOTES_CABIN_IR } from './engine/poor-coyotes-cabin';
import { loadHumanPack } from './engine/ohpk';
import { evaluateProductQuality, evaluateQuality } from './engine/quality';
import { WEB_HERO_VISUAL_INTERPRETATION } from './engine/reference-pose';
import { buildPhysicalNetlist } from './engine/netlist';
import { createOrnateKnifeIR } from './engine/knife';
import { TALON_REFERENCE_BENCHMARK_IR } from './engine/talon-reference-benchmark';
import { ASPHALT_SURFACE_BENCHMARK_IR } from './engine/asphalt-surface-benchmark';
import { IMPLICIT_SURFACE_BENCHMARK_IR } from './engine/implicit-surface-benchmark';
import { editAssemblyLayout, isLayoutEditable } from './engine/layout-edit';
import {
  formatMeasurement,
  type MeasurementMode,
  type MeasurementResult,
  type MeasurementUnit,
} from './engine/measurement';
import {
  ResultViewport,
  type BuildingLevel,
  type ExportReceipt,
  type CameraView,
  type InspectablePart,
  type LightingMode,
  type PartDisplay,
  type PartHover,
  type ViewportHandle,
} from './components/ResultViewport';
import { ViewportErrorBoundary } from './components/ViewportErrorBoundary';
import { bytesLabel, type DeliveryAudit, type LocalBuildTelemetry } from './engine/delivery-validation';
import {
  createBrowserRoundTripAssetReceipt,
  createBrowserRoundTripReport,
  getBrowserConsoleEvidence,
  type BrowserProofDefinition,
  type BrowserRoundTripAssetReceipt,
} from './engine/browser-proof-recorder';
import { auditFidelityContract } from './engine/fidelity-pipeline';
import type { AssetKind, CharacterSpec, HumanPack, ProductSpec, ViewMode } from './types';
import { DEFAULT_KNIFE_SPEC, DEFAULT_PRODUCT_SPEC, DEFAULT_SPEC, FIELD_HUMAN_SPEC, WEB_HERO_SPEC } from './types';

const MODES: Array<{ id: ViewMode; label: string }> = [
  { id: 'beauty', label: 'Beauty' },
  { id: 'clay', label: 'Clay' },
  { id: 'wireframe', label: 'Wire' },
  { id: 'rig', label: 'X-Ray' },
];

const IMPORTED_RESULT_TTL_MS = 30 * 60 * 1000;

type ViewerAsset = {
  id: string;
  label: string;
  caption: string;
  kind: 'human';
  spec: CharacterSpec;
} | {
  id: string;
  label: string;
  caption: string;
  kind: 'product';
  spec: ProductSpec;
  assemblyIR?: AssemblyIR;
};

type LocalJobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
type LocalJob = {
  id: number;
  name: string;
  status: LocalJobStatus;
  action: () => Promise<ExportReceipt | void>;
  error?: string;
  durationMs?: number;
  outputBytes?: number;
  fileName?: string;
};

const VIEWER_ASSETS: ViewerAsset[] = [
  {id:'bird-primary-study',label:'Bird Primary Form Study',caption:'authored continuous body · editable wing sections · contact preservation · no anatomy certification',kind:'product',spec:DEFAULT_PRODUCT_SPEC,assemblyIR:createBirdPrimaryStudy({ preserveContacts: true, taperedBeak: true, shapedWings: true })},
  {
    id: 'implicit-surface', label: 'Implicit Surface Lab', caption: 'smooth union · real socket · manifold refinement', kind: 'product',
    spec: DEFAULT_PRODUCT_SPEC, assemblyIR: IMPLICIT_SURFACE_BENCHMARK_IR,
  },
  {
    id: 'asphalt-surface', label: 'Rough Asphalt Surface', caption: 'macro relief · aggregate PBR · deterministic', kind: 'product',
    spec: DEFAULT_PRODUCT_SPEC, assemblyIR: ASPHALT_SURFACE_BENCHMARK_IR,
  },
  {
    id: 'talon-reference', label: 'Talon Ruby — Same Reference', caption: 'real silhouette · true openings · estimated depth', kind: 'product',
    spec: DEFAULT_KNIFE_SPEC, assemblyIR: TALON_REFERENCE_BENCHMARK_IR,
  },
  {
    id: 'moderncat-concept', label: 'ModernCat Concept Residence', caption: 'Pinterest panel · concept evidence blocked', kind: 'product',
    spec: DEFAULT_PRODUCT_SPEC, assemblyIR: MODERNCAT_CONCEPT_RESIDENCE_IR,
  },
  {
    id: 'laurel-homes', label: 'Laurel Homes Apartments', caption: '9 units · 3 stairs · measured HABS plan', kind: 'product',
    spec: DEFAULT_PRODUCT_SPEC, assemblyIR: LAUREL_HOMES_BUILDING_B_IR,
  },
  {
    id: 'habs-cabin', label: 'HABS Measured Cabin', caption: '17′4″ × 13′10″ · architectural shell', kind: 'product',
    spec: DEFAULT_PRODUCT_SPEC, assemblyIR: POOR_COYOTES_CABIN_IR,
  },
  {
    id: 'fold8', label: 'Galaxy Z Fold8', caption: '2026 · Graphite · exterior', kind: 'product',
    spec: DEFAULT_PRODUCT_SPEC, assemblyIR: GALAXY_Z_FOLD8_EXTERIOR_IR,
  },
  {
    id: 'cooler', label: 'TEC Cooling Assembly', caption: '97 parts · connected harness', kind: 'product',
    spec: DEFAULT_PRODUCT_SPEC, assemblyIR: COOLING_ASSEMBLY_IR,
  },
  {
    id: 'phone', label: 'Phone Assembly', caption: '164 parts · exploded', kind: 'product',
    spec: DEFAULT_PRODUCT_SPEC,
  },
  {
    id: 'blade', label: 'Ornate Blade', caption: 'editable blade loft', kind: 'product',
    spec: DEFAULT_KNIFE_SPEC,
  },
  {
    id: 'web-hero', label: 'Web Hero', caption: 'posed character study', kind: 'human',
    spec: { ...DEFAULT_SPEC, ...WEB_HERO_SPEC },
  },
  {
    id: 'field-human', label: 'Field Human', caption: 'editable character base', kind: 'human',
    spec: FIELD_HUMAN_SPEC,
  },
];

function resolveInitialViewerAsset(): ViewerAsset {
  const requested = new URLSearchParams(window.location.search).get('asset');
  return VIEWER_ASSETS.find((asset) => asset.id === requested)
    ?? VIEWER_ASSETS.find((asset) => asset.id === 'fold8')!;
}

const BROWSER_PROOF_ASSETS: Record<string, BrowserProofDefinition> = {
  'asphalt-surface': { id: 'asphalt-print-surface', scope: '3d-print-surface-material', qualityReleaseReady: true },
  'moderncat-concept': { id: 'pinterest-concept-architectural-review', scope: 'concept-architecture', qualityReleaseReady: false },
  'laurel-homes': { id: 'laurel-homes-architectural-review', scope: 'measured-architecture', qualityReleaseReady: true },
  cooler: { id: 'cooling-service-assembly', scope: 'electromechanical-service-model', qualityReleaseReady: false },
  blade: { id: 'ornate-knife-product-visualization', scope: 'industrial-design', qualityReleaseReady: true },
  'web-hero': { id: 'single-view-character-previs', scope: 'single-view-character-previs', qualityReleaseReady: false },
  'field-human': { id: 'field-human-runtime-base', scope: 'animation-game-runtime', qualityReleaseReady: true },
};

const BROWSER_PROOF_EXPECTED_COUNT = Object.keys(BROWSER_PROOF_ASSETS).length;


function StatusMark({ status }: { status: 'pass' | 'warn' | 'blocked' }) {
  return <span className={`status-mark status-${status}`} aria-label={status} />;
}

function downloadJson(payload: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type RailSection = 'parts' | 'materials' | 'measure' | 'checks' | 'export' | 'settings';
type Theme = 'dark' | 'light';
type LibraryFilter = 'all' | 'imported' | 'presets';

const RAIL: Array<{ id: RailSection; icon: typeof Box; label: MessageKey }> = [
  { id: 'parts', icon: Layers, label: 'rail.parts' },
  { id: 'materials', icon: Palette, label: 'rail.materials' },
  { id: 'measure', icon: Ruler, label: 'rail.measure' },
  { id: 'checks', icon: ShieldCheck, label: 'rail.checks' },
  { id: 'export', icon: Download, label: 'rail.export' },
  { id: 'settings', icon: Settings, label: 'rail.settings' },
];

function presetEntries(): LibraryEntry[] {
  return VIEWER_ASSETS.map((asset, index) => ({
    key: `preset:${asset.id}`,
    number: index + 1,
    kind: 'preset',
    presetId: asset.id,
    name: asset.label,
    ...(asset.kind === 'product' && asset.assemblyIR ? { ir: asset.assemblyIR, originalIr: asset.assemblyIR } : {}),
    seen: false,
  }));
}

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value && (allowed as readonly string[]).includes(value) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Remembering a preference is a convenience only.
  }
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);

export function ViewerApp() {
  const initialAsset = useMemo(resolveInitialViewerAsset, []);
  const { locale, setLocale, t } = useLocale();
  const [theme, setThemeState] = useState<Theme>(() => readStored('sceliph.theme', ['dark', 'light'] as const, 'dark'));
  const setTheme = (next: Theme) => { setThemeState(next); writeStored('sceliph.theme', next); };
  const [pack, setPack] = useState<HumanPack>();
  const [packError, setPackError] = useState<string>();
  const [assetKind, setAssetKind] = useState<AssetKind>(initialAsset.kind);
  const [activeAssetId, setActiveAssetId] = useState(initialAsset.id);
  const [spec, setSpec] = useState<CharacterSpec>(initialAsset.kind === 'human' ? initialAsset.spec : DEFAULT_SPEC);
  const [productSpec, setProductSpec] = useState<ProductSpec>(initialAsset.kind === 'product' ? initialAsset.spec : DEFAULT_PRODUCT_SPEC);
  const [assemblyIR, setAssemblyIR] = useState<AssemblyIR | undefined>(initialAsset.kind === 'product' ? initialAsset.assemblyIR : undefined);
  const [mode, setMode] = useState<ViewMode>('beauty');
  const [buildMetrics, setBuildMetrics] = useState<CharacterBuild['metrics'] | ProductBuild['metrics']>();
  const [selectedPart, setSelectedPart] = useState<InspectablePart>();
  const [busyAction, setBusyAction] = useState<string>();
  const [jobs, setJobs] = useState<LocalJob[]>([]);
  const [deliveryAudit, setDeliveryAudit] = useState<DeliveryAudit>();
  const [deliveryVerifying, setDeliveryVerifying] = useState(true);
  const [browserProofReceipts, setBrowserProofReceipts] = useState<Record<string, BrowserRoundTripAssetReceipt>>({});
  const [telemetry, setTelemetry] = useState<LocalBuildTelemetry>();
  const [sourceCurrent, setSourceCurrent] = useState(true);
  const [viewerNote, setViewerNote] = useState(() => t('note.ready'));
  const [noteStamp, setNoteStamp] = useState(0);
  const note = useCallback((text: string) => { setViewerNote(text); setNoteStamp(Date.now()); }, []);
  const [measurementEnabled, setMeasurementEnabled] = useState(false);
  const measurementMode: MeasurementMode = 'distance';
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>('mm');
  const [measurementResult, setMeasurementResult] = useState<MeasurementResult>();
  const [measurementPoints, setMeasurementPoints] = useState<0 | 1 | 2>(0);
  const [measurementMissed, setMeasurementMissed] = useState(false);
  const [dimensionOverviewEnabled, setDimensionOverviewEnabled] = useState(false);
  const [buildingLevel, setBuildingLevel] = useState<BuildingLevel>('all');
  const [lightingMode, setLightingMode] = useState<LightingMode>('day');
  const [cameraView, setCameraView] = useState<CameraView>('iso');

  // Shell
  const [section, setSection] = useState<RailSection>('parts');
  // Narrow windows open on the viewport; panels slide in on demand.
  const [leftCollapsed, setLeftCollapsed] = useState(() => window.innerWidth < 900);
  const [rightTab, setRightTab] = useState<'library' | 'inspector'>('library');
  const [rightCollapsed, setRightCollapsed] = useState(() => window.innerWidth < 1180);
  const [commandOpen, setCommandOpen] = useState(false);
  const helpRef = useRef<HTMLDialogElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Library
  const [library, setLibrary] = useState<LibraryEntry[]>(presetEntries);
  const [activeKey, setActiveKey] = useState(`preset:${initialAsset.id}`);
  const activeKeyRef = useRef(activeKey);
  activeKeyRef.current = activeKey;
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [compareKey, setCompareKey] = useState<string>();
  const compareRef = useRef<ViewportHandle>(null);
  const [failures, setFailures] = useState<Array<{ name: string; error: string }>>([]);
  const [importExpiresAt, setImportExpiresAt] = useState<number>();
  const importTimerRef = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Part display
  const [sceneParts, setSceneParts] = useState<InspectablePart[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [soloId, setSoloId] = useState<string>();
  const [evidenceFocus, setEvidenceFocus] = useState<EvidenceStatus>();
  const [hatchInferred, setHatchInferred] = useState(false);
  const [explode, setExplode] = useState(0);
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [hover, setHover] = useState<PartHover>();

  // IR history (layout edits, component edits, command bar)
  const pastRef = useRef<AssemblyIR[]>([]);
  const futureRef = useRef<AssemblyIR[]>([]);
  const [, setHistoryTick] = useState(0);

  const viewportRef = useRef<ViewportHandle>(null);
  const jobSequenceRef = useRef(0);
  const jobsRef = useRef<LocalJob[]>([]);
  const activeJobRef = useRef<LocalJob | undefined>(undefined);
  const processNextJobRef = useRef<() => void>(() => undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    let active = true;
    loadHumanPack('/assets/oxihuman-core-v1.ohpk')
      .then((loaded) => { if (active) setPack(loaded); })
      .catch((error: unknown) => {
        if (active) setPackError(error instanceof Error ? error.message : String(error));
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (importTimerRef.current !== undefined) window.clearTimeout(importTimerRef.current);
      viewportRef.current?.cancelExport();
      jobsRef.current = [];
    };
  }, []);

  const syncJobs = useCallback(() => {
    if (mountedRef.current) setJobs([...jobsRef.current]);
  }, []);

  processNextJobRef.current = () => {
    if (activeJobRef.current) return;
    const next = jobsRef.current.find((job) => job.status === 'queued');
    if (!next) return;
    next.status = 'running';
    const startedAt = performance.now();
    activeJobRef.current = next;
    if (mountedRef.current) setBusyAction(next.name);
    syncJobs();
    void next.action()
      .then((receipt) => {
        if (next.status === 'cancelled') return;
        next.status = 'complete';
        if (receipt) {
          next.outputBytes = receipt.bytes;
          next.fileName = receipt.fileName;
        }
        if (mountedRef.current) note(t('note.jobDone', { name: next.name }));
      })
      .catch((error: unknown) => {
        if (next.status === 'cancelled') return;
        next.status = 'failed';
        next.error = error instanceof Error ? error.message : String(error);
        if (mountedRef.current) note(next.error);
      })
      .finally(() => {
        next.durationMs = performance.now() - startedAt;
        activeJobRef.current = undefined;
        if (mountedRef.current) {
          setBusyAction(undefined);
          syncJobs();
          window.queueMicrotask(() => processNextJobRef.current());
        }
      });
  };

  const productMetrics = buildMetrics && 'parts' in buildMetrics && buildMetrics.bounds ? buildMetrics : undefined;
  const productConnectivity = productMetrics?.connectivity;
  const productEngineering = productMetrics?.engineering;
  const characterMetrics = buildMetrics && 'renderedTriangles' in buildMetrics ? buildMetrics : undefined;
  const productEnvelope = productMetrics ? {
    x: Math.round((productMetrics.bounds.max.x - productMetrics.bounds.min.x) * 1000),
    y: Math.round((productMetrics.bounds.max.y - productMetrics.bounds.min.y) * 1000),
    z: Math.round((productMetrics.bounds.max.z - productMetrics.bounds.min.z) * 1000),
  } : undefined;
  const quality = useMemo(() => {
    if (!pack) return undefined;
    return assetKind === 'human'
      ? evaluateQuality(pack, spec, undefined, characterMetrics, deliveryAudit)
      : evaluateProductQuality(productSpec, undefined, productMetrics, assemblyIR, deliveryAudit);
  }, [assemblyIR, assetKind, characterMetrics, deliveryAudit, pack, productMetrics, productSpec, spec]);
  const blockedChecks = quality?.checks.filter((check) => check.status === 'blocked').length ?? 0;
  const qualityBlocked = blockedChecks > 0;
  const observedQualityReleaseReady = Boolean(quality && buildMetrics) && !qualityBlocked
    && deliveryAudit?.status === 'pass' && !deliveryVerifying;
  const fidelityAudit = useMemo(() => assemblyIR?.fidelity
    ? auditFidelityContract(assemblyIR.fidelity, assemblyIR)
    : undefined, [assemblyIR]);
  const productPartCount = productMetrics?.parts;
  const architecturalResult = assemblyIR?.metadata?.assetKind === 'building';
  const surfaceBenchmarkResult = assemblyIR?.metadata?.scope === 'surface-material-benchmark';
  const activeEntry = library.find((entry) => entry.key === activeKey);
  const baselineAssemblyIR = activeEntry?.originalIr ?? assemblyIR;
  const layoutEditable = Boolean(selectedPart && assemblyIR && isLayoutEditable(selectedPart.id));
  const displayedTriangles = buildMetrics && 'renderedTriangles' in buildMetrics
    ? buildMetrics.renderedTriangles
    : buildMetrics?.triangles;
  const componentById = useMemo(() => new Map((assemblyIR?.components ?? []).map((component) => [component.id, component])), [assemblyIR]);
  const editedIds = useMemo(() => editedComponentIds(assemblyIR, activeEntry?.originalIr), [activeEntry?.originalIr, assemblyIR]);

  const statusOf = useCallback((part: InspectablePart): EvidenceStatus => {
    const component = componentById.get(part.id);
    if (component) return evidenceOf(component);
    return (EVIDENCE_ORDER as string[]).includes(part.surface) ? part.surface as EvidenceStatus : 'undocumented';
  }, [componentById]);
  const outlinerRows = useMemo<OutlinerRow[]>(() => sceneParts.map((part) => {
    const component = componentById.get(part.id);
    return {
      id: part.id,
      name: part.name,
      status: statusOf(part),
      ...(component ? { op: component.geometry.op } : {}),
      volume: component ? approximateVolume(component) : 1,
      edited: editedIds.has(part.id),
    };
  }), [componentById, editedIds, sceneParts, statusOf]);
  const evidenceCounts = useMemo(() => {
    const counts = new Map<EvidenceStatus, number>();
    for (const row of outlinerRows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    return counts;
  }, [outlinerRows]);
  const partNames = useMemo(() => new Map(sceneParts.map((part) => [part.id, part.name])), [sceneParts]);

  const display = useMemo<PartDisplay>(() => ({
    ...(selectedPart ? { selectedId: selectedPart.id } : {}),
    hiddenIds,
    ...(soloId ? { soloId } : {}),
    ...(evidenceFocus ? { focusIds: outlinerRows.filter((row) => row.status === evidenceFocus).map((row) => row.id) } : {}),
    ...(hatchInferred ? { hatchIds: outlinerRows.filter((row) => row.status === 'inferred').map((row) => row.id) } : {}),
    explode,
  }), [evidenceFocus, explode, hatchInferred, hiddenIds, outlinerRows, selectedPart, soloId]);

  const handleBuilt = useCallback((build: CharacterBuild | ProductBuild) => {
    // Clay/wire/X-ray are inspection render modes, not different deliverables.
    // Keep the quality evidence tied to the beauty/export build so toggling a
    // viewport aid cannot lower or inflate the product score.
    if (mode !== 'beauty') return;
    setBuildMetrics(build.metrics);
    const key = activeKeyRef.current;
    window.setTimeout(() => {
      if (!mountedRef.current) return;
      setSceneParts(viewportRef.current?.listParts() ?? []);
      const thumb = viewportRef.current?.snapshot(240);
      if (thumb && activeKeyRef.current === key) setLibrary((entries) => entries.map((entry) => entry.key === key ? { ...entry, thumb, seen: true } : entry));
    }, 320);
  }, [mode]);

  const handleMeasurementChange = useCallback((result: MeasurementResult | undefined, points: 0 | 1 | 2) => {
    setMeasurementResult(result);
    setMeasurementPoints(points);
    setMeasurementMissed(false);
  }, []);

  const handleQualityMetrics = useCallback((metrics: CharacterBuild['metrics'] | ProductBuild['metrics']) => {
    setBuildMetrics(metrics);
  }, []);

  const handleDeliveryAudit = useCallback((audit: DeliveryAudit | undefined) => {
    setDeliveryAudit(audit);
    setDeliveryVerifying(audit === undefined);
    if (audit === undefined) setBuildMetrics(undefined);
  }, []);

  const lockedSet = useMemo(() => new Set(lockedIds), [lockedIds]);
  const handlePartSelected = useCallback((part?: InspectablePart) => {
    if (part && lockedSet.has(part.id)) return;
    setSelectedPart(part);
    setScopeIds(part ? [part.id] : []);
    if (part) setRightTab('inspector');
  }, [lockedSet]);

  useEffect(() => {
    const definition = BROWSER_PROOF_ASSETS[activeAssetId];
    if (!sourceCurrent || !definition || !deliveryAudit || deliveryAudit.status === 'running') return;
    const receipt = createBrowserRoundTripAssetReceipt({
      ...definition, qualityReleaseReady: definition.qualityReleaseReady && observedQualityReleaseReady,
    }, deliveryAudit);
    setBrowserProofReceipts((current) => {
      const previous = current[definition.id];
      if (previous
        && previous.sceneFingerprint === receipt.sceneFingerprint
        && previous.status === receipt.status
        && previous.glbBytes === receipt.glbBytes
        && previous.qualityReleaseReady === receipt.qualityReleaseReady) return current;
      return { ...current, [definition.id]: receipt };
    });
  }, [activeAssetId, deliveryAudit, observedQualityReleaseReady, sourceCurrent]);

  const clearMeasurement = useCallback(() => {
    viewportRef.current?.clearMeasurement();
    setMeasurementResult(undefined);
    setMeasurementPoints(0);
    setMeasurementMissed(false);
  }, []);

  const toggleMeasurement = useCallback(() => {
    const next = !measurementEnabled;
    setMeasurementEnabled(next);
    if (!next) clearMeasurement();
  }, [clearMeasurement, measurementEnabled]);

  // ── IR edits with one history ─────────────────────────────────────────
  const writeEntryIr = useCallback((ir: AssemblyIR) => {
    const key = activeKeyRef.current;
    setLibrary((entries) => entries.map((entry) => entry.key === key ? { ...entry, ir } : entry));
  }, []);
  const commitIr = useCallback((next: AssemblyIR, message: string) => {
    if (assemblyIR) pastRef.current = [...pastRef.current.slice(-49), assemblyIR];
    futureRef.current = [];
    setHistoryTick((tick) => tick + 1);
    setBuildMetrics(undefined);
    setDeliveryAudit(undefined);
    setDeliveryVerifying(true);
    setAssemblyIR(next);
    writeEntryIr(next);
    note(message);
  }, [assemblyIR, note, writeEntryIr]);
  const stepHistory = useCallback((direction: -1 | 1) => {
    const from = direction < 0 ? pastRef.current : futureRef.current;
    const target = from[from.length - 1];
    if (!target || !assemblyIR) return;
    if (direction < 0) {
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, assemblyIR];
    } else {
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [...pastRef.current, assemblyIR];
    }
    setHistoryTick((tick) => tick + 1);
    setBuildMetrics(undefined);
    setDeliveryAudit(undefined);
    setDeliveryVerifying(true);
    setAssemblyIR(target);
    writeEntryIr(target);
    note(t(direction < 0 ? 'note.undo' : 'note.redo'));
  }, [assemblyIR, note, t, writeEntryIr]);

  const editSelectedLayout = useCallback((edit: Parameters<typeof editAssemblyLayout>[2]) => {
    if (!selectedPart || !assemblyIR) return;
    commitIr(editAssemblyLayout(assemblyIR, selectedPart.id, edit), t('note.layout', { name: selectedPart.name }));
  }, [assemblyIR, commitIr, selectedPart, t]);

  const revertComponent = (id: string) => {
    const original = activeEntry?.originalIr?.components.find((component) => component.id === id);
    if (!assemblyIR || !original) return;
    commitIr({ ...assemblyIR, components: assemblyIR.components.map((component) => component.id === id ? structuredClone(original) : component) }, t('note.reverted', { name: original.name }));
  };

  // ── Library ───────────────────────────────────────────────────────────
  const touchImports = useCallback(() => {
    if (importTimerRef.current !== undefined) window.clearTimeout(importTimerRef.current);
    const expiresAt = Date.now() + IMPORTED_RESULT_TTL_MS;
    setImportExpiresAt(expiresAt);
    importTimerRef.current = window.setTimeout(() => {
      importTimerRef.current = undefined;
      setImportExpiresAt(undefined);
      setLibrary((entries) => entries.filter((entry) => entry.kind === 'preset'));
      if (activeKeyRef.current.startsWith('imported:')) activateRef.current(`preset:${VIEWER_ASSETS[0]!.id}`);
      note(t('note.expired'));
    }, IMPORTED_RESULT_TTL_MS);
  }, [note, t]);

  const activate = useCallback((key: string, entries: LibraryEntry[] = library) => {
    const entry = entries.find((item) => item.key === key);
    if (!entry || key === activeKeyRef.current) return;
    const preset = VIEWER_ASSETS.find((asset) => asset.id === entry.presetId);
    activeKeyRef.current = key;
    setActiveKey(key);
    setSelectedPart(undefined);
    setScopeIds([]);
    setHiddenIds([]);
    setLockedIds([]);
    setSoloId(undefined);
    setEvidenceFocus(undefined);
    setExplode(0);
    setSceneParts([]);
    setHover(undefined);
    setBuildMetrics(undefined);
    setDeliveryAudit(undefined);
    setDeliveryVerifying(true);
    setTelemetry(undefined);
    setMode('beauty');
    setBuildingLevel('all');
    setLightingMode('day');
    setCameraView('iso');
    viewportRef.current?.setBuildingLevel('all');
    viewportRef.current?.setLighting('day');
    setMeasurementResult(undefined);
    setMeasurementPoints(0);
    setMeasurementMissed(false);
    pastRef.current = [];
    futureRef.current = [];
    setHistoryTick((tick) => tick + 1);
    if (entry.kind === 'imported') {
      setActiveAssetId('imported');
      setAssetKind('product');
      setAssemblyIR(entry.ir);
      setMeasurementUnit(entry.ir?.metadata?.assetKind === 'building' ? 'm' : 'mm');
      touchImports();
    } else if (preset) {
      setActiveAssetId(preset.id);
      setAssetKind(preset.kind);
      if (preset.kind === 'human') {
        setSpec(preset.spec);
        setAssemblyIR(undefined);
      } else {
        setProductSpec(preset.spec);
        setAssemblyIR(entry.ir ?? preset.assemblyIR);
      }
      setMeasurementUnit(preset.kind === 'product' && preset.assemblyIR?.metadata?.assetKind === 'building' ? 'm' : 'mm');
    }
    setLibrary((items) => items.map((item) => item.key === key ? { ...item, seen: true } : item));
    note(t('note.loaded', { name: entry.name }));
  }, [library, note, t, touchImports]);
  const activateRef = useRef(activate);
  activateRef.current = activate;

  const importFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setSourceCurrent(false);
    const added: LibraryEntry[] = [];
    const failed: Array<{ name: string; error: string }> = [];
    let number = Math.max(0, ...library.map((entry) => entry.number));
    for (const file of files) {
      try {
        const ir = await readAssemblyFile(file);
        number += 1;
        added.push({ key: `imported:${number}:${file.name}`, number, kind: 'imported', presetId: 'imported', name: ir.name, fileName: file.name, ir, originalIr: ir, seen: false });
      } catch (error) {
        failed.push({ name: file.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (!mountedRef.current) return;
    setSourceCurrent(true);
    setFailures(failed);
    if (added.length === 0) {
      if (failed[0]) note(`${failed[0].name}: ${failed[0].error}`);
      return;
    }
    const next = [...library, ...added];
    setLibrary(next);
    setLibraryFilter('imported');
    setRightTab('library');
    setRightCollapsed(false);
    note(t('library.added', { n: added.length }));
    touchImports();
    activate(added[0]!.key, next);
  }, [activate, library, note, t, touchImports]);

  const clearImported = () => {
    if (importTimerRef.current !== undefined) window.clearTimeout(importTimerRef.current);
    importTimerRef.current = undefined;
    setImportExpiresAt(undefined);
    const presets = library.filter((entry) => entry.kind === 'preset');
    setLibrary(presets);
    setFailures([]);
    if (activeKey.startsWith('imported:')) activate(`preset:${VIEWER_ASSETS[0]!.id}`, presets);
    note(t('note.cleared'));
  };

  const filteredLibrary = library.filter((entry) => libraryFilter === 'all' || (libraryFilter === 'imported' ? entry.kind === 'imported' : entry.kind === 'preset'));
  const stepLibrary = useCallback((direction: -1 | 1) => {
    const list = library.filter((entry) => libraryFilter === 'all' || (libraryFilter === 'imported' ? entry.kind === 'imported' : entry.kind === 'preset'));
    const index = list.findIndex((entry) => entry.key === activeKeyRef.current);
    const next = list[(index + direction + list.length) % list.length];
    if (next) activate(next.key);
  }, [activate, library, libraryFilter]);

  // ── Part actions ──────────────────────────────────────────────────────
  const selectFromOutliner = (id: string, additive: boolean) => {
    if (additive) {
      setScopeIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
      return;
    }
    const part = viewportRef.current?.partInfo(id) ?? sceneParts.find((item) => item.id === id);
    if (!part) return;
    setSelectedPart(part);
    setScopeIds([id]);
  };
  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);
  const toggleSolo = useCallback((id: string) => setSoloId((current) => current === id ? undefined : id), []);
  const toggleLocked = (id: string) => {
    setLockedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    if (selectedPart?.id === id) setSelectedPart(undefined);
  };
  const setView = (view: CameraView) => {
    setCameraView(view);
    viewportRef.current?.setView(view);
    compareRef.current?.setView(view);
  };

  // ── Shortcuts ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      if (isTyping(event.target)) return;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        stepHistory(event.shiftKey ? 1 : -1);
        return;
      }
      if (meta || (event.altKey && event.code !== 'KeyH')) return;
      if (event.key === 'Escape') {
        if (commandOpen) setCommandOpen(false);
        else if (measurementEnabled) clearMeasurement();
        else if (soloId || evidenceFocus) { setSoloId(undefined); setEvidenceFocus(undefined); }
        return;
      }
      if (event.key === '?') { helpRef.current?.showModal(); return; }
      if (event.code === 'KeyH') {
        if (event.altKey) setHiddenIds([]);
        else if (selectedPart) { toggleHidden(selectedPart.id); note(t('note.hidden', { name: selectedPart.name })); setSelectedPart(undefined); }
        return;
      }
      if (event.key === 'f' && selectedPart) { viewportRef.current?.focusPart(selectedPart.id); return; }
      if (event.key === '/' && selectedPart) { event.preventDefault(); toggleSolo(selectedPart.id); return; }
      if (event.key === 'm' && assetKind === 'product') { toggleMeasurement(); return; }
      if (event.key === '[') stepLibrary(-1);
      if (event.key === ']') stepLibrary(1);
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [assetKind, clearMeasurement, commandOpen, evidenceFocus, measurementEnabled, note, selectedPart, soloId, stepHistory, stepLibrary, t, toggleHidden, toggleMeasurement, toggleSolo]);

  // ── Export queue ──────────────────────────────────────────────────────
  const runAction = (name: string, action: () => Promise<ExportReceipt | void>) => {
    const unfinished = jobsRef.current.filter((job) => job.status === 'queued' || job.status === 'running').length;
    if (unfinished >= 6) {
      note(t('note.queueFull'));
      return;
    }
    const job: LocalJob = { id: ++jobSequenceRef.current, name, action, status: 'queued' };
    const retainedUnfinished = jobsRef.current.filter((item) => item.status === 'queued' || item.status === 'running');
    const retainedFinished = jobsRef.current
      .filter((item) => item.status !== 'queued' && item.status !== 'running')
      .slice(-Math.max(0, 7 - retainedUnfinished.length));
    jobsRef.current = [...retainedUnfinished, ...retainedFinished, job];
    syncJobs();
    note(t('note.queue', { name }));
    window.queueMicrotask(() => processNextJobRef.current());
  };

  const cancelJob = (id: number) => {
    const job = jobsRef.current.find((item) => item.id === id);
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
    if (job.status === 'running') viewportRef.current?.cancelExport();
    job.status = 'cancelled';
    syncJobs();
  };

  const retryJob = (id: number) => {
    const job = jobsRef.current.find((item) => item.id === id);
    if (!job || job.status !== 'failed') return;
    runAction(job.name, job.action);
  };

  const queueLocked = jobs.some((job) => job.status === 'queued' || job.status === 'running');

  const activeName = assetKind === 'human'
    ? spec.outfit === 'web-hero' ? 'ML—WEB_HERO_01' : 'ML—HUMAN_BASE'
    : assemblyIR ? assemblyIR.name : productSpec.kind === 'smartphone' ? 'ML—PHONE_ASSEMBLY' : 'ML—ORNATE_BLADE';
  const sourcePayload = assetKind === 'human'
    ? { schema: 'morphloom.character/0.2', spec, interpretation: spec.outfit === 'web-hero' ? WEB_HERO_VISUAL_INTERPRETATION : undefined }
    : assemblyIR
      ?? (productSpec.kind === 'ornate-knife'
        ? createOrnateKnifeIR(productSpec)
        : { schema: 'morphloom.product/0.2', units: 'mm', kind: productSpec.kind, spec: productSpec });
  const sourceFileName = assetKind === 'human'
    ? 'character-ir.json'
    : 'components' in sourcePayload ? 'assembly-ir.json' : 'product-spec.json';
  const evidenceBoundary = assetKind === 'human'
    ? spec.outfit === 'web-hero'
      ? 'Single-view character likeness and hidden depth remain evidence-limited; this is an editable previs base.'
      : 'Procedural editable human base; identity likeness is not claimed.'
    : productEngineering?.productionReady
      ? 'All recorded digital and physical release gates pass.'
      : architecturalResult
        ? 'Architectural review shell only; survey, structure, MEP and as-built certification are excluded.'
        : productEngineering?.electricalApplicable
          ? 'Digital assembly is separate from physical bench continuity and manufacturing approval.'
          : 'Editable visualization asset; manufacturing STEP/BREP approval is excluded.';
  const measurementPrompt = !measurementEnabled
    ? t('measure.startHint')
    : measurementMissed
      ? t('measure.miss')
      : measurementPoints === 0 ? t('measure.pickA') : measurementPoints === 1 ? t('measure.pickB') : t('measure.done');

  const packBlockReason = !sourceCurrent ? t('export.blockedSource') : qualityBlocked ? t('export.blockedQuality') : deliveryAudit?.status === 'blocked' ? t('export.blockedAudit') : undefined;
  const glbBlockReason = !sourceCurrent ? t('export.blockedSource') : deliveryAudit?.status === 'blocked' ? t('export.blockedAudit') : undefined;
  const auditPending = !deliveryAudit || deliveryVerifying;
  const commandDisabledReason = assemblyIR ? undefined : t('cmd.needsIr');
  const materials = useMemo(() => {
    const groups = new Map<string, { name: string; color: string; roughness?: number; metalness?: number; count: number }>();
    for (const component of assemblyIR?.components ?? []) {
      const key = `${component.materialName}|${component.material.color}`;
      const group = groups.get(key) ?? { name: component.materialName, color: component.material.color, ...(component.material.roughness !== undefined ? { roughness: component.material.roughness } : {}), ...(component.material.metalness !== undefined ? { metalness: component.material.metalness } : {}), count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }, [assemblyIR]);
  const selectedComponent = selectedPart ? componentById.get(selectedPart.id) : undefined;
  const selectedStatus = selectedPart ? statusOf(selectedPart) : undefined;
  const pipeline: Array<[string, string]> = assetKind === 'human' ? [
    ['CHARACTER IR', 'pass'], ['MORPH', pack ? 'pass' : 'run'], ['MATERIAL', pack ? 'pass' : 'wait'],
    ['RIG', deliveryAudit?.status === 'blocked' ? 'blocked' : deliveryAudit?.reopened?.skeletons && deliveryAudit.reopened.animationClips >= 22 ? 'pass' : deliveryAudit ? 'warn' : 'run'],
    ['TOPOLOGY', pack ? 'pass' : 'wait'], ['EXPORT', qualityBlocked || deliveryAudit?.status === 'blocked' ? 'blocked' : deliveryAudit ? 'ready' : 'run'],
  ] : [
    ['SOURCE', 'pass'], [assemblyIR || productSpec.kind === 'ornate-knife' ? 'ASSEMBLY IR' : 'PRODUCT SPEC', 'pass'], ['COMPILE', pack ? 'pass' : 'run'],
    ['TOPOLOGY', pack ? 'pass' : 'wait'], ['PART TREE', pack ? 'pass' : 'wait'], ['EXPORT', qualityBlocked || deliveryAudit?.status === 'blocked' ? 'blocked' : deliveryAudit ? 'ready' : 'run'],
  ];
  const openSection = (next: RailSection) => {
    if (section === next && !leftCollapsed) setLeftCollapsed(true);
    else { setSection(next); setLeftCollapsed(false); }
  };
  const noteVisible = Date.now() - noteStamp < 5000;
  useEffect(() => {
    if (!noteStamp) return;
    const timer = window.setTimeout(() => setNoteStamp((stamp) => stamp), 5100);
    return () => window.clearTimeout(timer);
  }, [noteStamp]);
  const formatPartsCount = (n: number) => n.toLocaleString(locale);

  // ── Panels ────────────────────────────────────────────────────────────
  const partsPanel = (
    <Outliner
      t={t}
      rows={outlinerRows}
      loading={!buildMetrics && sceneParts.length === 0}
      {...(selectedPart ? { selectedId: selectedPart.id } : {})}
      scopeIds={scopeIds}
      hidden={new Set(hiddenIds)}
      locked={lockedSet}
      {...(soloId ? { soloId } : {})}
      onSelect={selectFromOutliner}
      onToggleHidden={toggleHidden}
      onToggleLocked={toggleLocked}
      onToggleSolo={toggleSolo}
    />
  );

  const materialsPanel = (
    <div className="st-stack">
      {materials.length === 0 ? <p className="st-empty">{t('materials.none')}</p> : (
        <ul className="material-list">
          {materials.map((item) => (
            <li key={`${item.name}-${item.color}`}>
              <span className="material-chip" style={{ background: item.color }} aria-hidden="true" />
              <span className="row-name">{item.name}</span>
              <span className="num muted">{item.roughness !== undefined ? `R ${item.roughness.toFixed(2)}` : ''}{item.metalness !== undefined ? ` · M ${item.metalness.toFixed(2)}` : ''}</span>
              <span className="num">{item.count}</span>
            </li>
          ))}
        </ul>
      )}
      {productMetrics && (
        <dl className="st-metrics">
          <div><dt>{t('materials.finishes')}</dt><dd className="num">{productMetrics.surfaces.distinctFinishes}</dd></div>
          <div><dt>{t('materials.microNormal')}</dt><dd className="num">{productMetrics.surfaces.microNormalMaterials}</dd></div>
          <div><dt>{t('materials.anisotropic')}</dt><dd className="num">{productMetrics.surfaces.anisotropicMaterials}</dd></div>
          <div><dt>{t('materials.optical')}</dt><dd className="num">{productMetrics.surfaces.transmissionMaterials}</dd></div>
        </dl>
      )}
    </div>
  );

  const measurePanel = assetKind !== 'product' ? <p className="st-empty">{t('cmd.needsIr')}</p> : (
    <div className="st-stack" aria-live="polite">
      <button className={`st-button is-wide${measurementEnabled ? ' is-primary' : ''}`} aria-pressed={measurementEnabled} aria-keyshortcuts="M" onClick={toggleMeasurement}>
        <Ruler size={15} />{measurementEnabled ? t('measure.on') : t('measure.off')}
      </button>
      <div className="st-field">
        <span className="st-label">{t('measure.type')}</span>
        <div className="st-segment" role="radiogroup" aria-label={t('measure.type')}>
          <button role="radio" aria-checked="true" className="is-on" disabled={!measurementEnabled}>{t('measure.distance')}</button>
        </div>
      </div>
      <div className="st-field">
        <span className="st-label">{t('measure.overlay')}</span>
        <label className="st-switch">
          <input type="checkbox" checked={dimensionOverviewEnabled} onChange={(event) => setDimensionOverviewEnabled(event.target.checked)} />
          <span>{t('measure.overlayOn')}</span>
        </label>
      </div>
      <label className="st-field">
        <span className="st-label">{t('measure.unit')}</span>
        <select className="st-select" value={measurementUnit} onChange={(event) => setMeasurementUnit(event.target.value as MeasurementUnit)}>
          <option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
        </select>
      </label>
      <div className={`measure-readout-card${measurementResult ? ' has-result' : ''}`}>
        <div className="caliper" aria-hidden="true"><i className={measurementPoints >= 1 ? 'is-set' : ''}>A</i><span /><i className={measurementPoints >= 2 ? 'is-set' : ''}>B</i></div>
        {measurementResult ? (
          <>
            <span className="st-label">{t('measure.result')}</span>
            <strong className="num">{formatMeasurement(measurementResult.distanceMeters, measurementUnit)}</strong>
            <dl className="st-metrics is-three">
              <div><dt>ΔX</dt><dd className="num">{formatMeasurement(measurementResult.deltaMeters.x, measurementUnit)}</dd></div>
              <div><dt>ΔY</dt><dd className="num">{formatMeasurement(measurementResult.deltaMeters.y, measurementUnit)}</dd></div>
              <div><dt>ΔZ</dt><dd className="num">{formatMeasurement(measurementResult.deltaMeters.z, measurementUnit)}</dd></div>
            </dl>
          </>
        ) : <p>{measurementPrompt}</p>}
      </div>
      <button className="st-button is-quiet" disabled={!measurementEnabled || measurementPoints === 0} onClick={clearMeasurement}>{t('measure.clear')}</button>
      <p className="st-footnote">{t('measure.help')}</p>
    </div>
  );

  const checksPanel = (
    <div className="st-stack">
      <div className={`score-card${qualityBlocked ? ' is-blocked' : ''}`}>
        <strong className="num">{quality?.total ?? '—'}</strong><span className="num muted">/100</span>
        {qualityBlocked && <em>{t('top.blocked')} {blockedChecks}</em>}
      </div>
      {(architecturalResult || surfaceBenchmarkResult) && quality && (
        <div className={`st-note${quality.deliveryReady ? ' is-pass' : ' is-warn'}`}>
          <b>{t('checks.sourceConfidence')} <span className="num">{quality.evidenceScore ?? '—'}/100</span></b>
        </div>
      )}
      <ul className="check-list">
        {quality?.checks.map((check) => (
          <li key={check.id}>
            <StatusMark status={check.status} />
            <div><b>{check.label}</b><small>{check.detail}</small></div>
            <span className="num">{check.score}</span>
          </li>
        )) ?? Array.from({ length: 5 }, (_, index) => <li key={index} className="is-skeleton" />)}
      </ul>
      {assemblyIR?.fidelity && fidelityAudit && (
        <div className={`st-note${fidelityAudit.pass ? ' is-pass' : ' is-blocked'}`}>
          <b>{t('checks.fidelity')}</b>
          <p>{fidelityAudit.pass
            ? `${Math.round(fidelityAudit.componentCoverage * 100)}% · ${Math.round(assemblyIR.fidelity.targetFidelity * 100)}% · ${assemblyIR.fidelity.maxTotalIterations}×`
            : fidelityAudit.blockers.slice(0, 3).join(' · ')}</p>
        </div>
      )}
      {assetKind === 'product' && productEngineering && (
        <div className="st-note">
          <b>{t('checks.engineering')}</b>
          <dl className="evidence-bars">
            {EVIDENCE_ORDER.map((status) => {
              const count = status === 'undocumented' ? productEngineering.componentEvidence.undocumented : productEngineering.componentEvidence[status];
              return <div key={status}><dt><i className={`ev-swatch ev-${status}`} />{t(`evidence.${status}`)}</dt><dd className="num">{count}</dd></div>;
            })}
          </dl>
          {productEngineering.electricalApplicable && <p className="num muted">PIN {Math.round(productEngineering.physicalPinCoverage * 100)}% · AWG {Math.round(productEngineering.conductorGaugeCoverage * 100)}% · VERIFY {Math.round(productEngineering.conductorVerificationCoverage * 100)}%</p>}
        </div>
      )}
      <div className="st-note"><b>{t('checks.boundary')}</b><p>{evidenceBoundary}</p></div>
      <div className="pipeline" aria-label={t('checks.pipeline')}>
        {pipeline.map(([label, state], index) => <span key={label} className={`pipe pipe-${state}`}><i />{String(index + 1).padStart(2, '0')} {label}<small>{state.toUpperCase()}</small></span>)}
      </div>
    </div>
  );

  const exportPanel = (
    <div className="st-stack">
      <div className="gate-grid">
        <div className={`gate ${auditPending ? 'is-wait' : glbBlockReason ? 'is-blocked' : 'is-pass'}`}>
          <span className="st-label">{t('export.gateGlb')}</span>
          <b>{auditPending ? t('export.verifying') : glbBlockReason ? t('export.blocked') : t('export.ready')}</b>
          {glbBlockReason && <small>{glbBlockReason}</small>}
        </div>
        <div className={`gate ${auditPending ? 'is-wait' : packBlockReason ? 'is-blocked' : 'is-pass'}`}>
          <span className="st-label">{t('export.gatePack')}</span>
          <b>{auditPending ? t('export.verifying') : packBlockReason ? t('export.blocked') : t('export.ready')}</b>
          {packBlockReason && <small>{packBlockReason}</small>}
        </div>
      </div>
      <div>
        <span className="st-label">{t('export.checklist')}</span>
        <dl className="checklist">
          <div><dt>{t('export.reopen')}</dt><dd className={`num tone-${deliveryAudit?.status ?? 'wait'}`}>{deliveryAudit ? deliveryAudit.status.toUpperCase() : t('export.verifying')}</dd></div>
          <div><dt>{t('export.drift')}</dt><dd className="num">{deliveryAudit ? `${deliveryAudit.boundsErrorMm.toFixed(3)} mm` : '—'}</dd></div>
          <div><dt>{t('export.named')}</dt><dd className="num">{deliveryAudit ? `${Math.round(deliveryAudit.namedNodeCoverage * 100)}%` : '—'}</dd></div>
          <div><dt>{t('export.validator')}</dt><dd className="num">{deliveryAudit?.standardValidation ? `${deliveryAudit.standardValidation.errors} ${t('export.errors')} · ${deliveryAudit.standardValidation.warnings} ${t('export.warnings')}` : deliveryAudit ? t('export.notRun') : '—'}</dd></div>
          <div><dt>{t('export.size')}</dt><dd className="num">{deliveryAudit ? bytesLabel(deliveryAudit.glbBytes) : '—'}</dd></div>
        </dl>
        {deliveryAudit?.status === 'blocked' && <p className="st-note is-blocked">{deliveryAudit.blockers.join(' · ')}</p>}
      </div>
      <button className="st-button is-primary is-wide is-tall" disabled={!pack || Boolean(packBlockReason)} title={packBlockReason} onClick={() => runAction('ASSET PACK', () => viewportRef.current!.exportAssetPack({
        assetId: activeAssetId, assetName: activeName, sourceIr: sourcePayload, qualityReport: quality, evidenceBoundary,
      }))}>
        <Download size={16} /><span><b>{t('export.pack')}</b><small>{t('export.packDetail')}</small></span>
      </button>
      <div>
        <span className="st-label">{t('export.formats')}</span>
        <div className="format-grid">
          {([
            ['GLB', () => viewportRef.current!.exportGlb(), 'Blender · Unity · Unreal · Godot'],
            ['OBJ', () => viewportRef.current!.exportObj(), 'Maya · C4D · 3ds Max'],
            ['STL · mm', () => viewportRef.current!.exportStl(), 'Fusion · slicer'],
            ['PLY', () => viewportRef.current!.exportPly(), 'MeshLab · CloudCompare'],
            ['USDZ', () => viewportRef.current!.exportUsdz(), 'Apple AR'],
            ['SVG', () => viewportRef.current!.exportFigmaSvg(), 'Figma 2D'],
            ['PNG', () => viewportRef.current!.capturePng(), '—'],
          ] as Array<[string, () => Promise<ExportReceipt>, string]>).map(([label, action, hint]) => (
            <button key={label} className="st-button" disabled={!pack || Boolean(glbBlockReason)} title={glbBlockReason ?? hint} onClick={() => runAction(label, action)}>
              <b>{label}</b><small>{hint}</small>
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="st-label">{t('export.source')}</span>
        <div className="format-grid">
          <button className="st-button" disabled={!sourceCurrent} onClick={() => downloadJson(sourcePayload, sourceFileName)}><b>{t('export.saveIr')}</b><small>{sourceFileName}</small></button>
          {assetKind === 'product' && assemblyIR?.electrical && <button className="st-button" onClick={() => downloadJson(buildPhysicalNetlist(assemblyIR), 'morphloom-physical-netlist.json')}><b>{t('export.saveNetlist')}</b><small>netlist.json</small></button>}
          <button className="st-button" disabled={!pack || !assemblyIR || !sourceCurrent} title={assemblyIR ? t('export.blenderKitNote') : t('cmd.needsIr')} onClick={() => assemblyIR && runAction('BLENDER NORMAL KIT', () => viewportRef.current!.exportBlenderNormalKit(assemblyIR))}><b>{t('export.blenderKit')}</b><small>ZIP</small></button>
        </div>
      </div>
      {jobs.length > 0 && (
        <div aria-live="polite">
          <span className="st-label">{t('export.queue')} · {busyAction ? t('export.running') : t('export.idle')}</span>
          <ul className="job-list">
            {jobs.slice(-5).reverse().map((job) => (
              <li key={job.id}>
                <span className="num">#{job.id}</span><b>{job.name}</b><span className={`tone-${job.status}`}>{job.status.toUpperCase()}</span>
                {(job.status === 'queued' || job.status === 'running') && <button className="st-link" onClick={() => cancelJob(job.id)}>{t('export.cancel')}</button>}
                {job.status === 'failed' && <button className="st-link" onClick={() => retryJob(job.id)}>{t('export.retry')}</button>}
                {(job.durationMs !== undefined || job.outputBytes !== undefined) && <small className="num">{job.durationMs !== undefined ? `${job.durationMs.toFixed(0)} ms` : ''}{job.outputBytes !== undefined ? ` · ${bytesLabel(job.outputBytes)}` : ''}</small>}
                {job.error && <small className="tone-failed">{job.error}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="st-inline">
        <span className="st-label">{t('export.proof')} <span className="num">{Object.keys(browserProofReceipts).length}/{BROWSER_PROOF_EXPECTED_COUNT}</span></span>
        <button className="st-button is-quiet" disabled={!sourceCurrent || Object.keys(browserProofReceipts).length === 0} onClick={() => {
          const report = createBrowserRoundTripReport(
            Object.values(browserProofReceipts).map((receipt) =>
              receipt.id === BROWSER_PROOF_ASSETS[activeAssetId]?.id && !observedQualityReleaseReady
                ? { ...receipt, qualityReleaseReady: false } : receipt),
            getBrowserConsoleEvidence(),
          );
          downloadJson(report, 'morphloom-browser-roundtrip.json');
        }}>{t('export.saveProof')}</button>
      </div>
      <div className="st-note">
        <b>{t('export.scope')}</b>
        <p>GLB · OBJ · PLY · STL (mm) · SVG · USDZ</p>
        <p className="muted">{t('export.scopeNote')}</p>
      </div>
    </div>
  );

  const settingsPanel = (
    <div className="st-stack">
      <label className="st-field">
        <span className="st-label">{t('settings.language')}</span>
        <select className="st-select" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
          {LOCALES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <div className="st-field">
        <span className="st-label">{t('settings.theme')}</span>
        <div className="st-segment" role="group" aria-label={t('settings.theme')}>
          {(['dark', 'light'] as Theme[]).map((item) => <button key={item} className={theme === item ? 'is-on' : ''} aria-pressed={theme === item} onClick={() => setTheme(item)}>{t(`settings.${item}`)}</button>)}
        </div>
      </div>
      <div>
        <span className="st-label">{t('settings.privacy')}</span>
        <dl className="checklist">
          <div><dt>{t('settings.compile')}</dt><dd className="num">{telemetry ? `${telemetry.compileMs.toFixed(1)} ms` : '—'}</dd></div>
          <div><dt>{t('settings.memory')}</dt><dd className="num">{bytesLabel(telemetry?.estimatedRenderBytes ?? 0)}</dd></div>
          <div><dt>{t('settings.upload')}</dt><dd>{t('settings.uploadNone')}</dd></div>
        </dl>
        <p className="st-footnote">{t('settings.privacyNote')}</p>
      </div>
      {library.some((entry) => entry.kind === 'imported') && (
        <button className="st-button is-quiet" onClick={clearImported}><Trash2 size={14} />{t('settings.clearImported')}{importExpiresAt && <small className="num">{t('settings.expires', { n: Math.max(1, Math.ceil((importExpiresAt - Date.now()) / 60_000)) })}</small>}</button>
      )}
      <button className="st-button is-quiet" onClick={() => helpRef.current?.showModal()}><Keyboard size={14} />{t('rail.shortcuts')}</button>
    </div>
  );

  const panels: Record<RailSection, React.ReactNode> = { parts: partsPanel, materials: materialsPanel, measure: measurePanel, checks: checksPanel, export: exportPanel, settings: settingsPanel };
  const panelTitles: Record<RailSection, MessageKey> = { parts: 'parts.title', materials: 'materials.title', measure: 'measure.title', checks: 'checks.title', export: 'export.title', settings: 'settings.title' };

  const libraryPanel = (
    <div className="library">
      <div className="library-head">
        <div className="st-segment" role="group" aria-label={t('library.title')}>
          {(['all', 'imported', 'presets'] as LibraryFilter[]).map((item) => (
            <button key={item} className={libraryFilter === item ? 'is-on' : ''} aria-pressed={libraryFilter === item} onClick={() => setLibraryFilter(item)}>
              {t(item === 'all' ? 'library.all' : item === 'imported' ? 'library.imported' : 'library.presets')}
              <span className="num">{item === 'all' ? library.length : library.filter((entry) => (item === 'imported') === (entry.kind === 'imported')).length}</span>
            </button>
          ))}
        </div>
        <button className="st-button is-primary" disabled={queueLocked} onClick={() => fileInputRef.current?.click()}><FolderOpen size={14} />{t('library.open')}</button>
      </div>
      {failures.length > 0 && (
        <div className="st-note is-blocked" role="alert">
          <b>{t('library.failed')} <span className="num">{failures.length}</span></b>
          <ul>{failures.slice(0, 4).map((item) => <li key={item.name}><span className="num">{item.name}</span> · {item.error}</li>)}</ul>
        </div>
      )}
      {filteredLibrary.length === 0 ? (
        <button className="library-empty" onClick={() => fileInputRef.current?.click()}><FolderOpen size={22} /><span>{t('library.emptyImported')}</span></button>
      ) : (
        <div className="library-grid" role="listbox" aria-label={t('library.title')}>
          {filteredLibrary.map((entry) => (
            <div key={entry.key} className={`cell-wrap${compareKey === entry.key ? ' is-compared' : ''}`}>
              <button
                role="option"
                aria-selected={entry.key === activeKey}
                className={`cell${entry.key === activeKey ? ' is-active' : ''}`}
                disabled={queueLocked && entry.key !== activeKey}
                title={entry.fileName ?? entry.name}
                onClick={() => activate(entry.key)}
              >
                <span className="cell-thumb">{entry.thumb && <img src={entry.thumb} alt="" />}</span>
                <span className="cell-no num">{String(entry.number).padStart(2, '0')}</span>
                {entry.seen && entry.key !== activeKey && <span className="cell-seen" aria-label={t('library.seen')}><Check size={11} strokeWidth={2.5} /></span>}
                <span className="cell-label"><span>{entry.fileName ? entry.fileName.replace(/\.json$/i, '') : entry.name}</span></span>
              </button>
              {entry.key !== activeKey && (
                <button
                  className={`cell-compare${compareKey === entry.key ? ' is-on' : ''}`}
                  aria-pressed={compareKey === entry.key}
                  aria-label={t('library.compare')}
                  title={t('library.compare')}
                  onClick={() => setCompareKey(compareKey === entry.key ? undefined : entry.key)}
                ><Columns2 size={13} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="st-footnote">{t('library.prevNext')}</p>
    </div>
  );

  const inspectorPanel = !selectedPart ? (
    <div className="inspector-empty">
      <Box size={22} aria-hidden="true" />
      <b>{t('inspector.none')}</b>
      <p>{t('inspector.noneDetail')}</p>
      {assemblyIR && (
        <dl className="st-metrics is-three">
          <div><dt>{t('inspector.sourceParts')}</dt><dd className="num">{assemblyIR.components.length}</dd></div>
          <div><dt>{t('inspector.conductors')}</dt><dd className="num">{productConnectivity?.wires ?? 0}</dd></div>
          <div><dt>{t('inspector.pins')}</dt><dd className="num">{productConnectivity?.documentedPhysicalPins ?? 0}</dd></div>
        </dl>
      )}
    </div>
  ) : (
    <div className="inspector">
      <header className="inspector-head">
        <div>
          <h3>{selectedPart.name}</h3>
          <span className="num muted">{selectedPart.id}</span>
        </div>
        {selectedStatus && <span className={`ev-badge ev-${selectedStatus}`}>{t(`evidence.${selectedStatus}`)}</span>}
      </header>
      {editedIds.has(selectedPart.id) && (
        <div className="override-row">
          <span className="override-badge">{t('inspector.edited')}</span>
          <button className="st-link" onClick={() => revertComponent(selectedPart.id)}><Undo2 size={13} />{t('inspector.revert')}</button>
        </div>
      )}
      <dl className="kv">
        <div><dt>{t('inspector.category')}</dt><dd>{selectedPart.category}</dd></div>
        <div><dt>{t('inspector.material')}</dt><dd>{selectedComponent && <i className="material-chip is-small" style={{ background: selectedComponent.material.color }} />}{selectedPart.material}</dd></div>
        <div><dt>{t('inspector.surface')}</dt><dd>{selectedPart.surface}</dd></div>
        {selectedComponent && <div><dt>{t('inspector.geometry')}</dt><dd className="num">{selectedComponent.geometry.op}</dd></div>}
        {selectedComponent?.position && <div><dt>{t('inspector.position')}</dt><dd className="num">{selectedComponent.position.map((value) => Math.round(value)).join(' · ')}</dd></div>}
        {selectedComponent?.evidence && <div><dt>{t('inspector.source')}</dt><dd className="num">{selectedComponent.evidence.source ?? '—'}</dd></div>}
      </dl>
      {selectedPart.detail && <p className="inspector-detail">{selectedPart.detail}</p>}
      <button className="st-button is-quiet" onClick={() => viewportRef.current?.focusPart(selectedPart.id)}><Maximize2 size={13} />{t('inspector.focus')} <kbd>F</kbd></button>
      {layoutEditable && assemblyIR && (
        <div className="layout-pad" aria-label={t('inspector.layout')}>
          <span className="st-label">{t('inspector.layout')}</span>
          <div>
            <button aria-label="-X 250 mm" onClick={() => editSelectedLayout({ kind: 'translate', deltaMm: [-250, 0, 0] })}><ArrowLeft size={14} /></button>
            <button aria-label="-Z 250 mm" onClick={() => editSelectedLayout({ kind: 'translate', deltaMm: [0, 0, -250] })}><ArrowUp size={14} /></button>
            <button aria-label="+Z 250 mm" onClick={() => editSelectedLayout({ kind: 'translate', deltaMm: [0, 0, 250] })}><ArrowDown size={14} /></button>
            <button aria-label="+X 250 mm" onClick={() => editSelectedLayout({ kind: 'translate', deltaMm: [250, 0, 0] })}><ArrowRight size={14} /></button>
            <button aria-label="-15°" onClick={() => editSelectedLayout({ kind: 'rotateY', radians: -Math.PI / 12 })}><RotateCcw size={14} /> 15°</button>
            <button aria-label="+15°" onClick={() => editSelectedLayout({ kind: 'rotateY', radians: Math.PI / 12 })}><RotateCw size={14} /> 15°</button>
            <button onClick={() => baselineAssemblyIR && editSelectedLayout({ kind: 'reset', source: baselineAssemblyIR })}>{t('inspector.reset')}</button>
          </div>
        </div>
      )}
      {assetKind === 'product' && assemblyIR && (
        <AssemblyComponentEditor sourceCurrent={sourceCurrent} isSourceCurrent={() => sourceCurrent} ir={assemblyIR} selectedId={selectedPart.id} onCommit={(next) => commitIr(next, t('note.edit'))} />
      )}
    </div>
  );

  const compareEntry = compareKey && compareKey !== activeKey ? library.find((entry) => entry.key === compareKey) : undefined;
  const compareView = useMemo(() => {
    if (!compareEntry) return undefined;
    const preset = VIEWER_ASSETS.find((asset) => asset.id === compareEntry.presetId);
    if (compareEntry.kind === 'imported' || !preset) return { kind: 'product' as AssetKind, spec: DEFAULT_SPEC, productSpec: DEFAULT_PRODUCT_SPEC, ir: compareEntry.ir };
    return preset.kind === 'human'
      ? { kind: 'human' as AssetKind, spec: preset.spec, productSpec: DEFAULT_PRODUCT_SPEC, ir: undefined }
      : { kind: 'product' as AssetKind, spec: DEFAULT_SPEC, productSpec: preset.spec, ir: compareEntry.ir ?? preset.assemblyIR };
  }, [compareEntry]);

  const readout = assetKind === 'human'
    ? `${spec.heightCm} cm`
    : productEnvelope ? `${productEnvelope.x} × ${productEnvelope.y} × ${productEnvelope.z}` : assemblyIR ? undefined : `${productSpec.widthMm} × ${productSpec.heightMm}`;

  return (
    <main
      className="studio"
      data-theme={theme}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragActive(true); } }}
      onDragLeave={(event) => { if (event.currentTarget === event.target || !event.relatedTarget) setDragActive(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        void filesFromDrop(event.dataTransfer).then(importFiles);
      }}
    >
      <header className="st-top">
        <div className="st-brand"><span className="brand-mark"><SceliphIcon /></span><b>SCELIPH</b><span className="muted">{t('brand.edition')}</span></div>
        <nav className="st-crumb" aria-label={t('top.result')}>
          <button className="st-link" onClick={() => { setRightTab('library'); setRightCollapsed(false); }}>{t('top.library')}</button>
          <span className="muted">/</span>
          <select value={activeKey} disabled={queueLocked} aria-label={t('top.result')} onChange={(event) => activate(event.target.value)}>
            {library.map((entry) => <option key={entry.key} value={entry.key}>{String(entry.number).padStart(2, '0')} · {entry.fileName ?? entry.name}</option>)}
          </select>
        </nav>
        <div className="st-top-actions">
          <div className="st-group">
            <button className="st-icon" disabled={pastRef.current.length === 0} aria-label={t('top.undo')} title={`${t('top.undo')} ⌘Z`} onClick={() => stepHistory(-1)}><Undo2 size={16} /></button>
            <button className="st-icon" disabled={futureRef.current.length === 0} aria-label={t('top.redo')} title={`${t('top.redo')} ⇧⌘Z`} onClick={() => stepHistory(1)}><Redo2 size={16} /></button>
          </div>
          <button className={`quality-pill${qualityBlocked ? ' is-blocked' : ''}`} onClick={() => openSection('checks')} title={t('checks.title')}>
            <i aria-hidden="true" />{t('top.quality')} <b className="num">{quality?.total ?? '—'}</b>{qualityBlocked && <span>· {t('top.blocked')} {blockedChecks}</span>}
          </button>
          <span className="local-pill"><i aria-hidden="true" />{t('top.local')}</span>
          <select className="st-select is-compact" value={locale} aria-label={t('top.language')} onChange={(event) => setLocale(event.target.value as Locale)}>
            {LOCALES.map((item) => <option key={item.id} value={item.id}>{item.id.toUpperCase()}</option>)}
          </select>
          <button className="st-icon" aria-label={t('top.theme')} title={t('top.theme')} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="st-button is-primary" onClick={() => openSection('export')}><Download size={15} />{t('top.export')}</button>
        </div>
      </header>

      <div className={`st-body${leftCollapsed ? ' left-collapsed' : ''}${rightCollapsed ? ' right-collapsed' : ''}`}>
        <nav className="st-rail" aria-label="Sections">
          {RAIL.map(({ id, icon: Icon, label }) => (
            <button key={id} className={section === id && !leftCollapsed ? 'is-on' : ''} aria-pressed={section === id && !leftCollapsed} aria-label={t(label)} data-tip={t(label)} onClick={() => openSection(id)}>
              <Icon size={18} strokeWidth={1.75} />
            </button>
          ))}
          <button className="rail-bottom" aria-label={t('rail.shortcuts')} data-tip={`${t('rail.shortcuts')} ?`} onClick={() => helpRef.current?.showModal()}><Keyboard size={18} strokeWidth={1.75} /></button>
        </nav>

        <aside className="st-left" aria-label={t(panelTitles[section])} hidden={leftCollapsed}>
          <header className="panel-head">
            <h2>{t(panelTitles[section])}</h2>
            {section === 'parts' && <span className="num muted">{formatPartsCount(outlinerRows.length)}</span>}
          </header>
          <div className="panel-body">{panels[section]}</div>
        </aside>

        <section className={`st-viewport${compareView ? ' is-split' : ''}`} aria-label="3D viewport">
          {pack ? (
            <div className="vp-pane is-primary">
            <ViewportErrorBoundary resetKey={activeKey}>
              <ResultViewport
                ref={viewportRef}
                assetKind={assetKind}
                pack={pack}
                spec={spec}
                productSpec={productSpec}
                assemblyIR={assemblyIR}
                mode={mode}
                measurementEnabled={measurementEnabled}
                measurementMode={measurementMode}
                measurementUnit={measurementUnit}
                dimensionOverviewEnabled={dimensionOverviewEnabled}
                display={display}
                onBuilt={handleBuilt}
                onQualityMetrics={handleQualityMetrics}
                onPartSelected={handlePartSelected}
                onPartHover={setHover}
                onMeasurementChange={handleMeasurementChange}
                onMeasurementMiss={() => setMeasurementMissed(true)}
                onDeliveryAudit={handleDeliveryAudit}
                onTelemetry={setTelemetry}
              />
            </ViewportErrorBoundary>
            </div>
          ) : (
            <div className={`vp-state${packError ? ' is-error' : ''}`} role="status">
              {packError ? <><b>{t('view.packError')}</b><span>{packError}</span></> : <><i className="vp-spinner" /><b>{t('view.loading')}</b><span>{t('view.loadingDetail')}</span></>}
            </div>
          )}

          {pack && compareView && compareEntry && (
            <div className="vp-pane is-compare">
              <ViewportErrorBoundary resetKey={compareEntry.key}>
                <ResultViewport
                  ref={compareRef}
                  assetKind={compareView.kind}
                  pack={pack}
                  spec={compareView.spec}
                  productSpec={compareView.productSpec}
                  assemblyIR={compareView.ir}
                  mode={mode}
                />
              </ViewportErrorBoundary>
              <div className="vp-compare-label is-glass">
                <Columns2 size={13} aria-hidden="true" />
                <span className="num">{String(compareEntry.number).padStart(2, '0')}</span>
                <b>{compareEntry.fileName?.replace(/\.json$/i, '') ?? compareEntry.name}</b>
                <button className="st-icon" aria-label={t('library.compareClose')} title={t('library.compareClose')} onClick={() => setCompareKey(undefined)}><X size={14} /></button>
              </div>
            </div>
          )}

          <div className="vp-toolbar" role="toolbar" aria-label={t('view.modes')}>
            <div className="st-segment is-glass" role="group" aria-label={t('view.modes')}>
              {MODES.map((item) => <button key={item.id} className={mode === item.id ? 'is-on' : ''} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</button>)}
            </div>
            {architecturalResult && (
              <div className="st-segment is-glass" role="group" aria-label={t('view.levels')}>
                {(['all', 'L1', 'L2'] as BuildingLevel[]).map((level) => (
                  <button key={level} className={buildingLevel === level ? 'is-on' : ''} aria-pressed={buildingLevel === level} onClick={() => { setBuildingLevel(level); setSelectedPart(undefined); clearMeasurement(); viewportRef.current?.setBuildingLevel(level); }}>{level === 'all' ? 'ALL' : level}</button>
                ))}
              </div>
            )}
            {architecturalResult && (
              <div className="st-segment is-glass" role="group">
                {(['day', 'night'] as LightingMode[]).map((item) => (
                  <button key={item} className={lightingMode === item ? 'is-on' : ''} aria-pressed={lightingMode === item} onClick={() => { setLightingMode(item); viewportRef.current?.setLighting(item); }}>{t(`view.${item}`)}</button>
                ))}
              </div>
            )}
            {sceneParts.length > 1 && (
              <label className="explode is-glass">
                <span>{t('view.explode')}</span>
                <input type="range" min={0} max={1} step={0.01} value={explode} aria-label={t('view.explode')} onChange={(event) => { clearMeasurement(); setExplode(Number(event.target.value)); }} />
              </label>
            )}
          </div>

          <div className="vp-viewchip is-glass" role="group" aria-label={t('view.camera')}>
            <span className="vp-viewchip-label">{t(cameraView === 'top' && architecturalResult ? 'view.plan' : `view.${cameraView}`)}</span>
            <div>
              {(['front', 'iso', 'top', 'rear'] as CameraView[]).map((view) => (
                <button key={view} className={cameraView === view ? 'is-on' : ''} aria-pressed={cameraView === view} onClick={() => setView(view)}>
                  {t(view === 'top' && architecturalResult ? 'view.plan' : `view.${view}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="vp-zoom is-glass" role="group" aria-label={t('view.fit')}>
            <button aria-label={t('view.zoomIn')} title={t('view.zoomIn')} onClick={() => viewportRef.current?.zoomBy(1.25)}><ZoomIn size={15} /></button>
            <button aria-label={t('view.zoomOut')} title={t('view.zoomOut')} onClick={() => viewportRef.current?.zoomBy(0.8)}><ZoomOut size={15} /></button>
            <button aria-label={t('view.fit')} title={t('view.fit')} onClick={() => viewportRef.current?.fitAsset()}><Maximize2 size={15} /></button>
          </div>

          {hover && (
            <div className="vp-hover" style={{ left: hover.x + 14, top: hover.y + 12 }} role="tooltip">{hover.name}</div>
          )}

          {noteVisible && <div className="vp-note" role="status" key={noteStamp}>{viewerNote}</div>}

          {measurementEnabled && (
            <div className="vp-measure is-glass" aria-live="polite">
              <Ruler size={14} /><span>{measurementPrompt}</span>
              {measurementResult && <b className="num">{formatMeasurement(measurementResult.distanceMeters, measurementUnit)}</b>}
            </div>
          )}

          {outlinerRows.length > 0 && (
            <div className="evidence-strip" role="group" aria-label={t('evidence.strip')}>
              {EVIDENCE_ORDER.map((status) => {
                const count = evidenceCounts.get(status) ?? 0;
                return (
                  <button
                    key={status}
                    className={`patch ev-${status}${evidenceFocus === status ? ' is-on' : ''}${evidenceFocus && evidenceFocus !== status ? ' is-dim' : ''}`}
                    disabled={count === 0}
                    aria-pressed={evidenceFocus === status}
                    title={t('evidence.focus')}
                    onClick={() => setEvidenceFocus(evidenceFocus === status ? undefined : status)}
                  >
                    <span>{t(`evidence.${status}`)}</span><b className="num">{count}</b>
                  </button>
                );
              })}
              <button className={`patch-toggle${hatchInferred ? ' is-on' : ''}`} aria-pressed={hatchInferred} disabled={!evidenceCounts.get('inferred')} onClick={() => setHatchInferred((value) => !value)}>
                <i aria-hidden="true" />{t('evidence.hatch')}
              </button>
            </div>
          )}

          <div className="vp-axis" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 34 34"><path d="M6 28V6" /><path d="M6 28h22" /><text x="2" y="5">Y</text><text x="29" y="31">X</text></svg><span className="num">{measurementUnit}</span></div>

          <dl className="vp-readout">
            <div><dt>{t(assetKind === 'human' ? 'readout.height' : 'readout.envelope')}</dt><dd className="num">{readout ?? <i className="skeleton-bar" />}</dd></div>
            {assetKind === 'product' && <div><dt>{t('readout.parts')}</dt><dd className="num">{productPartCount ?? <i className="skeleton-bar is-short" />}</dd></div>}
            <div><dt>{t('readout.tris')}</dt><dd className="num">{displayedTriangles?.toLocaleString(locale) ?? <i className="skeleton-bar" />}</dd></div>
          </dl>

          <div className="vp-command">
            <CommandBar
              t={t}
              locale={locale}
              {...(assemblyIR ? { ir: assemblyIR } : {})}
              open={commandOpen}
              onOpenChange={setCommandOpen}
              scopeIds={scopeIds}
              scopeNames={partNames}
              onClearScope={() => setScopeIds([])}
              snapshot={() => viewportRef.current?.snapshot(768)}
              onApply={(next: AssemblyIR, entry: CommandLogEntry) => commitIr(next, t('cmd.applied', { n: entry.summary.length }))}
              {...(commandDisabledReason ? { disabledReason: commandDisabledReason } : {})}
            />
          </div>

          {dragActive && (
            <div className="vp-drop" aria-hidden="true"><FolderOpen size={28} /><b>{t('view.drop')}</b><span>{t('view.dropDetail')}</span></div>
          )}
        </section>

        <aside className="st-right" aria-label={t('library.title')} hidden={rightCollapsed}>
          <div className="st-tabs" role="tablist">
            <button role="tab" aria-selected={rightTab === 'library'} className={rightTab === 'library' ? 'is-on' : ''} onClick={() => setRightTab('library')}>{t('library.title')}</button>
            <button role="tab" aria-selected={rightTab === 'inspector'} className={rightTab === 'inspector' ? 'is-on' : ''} onClick={() => setRightTab('inspector')}>{t('library.inspector')}</button>
          </div>
          <div className="panel-body" role="tabpanel">{rightTab === 'library' ? libraryPanel : inspectorPanel}</div>
        </aside>
        <button className="edge-toggle is-right" aria-expanded={!rightCollapsed} aria-label={rightCollapsed ? t('panel.expand') : t('panel.collapse')} onClick={() => setRightCollapsed((value) => !value)}>{rightCollapsed ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}</button>
      </div>

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept="application/json,.json"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void importFiles(files);
        }}
      />

      <dialog ref={helpRef} className="st-dialog" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <header><h2>{t('help.title')}</h2><button className="st-icon" aria-label={t('cmd.close')} onClick={() => helpRef.current?.close()}><X size={15} /></button></header>
        <dl className="shortcut-list">
          {([
            ['F', 'help.focus'], ['H', 'help.hide'], ['⌥H', 'help.showAll'], ['/', 'help.solo'], ['⌘K', 'help.command'],
            ['M', 'help.measure'], ['Esc', 'help.escape'], ['⌘Z · ⇧⌘Z', 'help.undo'], ['[ · ]', 'help.prevNext'], ['?', 'help.help'],
          ] as Array<[string, MessageKey]>).map(([keys, label]) => <div key={label}><dt><kbd>{keys}</kbd></dt><dd>{t(label)}</dd></div>)}
        </dl>
      </dialog>
    </main>
  );
}
