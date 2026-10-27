# ABO catalog-photo evaluation (8차, 2026-10-27)

Photo → AssemblyIR on a pre-registered holdout of Amazon Berkeley Objects items.

- `selection.json`: metadata-only selection (rules, seed 20261027, file hashes), made before any image was viewed (`scripts/abo-holdout-select.ts`).
- `plan-review/`: the plan draft and the two adversarial reviews that reshaped it.
- `protocol-dev-{prim,full}.json`: development protocols (10 dev items, both vocabularies, haiku and sonnet → `dev-*`).
- `protocol-test.json` (sha256 `291418d9…`): frozen test protocol with the pre-registration block (items, replacements, criteria, harness and analysis hashes) → `test-sonnet/` (primary) and `test-haiku/`.
- `protocol-explore-strip.json`: exploratory, post hoc — dimension strings removed from product names, fit skipped → `explore-strip-sonnet/`.
- `test-*/novel-views.png`: aligned silhouettes from the scoring cameras (grey overlap, orange reference only, blue candidate only), with the input photo.

Photos are ABO turntable catalog photographs (background removed, cropped, no EXIF); the ground truth is the artist-authored GLB. Silhouette and surface metrics cannot see texture or concavities hidden from every outside view.

Attribution: data, images and 3D models © Amazon.com; ABO dataset by M. Guillaumin, T. Dideriksen, K. Deng, H. Arora, J. Collins and J. Malik; licensed CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/). The thumbnails in `novel-views.png` are downscaled ABO photos.
