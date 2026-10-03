# Compiler 0.41 실제 납품 증거 갱신

기준 HEAD eb402fa4의 미커밋 회전체 단면 법선 개선에 대해 현재 compiler0.41로 실제 증거를 재생성했다. 예산30분/1GiB, API0회. 이전0.40 영수증은 previous-*로 보존한다. native artifact는 약608MiB이며 큰 파일은 로컬에 보존한다.

- 5분야 actual GLB 각2회 전체 SHA 일치, Khronos+독립 읽기 PASS.
- Blender5.2.1LTS import/export/reimport 5/5 의미 보존 PASS, 별도 부품 편집/재열기5/5 실행 PASS. architecture/cooling raw 재export의 tangent 오류는 기존 repair 경로를 실행하고 최종 bytes를 재검증했다. raw 파일 PASS 또는 전체 normal 바이트 보존으로 보고하지 않는다.
- Godot4.7.2 native PackedScene 5/5 PASS. PrusaSlicer2.9.6 native manifold 및 toolpath PASS. 기존 650×500mm 가상 베드 계약이며 실프린터 제조 승인이 아니다.
- 실제 browser OBJ/STL/PLY/USDZ/ZIP 다운로드 후 Blender3정적 형식 및 Apple usdchecker PASS. staticDelivery와 Prusa/Godot/bound 단일 Blender proof가 competitive에서 수락된다.
- bound 단일 proof는 현재 IR fingerprint, sourceSHA a7ea7dc3300d8d261b50e925ce586ffb4c2580981bc05b98b91900f0c329cca2, rawSHA cd6395a371fb192f684b22835b55dd07696ac25f54eeeff6fb4e81ba63822c77, finalSHA c9338a90672d2261b549e74c4167dcd6d3f0b09b6e617cf9040fa02b8df8782e와 실제 이번 실행에 연결된다. 이전과 같은 SHA라도 이번 실제 실행 로그를 별도로 보존한다.
- 현재 quality required rates 모두1, release browser4/4 PASS. quality:production exit1: cooling 최종 GLB infos23 때문에 strict Blender cross-domain/edit benchmarkAccepted=false. 나머지4사례 infos0. 이전 실패가 유지된 것으로 UV 삭제/무의미한 텍스처/임계값 변경은 없다. dominance not-run.

첫 pin loop는 잘못된 prusaslicer-print-latest.json 파일명에서 멈췄다. 실제 reader의 prusaslicer-latest.json으로 나머지 영수증을 연결했고, 중간 mixed-receipt gate와 최종 전부 현재인 production 결과를 구분했다. 제품 계약은 바꾸지 않았다.

회전체 0.2 자체 7사례 native normal 검사는 별도 LATHE_PROFILE_SURFACE_NORMALS_STATUS를 따른다. 비대상 sphere 첫 import normal drift0.02968046°는 미해결이다. Unity/Unreal·전문가 평가·제조 승인은 not-run. 플랫폼 전체 production-ready가 아니다. Goal은 active다.

실제 실행/해시/환경: `outputs/current-delivery-041-20261004`, 공개 작은 보고서와 manifest: `benchmarks/modeling-slices-20261004/current-delivery-041`. 원본 체크아웃의 충돌 보고서는 덮어쓰지 않는다.
