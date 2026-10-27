---
name: Sceliph Result Viewer
description: A neutral grey photographic cove where you judge each generated part, with trust read off a color-checker target.
colors:
  charcoal-0: "#121315"
  charcoal-chrome: "#18191b"
  charcoal-bg: "#1d1e20"
  charcoal-panel: "#232427"
  charcoal-raised: "#2a2b2e"
  charcoal-line: "#2f3034"
  charcoal-line-strong: "#34363a"
  grey-hover-line: "#4a4c50"
  grey-mid: "#8a8b8d"
  ink: "#e6e6e4"
  ink-2: "#b9babb"
  ink-3: "#8f9093"
  paper: "#f5f5f3"
  cove-top: "#cfd0d1"
  cove-mid: "#a9aaac"
  cove-foot: "#7d7e80"
  cove-ink: "#2b2c2e"
  light-bg: "#e4e4e2"
  light-chrome: "#ececea"
  light-panel: "#f3f3f1"
  light-raised: "#e3e3e1"
  light-line: "#d6d6d3"
  light-line-strong: "#c4c4c1"
  light-ink-2: "#45474b"
  light-ink-3: "#6b6d71"
  select-cyan: "#12a6c8"
  select-ink: "#8fdcee"
  select-ink-light: "#0a6f88"
  checker-green: "#469449"
  checker-blue: "#505ba6"
  checker-orange: "#e0a32e"
  checker-orange-ink: "#2a1f05"
  checker-magenta: "#bb5695"
  checker-neutral: "#7a7a79"
  checker-red: "#c04048"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", \"Apple SD Gothic Neo\", \"Hiragino Sans\", \"PingFang SC\", \"Noto Sans CJK KR\", \"Noto Sans\", sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  readout:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", \"Apple SD Gothic Neo\", \"Hiragino Sans\", \"PingFang SC\", \"Noto Sans CJK KR\", \"Noto Sans\", sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", \"Apple SD Gothic Neo\", \"Hiragino Sans\", \"PingFang SC\", \"Noto Sans CJK KR\", \"Noto Sans\", sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  panel-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", \"Apple SD Gothic Neo\", \"Hiragino Sans\", \"PingFang SC\", \"Noto Sans CJK KR\", \"Noto Sans\", sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", \"Apple SD Gothic Neo\", \"Hiragino Sans\", \"PingFang SC\", \"Noto Sans CJK KR\", \"Noto Sans\", sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  control:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", \"Apple SD Gothic Neo\", \"Hiragino Sans\", \"PingFang SC\", \"Noto Sans CJK KR\", \"Noto Sans\", sans-serif"
    fontSize: "12px"
    fontWeight: 560
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", \"Apple SD Gothic Neo\", \"Hiragino Sans\", \"PingFang SC\", \"Noto Sans CJK KR\", \"Noto Sans\", sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.45
  numeral:
    fontFamily: "\"SF Mono\", ui-monospace, \"JetBrains Mono\", Menlo, Consolas, monospace"
    fontSize: "0.92em"
    fontFeature: "\"tnum\" 1"
  wordmark:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 720
    letterSpacing: "0.14em"
rounded:
  tag: "6px"
  s: "8px"
  m: "10px"
  cell: "12px"
  l: "14px"
  sheet: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  s: "8px"
  m: "12px"
  l: "16px"
  top-bar: "48px"
  rail: "56px"
  outliner: "272px"
  side-panel: "308px"
components:
  button:
    backgroundColor: "{colors.charcoal-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.m}"
    padding: "6px 12px"
    height: "32px"
  button-primary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.charcoal-bg}"
    typography: "{typography.control}"
    rounded: "{rounded.m}"
    padding: "6px 12px"
    height: "32px"
  button-quiet:
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "6px 12px"
  icon-button:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.s}"
    size: "32px"
  icon-button-on:
    backgroundColor: "{colors.charcoal-raised}"
    textColor: "{colors.ink}"
  segment:
    backgroundColor: "{colors.charcoal-chrome}"
    rounded: "{rounded.m}"
    padding: "3px"
  segment-item-on:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.charcoal-bg}"
    padding: "5px 10px"
  search-field:
    backgroundColor: "{colors.charcoal-chrome}"
    textColor: "{colors.ink}"
    rounded: "{rounded.s}"
    padding: "0 10px"
    height: "32px"
  filter-chip:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "24px"
  filter-chip-on:
    backgroundColor: "{colors.charcoal-raised}"
    textColor: "{colors.ink}"
  outliner-row:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.s}"
    padding: "0 6px 0 8px"
    height: "30px"
  library-cell:
    backgroundColor: "{colors.cove-mid}"
    rounded: "{rounded.cell}"
  evidence-patch:
    textColor: "{colors.paper}"
    rounded: "{rounded.tag}"
    padding: "5px 7px"
    width: "72px"
    height: "44px"
  evidence-patch-estimated:
    backgroundColor: "{colors.checker-orange}"
    textColor: "{colors.checker-orange-ink}"
  command-pill:
    textColor: "{colors.ink-3}"
    rounded: "{rounded.l}"
    padding: "0 8px 0 14px"
    height: "44px"
  gate-card:
    backgroundColor: "{colors.charcoal-chrome}"
    rounded: "{rounded.m}"
    padding: "12px"
  dialog:
    backgroundColor: "{colors.charcoal-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.l}"
    width: "440px"
---

# Design System: Sceliph Result Viewer

Scope: this system covers the root result viewer (`/`), styled entirely by `src/viewer/studio.css` under the `.studio` root. The other editors (`/?editor=elements|workspace|evidence|depth`) still use the legacy `src/viewer-styles.css`. That file sits outside this world and is not described here. When you restyle one of those editors into this world, take the tokens from here. Don't reconcile against the legacy sheet.

## Overview

**Creative North Star: "The Studio Cove and Color Target"**

The result stands on a seamless mid-grey photographic sweep, as at a product shoot, so material colour is judged against 18% grey and nothing else. Around it sits charcoal grey-card chrome: quiet, matte, tonal, the colour of a photographer's card held just out of frame. The world's only hues come from a color-checker target, and each one has a job. Evidence state (measured, datasheet, estimated, inferred, undocumented), gate state (pass, warn, blocked) and the user's own hand (cyan) are the only things that get colour.

Density is that of a working DCC tool. Body text is 13px, controls are 32px, rows are 30px, and every list states its total with right-aligned tabular numerals. The viewport takes the centre, and everything that floats over it is a thin translucent ply. The signature is the evidence strip, a checker card held in frame at the lower left of the cove. Clicking a patch leaves only those parts solid and ghosts the rest to 12%.

The light theme is the same world with the shell turned to the light side of the grey card. The cove, the checker hues and the cove-side overlays stay put.

The direction rejects two things: the near-black DCC workspace with a single neon accent, and the white SaaS dashboard.

**Key Characteristics:**
- Neutral grey cove (radial, light at top centre falling to mid grey) behind every product result; a shadow catcher on the floor, never a visible floor plane.
- Charcoal tonal chrome with no decorative colour; depth comes from four tonal steps and 1px lines.
- Seven checker hues, each bound to one meaning; cyan belongs to selection, focus, scope and pending edits.
- System sans for the UI; mono tabular numerals for every count, measure, ID and op tag.
- Gentle rounding (8 / 10 / 14px), lucide line icons, short 140ms state transitions on an expo-out curve.

## Colors

The neutrals are grey card with no tint. Every hue in the system belongs to a color-checker patch and carries a meaning.

### Primary
- **Selection Cyan** (`select-cyan`): the user's hand. Focus rings (2px outline, 2px offset), the selection hull and x-ray on meshes, the selected outliner row (as a 16% wash with a 55% inset line), the active library cell ring, switch-on, the scope chip, edited dots, `update` op tags, the drop target, and the search field's focus border. On dark chrome, cyan text uses **Select Ink** (`select-ink`). On light chrome it uses `select-ink-light`.

### Secondary
The color-checker patches, each locked to one meaning:
- **Checker Green** (`checker-green`): *measured* evidence and *pass*. These share a single green because both mean "verified".
- **Checker Purplish Blue** (`checker-blue`): *datasheet* evidence.
- **Checker Orange-Yellow** (`checker-orange`): *estimated* evidence and *warn* / running / queued. Text on an orange fill always uses **Orange Ink** (`checker-orange-ink`), never white.
- **Checker Magenta** (`checker-magenta`): *inferred* evidence. It also colours the screen-space diagonal hatch (85% alpha) that marks inferred parts on the model when hatching is on.
- **Checker Neutral 5** (`checker-neutral`): *undocumented* evidence.
- **Checker Red** (`checker-red`): *blocked* gates, failures, `remove` op tags, and errors. Blocked tints are mixed into chrome (10–22%) or into ink (70–75%). It never appears as a solid panel fill.

### Neutral
- **Charcoal ramp** (`charcoal-0` to `charcoal-line-strong`): the dark shell, in four tonal planes. Chrome (`charcoal-chrome`) holds the top bar, rail, segment tracks, cards and table cells. Background (`charcoal-bg`) is the base. Panel (`charcoal-panel`) holds the side panels and dialogs. Raised (`charcoal-raised`) holds buttons, hover fills and the on-state of quiet controls.
- **Ink** (`ink`, `ink-2`, `ink-3`): primary text, secondary text, and labels/placeholders on charcoal.
- **Paper** (`paper`): the primary action fill, the on-state of a segment, the user's chat turn, and rail tooltips. Primary means paper on charcoal, never a hue.
- **Cove** (`cove-top`, `cove-mid`, `cove-foot`): the radial backdrop of the viewport, the Three.js scene background and empty library cells. `cove-mid` is also the fog colour. **Cove Ink** (`cove-ink`) is used for text and the axis glyph drawn directly on the cove.
- **Light shell** (`light-*`): the light theme's chrome, panel, raised, line and ink steps. In this theme the primary action flips to charcoal on paper.

### Named Rules
**The Hue Has a Job Rule.** No colour may appear in the interface without a meaning. Any chromatic pixel of chrome or overlay is either a checker patch (evidence or gate state) or cyan (the user's hand). Decorative tints, gradients and brand colour washes do not exist in this world. The scene's photographic lighting (a warm key, a cool edge, a warm strip) is part of the shoot, not the palette.

**The Cyan Is the Hand Rule.** Cyan marks what the user is touching or about to change: selection, focus, scope, edited parts, pending `update` diffs, switch-on, drop target, and actionable links. It never signals evidence or quality. (The direction contract named #0885a1 and "selection and focus only". The build ships `select-cyan` with this wider set of jobs, and the build is the record.)

**The Grey Card Rule.** The cove is neutral grey so that material colour can be judged on it. Do not tint the cove, add a coloured floor, or put a vignette in a hue on it.

## Typography

**UI Font:** the platform system sans (`-apple-system`, SF Pro Text, Segoe UI, with Apple SD Gothic Neo / Hiragino Sans / PingFang SC / Noto Sans CJK for ko, ja and zh)
**Numeral Font:** SF Mono (with ui-monospace, JetBrains Mono, Menlo, Consolas)

**Character:** a native-tool voice. The sans stays out of the way of the model. Mono takes over the moment something is a number, an ID or an operation, so that measurements line up and read as instrument output.

### Hierarchy
- **Headline** (600, 40px, line-height 1, −0.03em): the quality score numeral in the Quality panel only.
- **Readout** (600, 24px): the live two-point measure value.
- **Title** (650, 16px, 1.3): the selected part's name in the Inspector.
- **Panel Title** (650, 14px): panel and dialog heads (dialog heads are 15px).
- **Body** (400, 13px, 1.45): all running text, list rows and kv values.
- **Control** (560, 12px): buttons, segments, chips, toolbar labels, chat metadata.
- **Label** (600, 11px, sentence case, no tracking): field labels, metric `dt`s, gate labels, footnotes (at 400).
- **Numeral** (mono, 0.92em, tabular): every count, dimension, triangle total, op name, timestamp and keyboard hint.

### Named Rules
**The Every List Counts Rule.** Every list and filter states its total in mono tabular numerals, and measures are right-aligned so the digits stack.

**The No Tracking Rule.** UI text uses 0 letter-spacing, and headings use −0.01em. The only tracked text is the SCELIPH wordmark (0.14em), which is a brand lockup. Labels stay in sentence case at 11px. No uppercase.

**The Keep-All Rule.** In Korean, lines break between words, never inside one (`word-break: keep-all`). Japanese and Chinese keep their native breaking.

## Layout

The shell is a fixed full-viewport grid with a 48px top bar over a four-column body: a 56px icon rail, a 272px outliner/left panel, the cove viewport (`minmax(0, 1fr)`), and a 308px right panel holding the Library and Inspector tabs. Either side panel collapses to 0 with a 200ms column transition. A slim 18×44px edge toggle rides the right panel's border.

The viewport is a positioned stage with overlays laid out on a 12px inset grid. The glass toolbar (display modes, explode) is centred at the top. The view chip sits top right, with zoom stacked below it. The evidence strip is at the bottom left, above the axis/unit glyph. The ⌘K command pill is centred at the bottom (`min(620px, 100% − 420px)`). The dimension and triangle readout is at the bottom right. In compare mode the viewport splits into two equal panes with a 1px cove-ink divider, and each pane gets its own glass label.

Spacing follows a 4px rhythm. 4px separates tight siblings, 8px separates controls in a group, 12px is the panel gutter and the overlay inset, and 16px separates stacked panel sections. Panel bodies pad `4px 12px 16px`.

Responsive behaviour:
- **≤1180px:** the left panel narrows to 248px. The right panel becomes a 300px overlay sheet with ambient shadow. The local-processing pill is hidden, and the command bar spans the viewport width minus 32px, lifted above the evidence strip.
- **≤760px:** the rail moves to a 56px bottom tab bar. The left panel becomes a 56%-height bottom sheet (16px top corners, upward shadow). The top bar drops to logo, breadcrumb, quality and an icon-only export. The toolbar left-aligns, explode and the readout are hidden, and the evidence patches flex to share the full strip width. The hatch toggle keeps a visible 9.5px wrapped label.
- `prefers-reduced-motion` collapses every animation and transition to 0.01ms.

## Elevation & Depth

The chrome is flat and tonal: chrome, background, panel and raised are four lightness steps separated by 1px lines. Shadows appear only on things that float over the cove or over other panels. The viewport gets its depth from light: an ACES filmic renderer, a room environment, a warm key and a cool edge light, exponential fog in the cove's mid grey, and a circular shadow catcher (charcoal at 28%) so that objects sit on the sweep without a visible floor.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px rgba(0,0,0,0.28)`; light theme `rgba(20,20,20,0.12)`): glass overlays, the evidence strip, the command pill, hovered library cells, and the overlay right panel.
- **Lifted** (`box-shadow: 0 18px 48px rgba(0,0,0,0.36)`): the open command panel.
- **Modal** (`box-shadow: 0 24px 60px rgba(0,0,0,0.45)`): dialogs, over a 50% charcoal scrim with a 2px blur.
- **Sheet** (`box-shadow: 0 -12px 32px rgba(0,0,0,0.3)`): the mobile bottom sheet.

### Named Rules
**The Ply Rule.** Only overlays floating on the viewport are translucent: toolbar, view chip, zoom, compare labels, measure chip and command bar, all glass at 72% with a 12px blur and a 10% white hairline. Panels, cards and dialogs are always opaque.

**The Cove-Side Ink Rule.** Overlays that print directly on the cove (the evidence strip, hover label, transient notes, dimension readout, cell labels) use fixed dark ink (`charcoal-0` at 62–86%) with near-white text in both themes, because the cove does not change with the theme.

**The Solo Ghost Rule.** Soloing or filtering by evidence turns every other part into a flat mid-grey ghost at 12% opacity without depth writes. Hidden and ghosted outliner rows drop to 45% opacity to match.

## Shapes

Corners are gently rounded and grow with the size of the container. Tags and kbd hints are 6px. Controls, rows and fields are 8px. Buttons, cards, segments and gate cards are 10px. Library cells and chat turns are 12px. The command bar, dialogs and the empty-library drop zone are 14px. The mobile sheet has 16px top corners. Status dots and the size dots in the outliner are circles. Evidence swatches and status marks are rounded squares (2–3px), small chips cut from the checker card. Pills (999px) are kept for filter chips, top-bar status pills and evidence badges. Chat turns square one corner to 4px on the speaker's side. Lines are always 1px. Dashed strokes (1.5–2px) appear only on drop targets and the caliper.

## Components

### Buttons
Matte and modest. They lift 1px on hover and never glow.
- **Shape:** gently rounded (10px), 32px minimum height, 6px × 12px padding, 8px icon gap.
- **Default:** a raised charcoal fill with a strong 1px line and ink text at 560 weight.
- **Primary:** paper fill with charcoal text and no border. Hover dims it with `brightness(0.94)`. In the light theme it inverts to charcoal on paper.
- **Quiet:** a transparent fill on the same frame. **Tall** (56px) stacks a label over an 11px caption, and is used for the export format choices.
- **Hover / Focus:** the border steps up to the hover grey and the button rises 1px (140ms, expo-out). Focus gets a 2px cyan outline at 2px offset. Disabled sits at 38% with desaturation and no lift.
- **Icon button:** 32px square with an 8px radius and transparent fill. Hover or on-state uses the raised fill and full ink.

### Segmented Controls and Tabs
- **Style:** a chrome track with a 1px line, 3px inset and 10px radius. Items are 12px/560 with a 7px radius.
- **State:** the on-segment is solid paper with charcoal text (the same voice as primary). Tabs use the raised fill with a 1px bottom shadow instead. On the viewport, segments sit on glass.

### Chips
- **Filter chips** (outliner): 24px pills with a transparent fill and 1px line, 11px/560, each ending in its mono count. On-state uses the raised fill and the strong line. Evidence chips lead with their checker swatch.
- **Scope chip:** a 7px-radius cyan wash with cyan ink, naming the parts the command bar will touch.
- **Op tags:** 5px-radius mono tags. `add` is green-tinted, `remove` red-tinted and `update` cyan-washed.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** chrome on a panel, with a 1px line. Notes, metric grids, checklists, gate cards, diffs and log entries all use this one recipe.
- **State:** a pass, warn or blocked card tints only its border (55–60% of the status hue mixed into the line). Blocked also takes a 10% red wash. Status words carry the hue mixed into ink, not raw.
- **Metric grids:** cells separated by 1px gaps over the line colour, 8×10px padding, with an 11px label over a 13px value.
- **Internal Padding:** 12px (14px for the measure readout).

### Inputs / Fields
- **Style:** 32px height, 8px radius, a strong 1px line on raised or chrome. Selects use a CSS chevron. The command textarea sits on `charcoal-chrome` (white in light) with a 10px radius.
- **Focus:** the border turns cyan. Elsewhere the global 2px cyan outline handles focus.
- **Disabled:** 40% opacity (60% on the textarea while a request is in flight).
- **Switch:** a 32×18 track that turns cyan when on, with a paper knob.

### Navigation
- **Top bar:** 48px chrome with a 1px bottom line. It carries the logo mark and the SCELIPH wordmark, a borderless breadcrumb select that gains a frame on hover, undo/redo icon buttons, the quality pill (a checker square, the score, and the blocked count in red-mixed ink), the local-processing pill (green dot with a 3px halo), language, theme and primary Export.
- **Rail:** 56px chrome column of 40px icon buttons with a 12px radius in `ink-3`. The on-state uses the raised fill with an inset strong line. Tooltips are paper pills that slide in 4px from the right. On mobile the rail becomes the bottom tab bar.

### Outliner
A virtualised list of 30px rows. Each row reads: a size dot (diameter scaled by part volume, in grey-mid, cyan-ink when selected), an evidence swatch, the name (ellipsised), an edited dot, and the mono primitive op. Hovering reveals a tool strip (solo, lock, hide) that fades in over a gradient. A tool that is on keeps the strip visible. Selected rows get the cyan wash and inset line. Scoped rows get an 8% cyan tint. While loading, the list shows shimmer skeleton bars.

### Library Cells
Numbered square cells with a 12px radius, filled with the cove gradient. The number badge sits top left and the seen tick top right, both as fixed-dark 62% chips. The name runs along a dark gradient at the foot. Results that have been opened show a rendered thumbnail. Results never opened show the empty cove, not a duplicated name. The active cell gets a 2px cyan ring with a 30% outer halo. Hover lifts the cell 2px with the float shadow. Hovering also reveals a compare toggle that turns cyan when on, and the compared cell keeps a 55% cyan ring. The empty library is a 14px dashed drop zone.

### Evidence Strip (Signature)
A color-checker card held in frame at the lower left of the cove: a fixed-dark 78% tray (12px radius, 5px padding, 3px gaps) of 72×44px patches with a 6px radius. Each patch shows its evidence name at 10.5px and its count at 14px bold, on its checker fill. Hover lifts a patch 2px. The active patch gets a 2px paper ring and the others dim to 35%. A zero-count patch mutes its fill (26% hue into charcoal) but keeps its text legible. A trailing hatch toggle shows a magenta diagonal swatch and a magenta border when on. It turns inferred hatching on and off over the model and keeps a visible label down to mobile.

### Command Bar
Collapsed, it is a 44px glass pill (14px radius) centred at the foot of the viewport: a cyan sparkle icon, an optional scope chip, the prompt in `ink-3`, and a `⌘K` kbd. Open, it rises 8px into a 16px-blur glass panel up to `min(520px, 62vh)` tall. The header holds a chat/edit segment, the model select, a connection dot and log/close icons. The thread runs below it, as paper-on-charcoal user turns and raised assistant turns. Proposed edits arrive as a diff card with a cyan-mixed border and op tags, waiting for approval. The composer has a 44px send button.

### Viewport Overlays
- **View chip:** a ViewCube-like glass tile with the current preset in an 11px mono label over a 2×2 grid of preset buttons. The current preset is paper-filled.
- **Axis glyph:** 1.5px cove-ink strokes with 9px mono axis letters and the unit.
- **Readout:** fixed-dark segmented `dl` of size, parts and triangles in mono.
- **States:** a loading spinner in cove ink. Errors show a red title on the cove.
- **Notes:** a fixed-dark pill that fades in, holds and fades out over 5s.

### Mesh Materials
- **Selection hull:** an inverted back-face hull in selection cyan, pushed out along normals in proportion to view distance so the outline stays a near-constant pixel width. It is paired with a cyan x-ray at 18% that shows through occluders.
- **Ghost:** flat grey-mid at 12%, with no depth writes.
- **Inferred hatch:** screen-space diagonal lines in checker magenta at 85% alpha, polygon-offset over the surface, so the hatch reads the same on any UV layout.

## Do's and Don'ts

### Do:
- **Do** judge every product result on the neutral radial cove (`cove-top` → `cove-mid` → `cove-foot`), with fog in `cove-mid` and only a shadow catcher on the floor.
- **Do** bind every hue to its checker meaning. Measured and pass are green, datasheet is purplish blue, estimated and warn are orange-yellow, inferred is magenta, undocumented is neutral 5, blocked is red.
- **Do** reserve cyan for selection, focus, scope, pending edits, switch-on and drop targets, using `select-ink` for cyan text.
- **Do** put dark ink (`checker-orange-ink`) on every orange-yellow fill.
- **Do** make only viewport overlays translucent (glass at 72%, 12px blur, 10% hairline) and keep panels, cards and dialogs opaque.
- **Do** state every list's total and right-align measures in mono tabular numerals.
- **Do** use lucide line icons at 13–16px for every control glyph.
- **Do** mute a zero-count patch's fill, never its text.
- **Do** keep state transitions at 140ms and panel moves at 200ms on `cubic-bezier(0.16, 1, 0.3, 1)`, and honour reduced motion.

### Don't:
- **Don't** tint the cove, add a visible floor plane, or replace the cove with a near-black void for product results. The night lighting of architectural shells is the one sanctioned exception.
- **Don't** use cyan for evidence or quality status, decoration or brand emphasis.
- **Don't** introduce any UI hue outside the checker set and cyan, including for charts, badges or hover states. The scene's warm key and cool edge light tints are lighting, not UI colour, and stay.
- **Don't** use solid status-colour panels. Status tints the border, a 10–22% wash, or ink-mixed text.
- **Don't** add letter-spacing or uppercase to labels. The wordmark is the only tracked text.
- **Don't** put white text on an orange-yellow fill.
- **Don't** make a side panel, card or dialog translucent.
- **Don't** use hard offset shadows. Every shadow is a soft, ambient, black-based blur.
- **Don't** show a duplicated title in place of a missing thumbnail. An empty cove is the honest placeholder.
