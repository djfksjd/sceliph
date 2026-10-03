# Extrude 베벨 분할 사전 검증 — 2026-10-04

기준 HEAD4184780591d0edee30763a60a5a39f5fd0d8abda, compiler0.40.0.
범위는 잘못된 bevelSegments의 조기 거부다. 실제 곡면 품질 개선 또는 새 베벨 기능을 구현한 것으로 표현하지 않는다.

## 원인과 수정

기존 재귀 검증은 숫자인 경우 범위만 확인했다. 따라서3.5는 정수 검사를 통과했고, null·문자열은 숫자 분기를 우회했다. Three.js는 이 값으로도 이번 진단 입력에서 manifold 메시를 생성했다. 손상 파일이 항상 생성됐다고 주장하지 않는다. 문제는 선언형 IR의 정수 계약을 만족하지 않는 값이 받아들여졌다는 것이다.

extrude 분기에서 선언된 값은 integer0..512인지 검사한다. 기본 생략3, integer1..512 및 베벨 비활성일 때 legacy0을 유지한다. active0 거부는 기존 검사 그대로다. schemas/assembly-ir.schema.json은 integer1..512이고 이번에는 변경하지 않았다. 비활성 legacy0은 기존 runtime 호환 예외이며 스키마 유효 입력으로 새로 승격하지 않는다. 원본 IR·patch 계약·기하 커널·engine version은 그대로다.

## 증거

새3개 테스트 중2개가 수정 전 실패했다. 수정 후 malformed active/inactive·범위·원본 무변경 검사가 통과했다.
기본값/1/3/32/legacy-off0 다섯 actual GLB의 전체 SHA 및 POSITION/NORMAL/UV/index 등 actual geometry buffers가 전후 동일하며 Khronos와 independent WebIO 재열기를 통과했다.

실제 브라우저: 정상 IR→invalid3.5 IR 가져오기→오류 표시→SAVE IR/GLB. 저장 IR 구조 exact, 전체 GLB bytes exact. 다운로드 후에는 오류 문구 대신 export 완료 메시지가 표시되어 초기 screenshot은 오류 근거가 아니다. 재업로드 후 error-visible screenshot과 정확한 오류 텍스트를 별도 보존했다.

새 Blender/native render 실행은 not-run이다. 실제 전체 GLB bytes가 동일하므로 이번 사전 검증 변경에 DCC 재실행을 필요로 하지 않았다. 과거 실행을 현재 실행으로 재표기하지 않는다.

실행환경 macOS AppleM5, Node24.13.1, Python3.9.6. IR mm/generated mesh m. API0. 선작성20분/진단2회/증거100MiB 계약은 증거 폴더CONTRACT.md에 있다.

증거: benchmarks/modeling-slices-20261004/extrude-bevel-preflight. manifest.json에 현재 실제 파일 SHA. 재현: npm test -- --run tests/extrude-bevel-segment-validation.test.ts; npm run check; npm run benchmark; npm run build. audit.ts/valid.ts는 실제 실행 위치 work/extrude-segment-audit를 전제로 하는 실행 원본이므로 다른 위치의 import/output 경로 조정이 필요하다.

전체 quality:gate/quality:production은 exit1이며 기존 cooling infos23·cross-domain benchmark 차단이 유지된다. dominance는 upstream 실패로 not-run. 전체 production-ready가 아니다.

현재 수정본 npm test115files/821tests PASS, check/benchmark/build PASS. source diff whitespace 검사PASS. 원본 로그 끝 빈 줄은 재작성하지 않고 보존한다.
