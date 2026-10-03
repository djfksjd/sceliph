# Absolute lathe profile UI editing 2026-10-04
Base c76a062, compiler0.40; 30min/two diagnosed attempts/artifacts100MiB/API0.
Reuse existing lathe-profile-deltas patch, no IR/schema/geometry kernel changes.
Explicit raw scalar PBR only, no frozen fidelity/visualPlan, projected/procedural finish.
Edit existing point radius and local axial height in mm; no new/deleted points or bevel operation.
Coincident first/last closed-profile endpoints remain paired; axis-capped endpoints must still generate a closed solid.
Finite radius0..100000 and height±100000, at most128 UI points,10000 estimated target triangles.
Validate generated target closed/manifold/zero degenerate/self-intersection and complete existing topology analysis before commit. No thresholds weakened.
Target UV/normal/position changes intentional; non-target accessor/material/hierarchy preserved.
UI apply/cancel/undo/redo/save/reopen/additional edit and invalid profile rejection required. Valid profile operation never silently approximates geometric intent.
