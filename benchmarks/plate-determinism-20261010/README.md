# Full-file plate determinism · 2026-10-10

[Scope, compatibility and remaining gates](../../docs/PLATE_DETERMINISM_20261010.ko.md) · [source/artifact SHA manifest](verification.json)

- `legacy-baseline.json` and `before-browser.log`: fresh reproduction of native sin/cos descriptor drift.54 old source hashes remain unchanged.
- `decimal-reference.json`: independent140-digit Decimal oracle with90/140 precision convergence; regeneration script is in `scripts/`.
- `case-*`: six Node declarations, saved native sources, actual GLBs and native reopen outputs.
- `browser-case-*`: actual UI-generated native files, companion sources and fresh-session GLBs. Every corresponding complete file matches the Node bytes.
- `cross-runtime-report.json`: exact source/GLB/companion/reopen checks plus actual-file standard/parser/UV results.
- `plan-*`: exact two-target replacement source/GLB comparison and actual save/reopen/further-edit files.
- Blender reports: scoped current-file import/reexport and one selected-object translation. Whole-engine DCC readiness is not established.

`tests.log`:165files/1044tests. `focused-tests.log`:5files/19tests. `quality-production.log` retains the overall failed gate; no thresholds or UV data were removed. The simple GLBs retain one informational unused authored UV; the three-part plan retains three. No whole competitive infos0 claim.

Current macOS host, Node24 and Chrome154 only. No cross-OS/all-browser, photo fidelity, manufacturing or general model-inference accuracy claim.
