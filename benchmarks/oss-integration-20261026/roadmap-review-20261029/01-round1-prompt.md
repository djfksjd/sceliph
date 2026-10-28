You are a senior 3D-graphics / ML-evaluation engineer giving an independent second opinion on the roadmap of this repository (Sceliph / Morphloom engine). Read-only: do not modify files. Read the files yourself; do not trust summaries.

## Product goal (from the owner)
LLM-only 3D asset generation that is usable in production and comparable in quality to dedicated 3D generators. An LLM writes a declarative AssemblyIR (millimetres, Y-up primitives and ops such as lathe, tube, loft, extrude, booleanCSG); a deterministic TypeScript engine compiles it to GLB.

## Hard constraints
- CLAUDE.md / AGENTS.md: output only `morphloom.character/0.2` or `morphloom.assembly/0.1`; no Meshy, Tripo, dedicated 3D generator, or external 3D MCP in the default pipeline.
- Hunyuan3D is excluded (licence excludes South Korea).
- Method discipline used so far: plan → adversarial review → pre-registered protocol (hashes before test runs) → dev/test split → seeded bootstrap / sign tests. Negative results are recorded, not hidden.

## Evidence to read (the working tree, including uncommitted files)
- `CLAUDE.md`, `AGENTS.md`, `skills/morphloom-asset-foundry/SKILL.md` and its `references/`
- `docs/OSS_INTEGRATION_20261026.ko.md` — slices 1–16 (Korean). Sections 7–16 are the recent photo→IR research line.
- `docs/ENGINE_NEXT_PLAN.ko.md` — older checkpoints, including the production/delivery track.
- Benchmarks under `benchmarks/oss-integration-20261026/`: `abo-photo/`, `abo-multiview/test-summary.json`, `abo-appearance/summary.json`, `abo-texture/summary-b1.json`, `summary-b4.json`, `summary-b2.json`, `depth-advice/retrospective-9b.json`, `thin-diagnosis/`, `twoview-fit-plan/`, `visual-critique/`
- `benchmarks/competitive-latest.json` and `benchmarks/quality-latest.json`; `scripts/competitive-benchmark.ts` (exit condition near the end) and `scripts/quality-gate.ts`
- Engine code as needed: `src/engine/assembly-ir.ts`, `schemas/assembly-ir.schema.json`, `src/engine/mesh-shape-compare.ts`, `src/eval/appearance-metrics.ts`, `src/engine/surface-system.ts`

## Current facts not yet in the docs
- `npm run quality:gate` was run today and exits 1, with the same content as the committed result (only timestamps differ). Visible statuses: blenderCrossDomain and blenderCrossDomainEdit pass=true but benchmarkAccepted=false; unityCrossDomain not-run; electronics production evidence 52/90; competitive "same-reference perceptual winner" not established for either side.
- A pre-registered re-validation of the slice-12 side-photo rule on 36 fresh ABO items is paused: repeat 1 of 3 finished, nobody has looked at its scores yet. Protocol: `benchmarks/oss-integration-20261026/depth-advice-revalidation/protocol.json`.
- The ABO evaluations so far cover only TABLE, DESK, SHELF, CABINET, DRESSER, STOOL, LAMP, LIGHT_FIXTURE, ELECTRIC_FAN, STORAGE_BOX.
- Total model spend per pre-registered ABO run is roughly $0.3–$2 (Claude CLI, Sonnet).

## Questions
1. How much engine-enhancement work remains toward the stated goal? Break it down by capability area. For each area, give where it stands with the evidence (file and number), what "done" should mean, and a rough share of remaining effort. Say explicitly which areas have never been measured. Give a single overall percentage only if you think one is defensible, and explain why or why not.
2. Recommend the next 3–6 slices in order. For each: the hypothesis, the concrete change, the pre-registered success criterion, a kill/stop rule, rough cost (model $ and engineering days), and why it comes before the others.
3. What is methodologically wrong or wasteful in the recent slices (7–16)? Examples: metrics that do not predict quality, overfitting to ABO, sequencing mistakes, missing evaluation dimensions. Be concrete and cite files.
4. Which items in the production/delivery track (quality gate, Blender/Unity receipts, electronics evidence) actually matter for the stated goal, and which can be deprioritised?

Answer in Korean, at most about 1200 words, with file citations. Be blunt; disagreement with the current direction is welcome.
