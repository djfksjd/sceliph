# Explicit analytic profile-surface normals
Baseline eb402fa4; do not auto-rewrite existing normal policies or lower crease threshold.
Budget30min/two diagnosed attempts/artifacts100MiB/API0.
New opt-in morphloom.lathe-normals/0.2 weighting=profile-surfaces, no ignored crease parameter.
Preserve original0.1 corner-angle and undeclared normal bytes. Explicit migration/clear and strict unknown-version/key rejection.
Assign surface-of-revolution normal (-dy*cos(theta),dr,-dy*sin(theta))/hypot(dr,dy) per existing profile band and triangle. Preserve sharp profile edges and smooth circular direction independently. Axis normals require a documented deterministic per-triangle limit.
POSITION/UV/index/triangles/bounds/non-target attributes/PBR/hierarchy stay exact; only selected normals change.
Existing fixed planar angular tolerance0.01degree reused from prior cap-shading contract. Include oblique angles165.96/135/116.57, hollow/axis solids and sizes; no new manufacturing accuracy claim.
Version/schema/UI/explicit migration, save/reopen/undo/redo, full regression and actual GLB/native/render validation needed before push. Old receipts cannot validate a new compiler revision; never promote missing evidence.
