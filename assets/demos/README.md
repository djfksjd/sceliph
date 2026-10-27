# Result viewer demo clips · 2026-10-27

Autoplay-style screen recordings of the redesigned result viewer (`/`), recorded with Playwright driving system Chrome at 1440×1000 and Chrome's own screencast (≈50 fps), then encoded with ffmpeg (H.264 MP4, 30 fps) and img2webp (animated WebP, 1080 px, 15 fps) for inline README playback. The cursor overlay and click rings are drawn by the recording script; everything else is the running application. Loading time and the Claude CLI response wait are cut; nothing else is edited or composited.

- `demo-library-compare`: imported AssemblyIR files collect in the library; switching results; side-by-side comparison of the same ceiling fan written from one photo and from two photos; orbit and wheel zoom.
- `demo-evidence`: TEC cooling assembly preset; evidence color-target patches keep only parts with that evidence solid; inferred hatching; zoom in/out.
- `demo-parts`: outliner selection, solo, exploded view, Front/Top/ISO view chip, zoom and orbit.
- `demo-command`: a scoped edit through the ⌘K command bar. The request goes to the user's own Claude Code CLI with the current IR and a view snapshot; the returned whole-component change is shown as a diff, applied on approval, and marked "edited" with revert.

The ABO-derived fan and lamp IRs are LLM outputs from `benchmarks/oss-integration-20261026/abo-multiview/` (ABO data © Amazon.com, CC-BY-4.0). The clips show viewer behavior only; they do not certify reconstruction accuracy or production delivery. See `SHA256SUMS`.
