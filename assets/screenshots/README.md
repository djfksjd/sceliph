# Current Sceliph UI captures · 2026-10-10

Actual Playwright Chrome154 screenshots of the running source at `http://127.0.0.1:4173/?editor=elements`. Base GitHub main: `78bec7e0ff31a0e5f602dbc43fbfc3e14b33dba5`, plus this branch's source-bound plan, cap policy and viewport refinement. Source SHA manifest: `../../benchmarks/practical-workflow-20261010/verification.json`.

- `workbench-20261010-desktop.jpg`: 1440×1000; authored bearing, inner-race selection, stable IDs, studio-lighting preview and Inspector.
- `workbench-20261010-mobile.jpg`: 390×844; the same project with scrollable mobile layout. No horizontal overflow observed; the viewport and editing sections continue below the first screen.
- `replacement-plan-20261010.jpg`: 1440×1000; two checked extrusion replacements; project unchanged until Apply.

JPEG90 screenshots with no retouching, compositing or generated mockups. Studio lighting is authored inspection lighting, not calibrated reference capture, and it is not exported into the asset. No photograph/model fidelity or whole-engine production claim. See `SHA256SUMS` and the current status document for behavior evidence.

## Historical 2026-10-09 captures

# Sceliph local UI captures

Captured on 2026-10-09 through the Chrome browser screenshot API. The images are actual application views, with no generated mockup, retouching, or compositing. Browser toolbar and unrelated tabs are not included.

The source was an already-open earlier Sceliph Element Editor at `http://127.0.0.1:4179/?editor=elements&gearprobe=1`. Its exact build commit was not verified. The server was no longer accepting new connections; the existing loaded client could still generate the authored bearing and display selection/isolate/checker controls. Starting the current source on port4173 failed with listen EPERM. These captures therefore do not certify the latest UI or the new plate regeneration workflow.

- `element-editor-bearing.jpg`: authored bearing assembly, stable part IDs and Inspector.
- `element-editor-part-selection.jpg`: selected `ball_0000`, isolate enabled, transform/PBR/sphere controls.
- `element-editor-uv-checker.jpg`: the same isolated ball with the synthetic checker preview enabled.

All files are unmodified JPEG screenshots at2123×1152. The shown geometry is an authored visualization, not a recovered or manufacturer-certified bearing. UI PASS text is scoped to the displayed inspector and is not whole-engine, Blender or production approval. The images contain no authentication fields, personal source paths, or external reference photographs.
