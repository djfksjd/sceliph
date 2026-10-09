<div align="center">

<img src="./assets/brand/sceliph-hero.png" alt="SCELIPH — Shape things into existence" width="100%" />

# SCELIPH

**SHAPE THINGS INTO EXISTENCE**

### Local 3D asset generation, editing, and inspection through declarative IR

[한국어](./README.md) · [English](./README.en.md)

[![License](https://img.shields.io/badge/license-Apache--2.0-335cff?style=flat-square)](./LICENSE)
![Stage](https://img.shields.io/badge/stage-v0.4%20alpha-d69526?style=flat-square)
![Three.js](https://img.shields.io/badge/Three.js-r179-111111?style=flat-square)

</div>

Sceliph is an open-source local tool that turns photographs, drawings, measurements, and requirements into declarative IR, then generates meshes and PBR materials. A development agent such as Codex or Claude proposes structure and parameters; the engine computes geometry, patterns, and checks. The default workflow does not require a paid 3D generation API.

**This is `v0.4 alpha`. It does not guarantee accurate reconstruction from arbitrary photos, production delivery across all domains, or manufacturing CAD/BREP precision.** Passing a particular check or increasing polygon counts is not proof of overall quality.

## Local UI / UX

Actual Chrome screenshots show the bearing part tree and 3D viewport, individual ball selection and isolation, numeric/PBR inspection, and a UV checker preview.

These were **captured on 2026-10-09 from an earlier local build**. They do not include the latest plate regeneration panel. They illustrate the interface, not model accuracy or production delivery approval. [Capture details](./assets/screenshots/README.md)

![Sceliph local bearing assembly, stable part IDs and Inspector](./assets/screenshots/element-editor-bearing.jpg)

<table>
  <tr>
    <td width="50%"><img src="./assets/screenshots/element-editor-part-selection.jpg" alt="Isolated ball_0000 with transform, PBR and radius controls" width="100%" /><br /><strong>Part selection and isolation</strong><br />Select a stable ID and inspect mm/radian values, PBR appearance and sphere radius.</td>
    <td width="50%"><img src="./assets/screenshots/element-editor-uv-checker.jpg" alt="Synthetic UV checker preview on an isolated bearing ball" width="100%" /><br /><strong>UV checker inspection</strong><br />Inspect mapping with a synthetic pattern. This is not the source material or a measured texture.</td>
  </tr>
</table>

## Current status

**Sceliph is the new name of Morphloom.** Existing `morphloom.*` schemas, pack IDs and `npm run morphloom` remain compatible.

The supplied hero image is **brand artwork**, not an engine-generated asset or quality-validation result.

### Latest engine checkpoint · 2026-10-07

The core remains LLM-authored declarative IR executed by a local geometry engine. This update adds primary-form contact witnesses, tapered tubes, ellipsoid section controls, measured surface-error budgets, edit diagnostics and safer native JSON replacement. No dedicated neural 3D generator is added to the default dependencies.

| Scope | Measured improvement | Limits |
|---|---|---|
| Sphere refinement | 3mm authored sphere facet deviation: 0.01001→0.00462mm | Primitive-local error, not measured reconstruction accuracy |
| Lathe refinement | Default bushing circumference deviation: 0.26901→0.02998mm; bounds and unrelated attributes preserved | Explicit CLI, cardinal grids and raw scalar PBR; not CAD/BREP |
| Local editing | Declarative recipes, contact witnesses, tapered beak and section controls | Authored bird study, no anatomical or physical certification |
| Edit safety | Failed/stale Fit blocks Apply; unresolved native JSON imports block old-source saving/export | Code tests verified; latest actual browser operations blocked/not-run |
| Publication checks | 148 files / 957 tests, typecheck, benchmark and build PASS | Fresh macOS arm64/Node24 execution on publication code |
| Production delivery | **Not achieved** | Global gates and Blender normal drift remain unresolved |

See the [publication checkpoint](./docs/GITHUB_CHECKPOINT_20261007.ko.md) for the freshly isolated publication tests and SHA receipts. The earlier local count of 976 included 19 unrelated thermal tests and is not reused as the published code's test count. Existing 5% UV and strict GLB contracts remain unchanged.

[Sphere error](./docs/SPHERE_SURFACE_BUDGET_STATUS.ko.md) · [Lathe error and CLI](./docs/LATHE_SURFACE_BUDGET_STATUS.ko.md) · [Import safety](./docs/ELEMENT_SOURCE_LOAD_STATUS.ko.md) · [Next steps](./docs/ENGINE_NEXT_PLAN.ko.md)

### Historical checkpoint · 2026-10-04

The following table records its original inputs and revision. It is not new browser or DCC evidence for this update.

| Scope | Evidence | Limits |
|---|---|---|
| Tests/typecheck/benchmark/build | 113 files / 814 tests PASS; check, benchmark, build PASS | No arbitrary-input quality certification |
| Separate editable translated source | Small/default/large bearing and gear: 4 PASS | One embedded native source, identity parents, declared translation only |
| Actual native browser workflow | Download, fresh-session reload, repeat GLB, additional edit, Undo/Redo PASS4 | Input GLB before-edit reference metadata stays unchanged |
| Bound UV and critical features | Existing 24-tooth check and damaged-tooth FAIL retained | Unchanged 5% threshold; no aggregate substitution |
| Async invalidation | Reconstruction replacement/fault/unmount PASS6; existing delayed inspection PASS3 | Old results/downloads cannot survive a changed selection |
| Actual files | Strict validation PASS12; Blender first-import correspondence PASS4 | Raw Blender normal fidelity remains a separate FAIL |
| Overall production delivery | **Not achieved** | Current quality:gate and quality:production exit 1 at existing global receipt acceptance failures |

See [current evidence and hashes](./docs/TRANSLATED_SOURCE_STATUS.ko.md). Renderer 0.12 removes the runtime difference in corner-angle weighting; unverified older artifacts are not promoted.

Default Blender import normal drift remains. An optional source-normal importer and a single-thread benchmark profile have been verified on scoped cases. Rotated/scaled parent support has not been expanded. Existing `releaseAllowed` rules and thresholds were not weakened.

- [Previous validation fixes, 799 tests and then-current gate status](./docs/INDEPENDENT_PARSER_REJECTION_STATUS.ko.md)
- [Segment preflight, 814 tests and actual file/browser preservation](./docs/LATHE_SEGMENT_PREFLIGHT_STATUS.ko.md)
- [Current-bound single Blender proof and 811 tests](./docs/BOUND_BLENDER_SINGLE_PROOF_STATUS.ko.md)
- [Current 0.40 browser, Blender, Godot and static-delivery rerun evidence and gate limitations](./docs/CURRENT_DELIVERY_040_STATUS.ko.md)
- [Current opt-in lathe normals, 805 tests, actual reopen evidence and gate limitations](./docs/ASSEMBLY_LATHE_NORMAL_STATUS.ko.md)
- [Blender tangent determinism](./docs/BLENDER_TANGENT_DETERMINISM_STATUS.ko.md)
- [Checkpoint, modeling mathematics, and limits (Korean)](./docs/CHECKPOINT_20261003_2340.ko.md)
- [Work state (Korean)](./docs/MORPHLOOM_WORK_STATE.ko.md)
- [Bound UV status](./docs/BOUND_REFERENCE_UV_STATUS.ko.md) · [UI status](./docs/BOUND_REFERENCE_UV_UI_STATUS.ko.md)
- [Engine evidence](./benchmarks/modeling-slices-20261003/bound-reference-uv/verification.json) · [UI evidence](./benchmarks/modeling-slices-20261003/bound-reference-uv-ui/verification.json)

## Quick start

Requires Node.js **20.19 or newer**. Target-app validation requires separately installed tools such as Blender.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Example assets can be selected with `?asset=cooler`.

| Screen | Route | Purpose |
|---|---|---|
| Inspection viewer | `/` | Review, measure, inspect, export |
| Part/element editor | `/?editor=elements` | Domain Pack generation, ID selection, parameter edits, isolate, undo/redo, save |
| Workspace editor | `/?editor=workspace` | Per-asset editing, selection, isolate, separate editor session files |
| Visible-depth editor | `/?editor=depth` | Experimental relative-depth inspection with explicit camera and calibration data |

The web UI includes focused generation and editing workflows. It is not a general DCC or an arbitrary-prompt-to-any-object web service.

## How it works

```text
photos · drawings · measurements · requirements
                  ↓ development agent / declarative input
 CharacterIR · AssemblyIR · Elements / Workspace source
                  ↓ local engine
 parametric geometry · fields · meshes · PBR materials
                  ↓
 part edits · dimension/silhouette/topology/UV inspection
                  ↓
 source JSON + actual delivery files + reports
```

- IR preserves stable IDs, units, coordinates, and evidence. Prefer declared operations over arbitrary generated scripts.
- Geometry includes extrude, lathe, tube, limited loft/bevel, implicit surfaces, and visual hulls. This is not a complete CAD operation set or NURBS/BREP kernel.
- Gears use a constrained involute spur-gear model with module, tooth count, and pressure angle. Root geometry is approximate; manufacturing approval is out of scope.
- Bearings are authored visual assemblies with rings, grooves, pockets, and individual balls. Clearances are not manufacturer measurements or load/lifetime certification.
- A baked mesh and its procedural source are different artifacts. Arbitrary Blender edits are not automatically written back to IR.

An optional offline Distill-Any-Depth-Small worker produces relative inverse-depth evidence. It needs separately supplied weights, an environment, and measured calibration data; it is not a default dependency. It cannot establish unseen backs, interiors, or exact thickness from one photograph. See [depth surface status](./docs/DEPTH_SURFACE_STATUS.ko.md).

## Editing workflow

Open `/?editor=elements`, select a Domain Pack, and generate. Save existing edits before generating a new project.

1. Select a part or element by stable ID.
2. Apply or cancel supported numeric, geometry, and material edits.
3. Inspect with isolate and review views; compare with undo/redo.
4. Save/reopen source JSON and export selected or project GLB with reports.

Examples include gears, bearings, birds, fur, and extension packs. Tools and representations differ by pack. Registration is not delivery verification or a general assembly constraint, kinematics, or physics solver.

- [Domain Pack SDK and version contracts](./docs/DOMAIN_PACK_SDK.ko.md)
- [Workspace sessions](./docs/WORKSPACE_SESSION_STATUS.ko.md) · [isolate](./docs/WORKSPACE_ISOLATE_STATUS.ko.md)
- [Corner-angle normals and DCC limits](./docs/CORNER_NORMAL_STATUS.ko.md)

### Bound original/current GLB UV inspection

Expand **Original/current GLB UV inspection**, select original and translated files, run `Inspect bound reference UV`, and save the report. Files are read locally; the viewport project remains unchanged.

This accepts results from the [declared source-preserving translation adapter](./docs/SOURCE_SPEC_REFERENCE_STATUS.ko.md). Arbitrary DCC edits, wrong originals, and unsupported representations are rejected. Even after a UV pass, source metadata in the current GLB remains a **before-edit reference** with `currentEditableIRAvailable: false`. UV acceptance is not overall delivery approval.

The same check is available through the CLI. Use a new report path.

```bash
npx vite-node scripts/bound-reference-uv-audit.ts original.glb translated.glb new-report.json
```

## Jobs and reference surfaces

The declarative [`morphloom.job/0.1`](./schemas/morphloom-job.schema.json) contract binds local input files to SHA-256. The following paths are examples to prepare yourself.

```bash
npm run morphloom -- inspect --job work/job.json
npm run morphloom -- build --job work/job.json --out outputs/run-001
npm run surface:prepare -- --input ./reference.jpg --output ./outputs/surface.json
```

Photo-derived color, normals, roughness, and micro-height are inferred representations affected by lighting and pigmentation. They are not calibrated depth or measured material properties. Inspect evidence and execution status; `review-pass` is distinct from `delivery-pass` and `releaseAllowed: true`.

## Export and target applications

| Format | Representation and limits |
|---|---|
| GLB | Meshes, PBR, supported rigs/morphs/animation; editable IR is preserved separately as JSON |
| OBJ / PLY | Static mesh exchange; verify material/texture preservation for each format and app |
| STL | mm/Z-up mesh reference, not a manufacturing STEP/BREP solid |
| USDZ | AR exchange; unsupported surface representations require separate checks |
| SVG / PNG | 2D inspection sheets and renders |
| ZIP | Mesh/source/report bundles from supported workflows |

Export capabilities differ by workflow. Creating a file does not prove target-app compatibility. Historical Blender, Godot, and slicer cases belong to their engine versions and input hashes; they are not fresh evidence for every current asset. Unity, Unreal, and other apps are claimed only to the extent actually verified.

## Validation commands

```bash
npm run check
npm test
npm run build
npm run quality:gate
npm run quality:production
npm run gltf:validate -- path/to/asset.glb
```

Optional app checks require installed target tools. Consult [package.json](./package.json) for benchmark commands.

Tests, internal scores, and format validation do not replace independent expert review or measurements. Historical 100% results for locked fixtures are not the current production status. Evidence must match its date, engine version, inputs, outputs, and execution scope. See [benchmark policy](./benchmarks/README.md) and [comparison policy](./docs/COMPETITIVE_BENCHMARK.md).

## Known limits

- Hidden geometry from one photo is inferred; silhouettes cannot recover every concavity.
- Depth surfaces are experimental open surfaces requiring explicit camera/calibration contracts, not general delivery-approved assets.
- Characters are editing/previsualization bases; photoreal anatomy, FACS, muscle and cloth simulation are separate work.
- Electrical and architectural checks do not replace safety analysis, structural engineering, or field approval.
- PBR appearance does not establish density, strength, friction, or measured physical properties.
- Full CAD/BREP, NURBS, IFC, USD, and every representation or adapter are not claimed supported.

## Data and license

The viewer does not upload local file inputs to external servers. External model calls made separately by development agents or users require their own review. Browser memory and saved repository/download files are distinct; users manage saved local files.

Code is [Apache-2.0](./LICENSE). See [NOTICE](./NOTICE) for included data and source attribution. Optional external model code and weights have separate licenses.

### Optional Blender source-normal import

An explicit local tool tested in Blender 5.2.1 creates a source-normal-preserving `.blend` and SHA-bound receipt. It is separate from the default importer and rejects textures, rigs, animations and morphs. See [usage, limits and current evidence](docs/BLENDER_FIRST_IMPORT_STATUS.ko.md). This is not production approval or inverse reconstruction of DCC edits into IR.

The interchange repair CLI rejects overwriting sources or existing outputs. Use fresh output paths when rerunning. See [preservation contract and current file checks](docs/INTERCHANGE_OUTPUT_PRESERVATION_STATUS.ko.md).


## Brand assets

<img src="./assets/brand/sceliph-logo-light.png" alt="SCELIPH bee symbol and wordmark" width="520" />

Original supplied PNGs are preserved: [light logo](./assets/brand/sceliph-logo-light.png) · [dark outline](./assets/brand/sceliph-logo-outline-dark.png) · [symbol](./assets/brand/sceliph-symbol-dark.png) · [wordmark](./assets/brand/sceliph-wordmark-dark.png) · [hero](./assets/brand/sceliph-hero.png).

Repository: [djfksjd/sceliph](https://github.com/djfksjd/sceliph).
