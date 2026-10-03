# Local reproduction

Run from repository root on Node24.13.1 with existing node_modules. Archived harness files were executed in `work/lathe-profile-surface-normals`; copy them back there to preserve relative source imports. They use the recorded local output path; other machines must select their own output path and available native binaries. Do not use an old fixture manifest as a current compiler receipt.

`npm test`, `npm run check`, `npm run benchmark`, `npm run build`.

`./node_modules/.bin/vite-node work/lathe-profile-surface-normals/proof.ts`; then `size-proof.ts`, `file-preservation.ts`, `size-preservation.ts`, `cap-audit.ts`. The original missing-action attempt log is preserved; the archived harness uses the valid set action.

Native commands: `/Applications/Blender.app/Contents/MacOS/Blender --background --threads 1 --python-exit-code 1 --python scripts/blender-glb-roundtrip.py -- source.glb reexport.glb native.json`; `./node_modules/.bin/vite-node scripts/compare-native-normal-payload.ts source.glb reexport.glb bushing normals.json`.

Rendering: same Blender flags with `scripts/blender-neutral-render.py -- source.glb image.png render.json iso grazing /Users/danny/Documents/morphloom/outputs/lathe-shading-goal-20261004/fixed-space.json`. Compare recorded camera/lighting/normalization before interpreting visual changes.

Current full delivery refresh uses `scripts/export-cross-domain-fixtures.ts`, `blender-cross-domain-benchmark.ts`, `blender-cross-domain-edit-benchmark.ts`, `godot-cross-domain-benchmark.ts`, `prusaslicer-print-benchmark.ts`, `bind-blender-roundtrip-proof.ts`, and actual `scripts/current-static-browser-delivery.py` plus Blender static audits and `static-delivery-benchmark.ts`. Static exact argv are archived in `../current-delivery-041/static-commands.json`. Current compiler assertions may not be patched on old receipts. The final production gate remains FAIL; threshold changes are not part of reproduction.
