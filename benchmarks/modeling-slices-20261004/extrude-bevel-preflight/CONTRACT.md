# Extrude bevel preflight 2026-10-04
Base 4184780591d0edee30763a60a5a39f5fd0d8abda; compiler0.40.
Budget20min, at most2 diagnosed attempts, artifacts100MiB, API0.
Reject declared noninteger/non-number bevelSegments before geometry allocation.
Keep omitted default3, integer1..512, existing runtime legacy0 with bevel OFF; active0 remains blocked.
Existing JSON schema integer1..512 unchanged; legacy inactive0 runtime compatibility is not newly claimed schema-valid.
No geometry/UV/normal/PBR/kernel change. Actual valid before/after buffer hashes must match.
Tests, check, benchmark, build and current quality gates; browser invalid import must preserve valid source.
DCC/render repeated comparison unnecessary if whole actual GLB bytes are unchanged; new DCC execution explicitly not-run.
Do not expand this phase to all subdivision parameters, or weaken gate thresholds.
