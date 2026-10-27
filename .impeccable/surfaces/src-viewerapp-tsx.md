---
version: 1
slug: "src-viewerapp-tsx"
primary_target: "src/ViewerApp.tsx"
related_targets: ["src/viewer-styles.css"]
---

# Surface brief · Result Viewer (`/`)

Mode: Operate. A category-fluent 3D artist or engineer opens CLI-generated results, compares many of them, picks parts apart, edits them (manually or through the Claude CLI command bar), checks the delivery gates, and exports to a DCC tool.

Audience and job: review → select/solo/measure → edit (direct or via command bar with diff approval) → export. Frequent comparison across a session library (e.g. 66 ABO IRs). Constraints: keep every existing viewer function; library must retain opened files; UI in ko/en/ja/zh; command bar sends IR + snapshot to the user's own Claude CLI and must say so.

Memorable moment: the evidence color-target strip under the viewport — click a patch and only those parts stay solid.

Unresolved: thumbnails exist only for results that were opened at least once.

## Direction contract

THESIS: The result stands on a neutral grey photographic cove like a product shoot, and trust is read off a color target. Refuses the near-black DCC workspace with one neon accent, and the white SaaS dashboard.

OWN-WORLD: Charcoal grey-card chrome (#1d1e20 / #222326 / #2a2b2e) around a mid-grey radial cove; text on charcoal in near-white. The only hues are ColorChecker patches with jobs: green measured, purplish-blue datasheet, orange-yellow estimated, magenta inferred, neutral-5 undocumented, red blocked, cyan (#0885a1) selection and focus only. System sans, SF Mono tabular numerals for measures only, rounded 10–14px, lucide strokes. Light theme is the same world with the shell flipped to grey card.

STORY: The visitor sees what the model is, how trustworthy each part is, which parts are selected or edited, and whether it can ship; they act by selecting, asking, approving, exporting.

FIRST VIEWPORT: 48px top bar (logo, library/result breadcrumb, undo/redo, quality pill, language, export). 56px icon rail; 260px outliner with size dots and evidence chips; the cove viewport takes the centre (≥65%) with a floating glass toolbar (display modes, camera presets, explode), a ViewCube-like view chip at top right, the axis/unit glyph at bottom left, the evidence color-target strip above it, and the ⌘K command bar centred at the bottom. 300px right panel with Library (numbered thumbnail cells, active ringed, seen ticked) and Inspector tabs.

FORM: Studio Cove & Color Target, 3rd of 7 on the ordered list (assigned by the roll). seed:4b1e64ae421fdd43. Raises: ply rule (only floating viewport overlays are translucent); volume-scaled size dots; cyan reserved for selection; numbered library cells with seen marks; solo ghosts the rest to 12%; every list declares its total, measures right-aligned in tabular numerals.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
