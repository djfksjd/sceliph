# Practical workflow proof · 2026-10-10

See [the scope and remaining gates](../../docs/PRACTICAL_WORKFLOW_20261010.ko.md) and [source SHA manifest](verification.json).

`report.json` is a compact viewing summary; `report.full.json.gz` losslessly preserves the full raw report and its decoded SHA. They contain three scales, nine actual native GLBs, source/output hashes, topology, actual-file UV, independent parser checks and preservation assertions. `before-*`, `plan-*`, `after-*`, `reopened-*` preserve reproducible inputs and actual files. Eight representative steps were also timed, without a worst-case latency claim.

`browser-audit.log` records actual UI interaction; its source and GLB downloads are retained. Blender reports bind the exact input files to import/reexport and one selected component translation. They do not certify arbitrary DCC edits, source-IR reverse translation or whole production.

`cap-before-*` preserves the original skinny-cap failure. `excluded-mixed-revision-tests.log` is deliberately excluded: source/version validation changed during that test process. `tests.log` is the later immutable 164-file / 1040-test passing run. `quality-production.log` preserves the overall exit1 state; dominance was not reached.

The Node/browser GLB binary payload matches, while sourceSpec metadata contains final-bit trig differences. Full-file cross-runtime equality is not claimed. New screenshots are genuine local application captures, not reference-model fidelity tests.
