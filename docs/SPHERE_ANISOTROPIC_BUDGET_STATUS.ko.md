# Sceliph 높은 세로 분할 구체의 과분할 해소 · 2026-10-07

## 구현과 고정 계약

castor · DEBUG→GATE, T2 행동 변경. 대상은 sphere-surface-budget.ts와 신규 회귀 검사이며 UI·컴파일러 기본값·IR schema는 변경하지 않는다.

기존 선택기는 가로W/세로W÷2 균형 후보를 사용하고 세로 분할 보존을 위해 기존 세로 수보다 작은 후보를 제외했다. 허용된 세로80/96/128 입력은 모든 균형 후보가 제외돼 거의 가로128 경로만 남았다. 지정 오차보다 훨씬 촘촘한 결과를 만들며 파일/기하 비용이 커지는 경로를 재현했다.

새 선택기는 기존 세로가64보다 높을 때 그 값을 고정해 가로를 먼저 탐색한다. 필요하면 가로128에서 세로를 추가 증가시킨다. 기존 세로64이하 입력의 후보 순서는 그대로다. 어느 축도 이미 선언된 분할보다 줄이지 않으며, 이미 목표를 만족한 기존 고분할 source는 그대로 반환한다. 기본 작은·기본·큰 베어링의 기존64×32/80×40/112×56 결과를 유지한다.

기준은 구현 전 테스트에 고정한0.005mm, native sphere radius3mm, primitive-local mm, 32512삼각형/최대63후보다. 신규 세로80/96/128 사례에서2만삼각형 미만이면서 실제 면 편차0.005mm 이하, authored 세로 보존, 반복/no-op 및 실패 원본 보존을 요구했다. 분할 수가 적다는 사실만으로 PASS하지 않는다. 실제 면을 측정해 목표를 만족해야 한다. 기존 실패 검사·UV5%·GLB 전체 바이트 계약은 변경하지 않았다.

## 실제 전후

아래 before는 같은 저가로/고세로 입력에 기존 분할기를 적용한 결과, after는 새 선택기 결과다. 면 오차 자체는 기존 과분할 결과보다 커지므로 기하 정확도가 더 높아졌다고 주장하지 않는다. 요구 정확도를 유지하며 기하 비용을 줄이는 최적화다. 이미 저장된 before 고분할 파일을 새 Fit으로 다시 처리하면 no-op이며 임의 다운샘플하지 않는다.

| authored 세로 | 이전 삼각형 | 새 삼각형 | 이전 면 오차mm | 새 면 오차mm |
|---:|---:|---:|---:|---:|
| 80 | 20224 | 9480 | 0.00148140 | 0.00468734 |
| 96 | 24320 | 11400 | 0.00130487 | 0.00451140 |
| 128 | 32512 | 14224 | 0.00112934 | 0.00494446 |

세로128에서 GLB757720→350784bytes. 가로16 입력을 새로 Fit할 때의 최적화이며, 기존 파일의 상세도를 자동 변경하지 않는다. 생성 geometry 비용/파일 크기 감소와 첫 Fit 검색 시간은 구분한다. 단일 진단 호출(구→신, 통계/워밍업 벤치마크 아님)은 세로128에서 약2.74→7.36ms였다. 첫 검색은 더 느릴 수 있어 프레임률/컴파일 속도 향상을 주장하지 않는다. 모든 임시 BufferGeometry는 기존 finally/dispose 경로로 반환한다. 리스너·네트워크·캐시를 새로 추가하지 않았다.

## 실행과 실패 기록

기존 선택기에서 신규 테스트는 실패(128가로가128보다 작아야 한다는 고정 조건 불만족), 수정 후 관련5개 검사 PASS. 최초 전체 검사는964통과/1실패: 변경하지 않은 implicit-section-shape의 반복 편집 테스트가5000ms 제한을 넘어5643ms를 기록했다. 실패 로그를 보존했다. 테스트의 실행 경로에 새 구체 선택기가 없음을 확인하고 다른 무거운 작업을 종료한 뒤 같은5초 제한의 단독8개 검사 PASS, 해당 테스트3866ms. CPU 경합 가능성은 추정이며 확정 원인으로 주장하지 않는다. 마지막 전체 검사는 다른 owned heavy checks 없이 실행해148files/965tests PASS,104.17초. 결과를 results.json에 기록했다. 테스트/timeout 수정·skip 없음.

현재 check/build/benchmark PASS. 현재 quality:gate/quality:production exit1, 기존 전자 근거52/90·Blender acceptance 등 납품 미충족을 유지한다. 후속 dominance not-run. 코드/파일 검사는 로컬 실행이며 UNI_AI·Claude CLI·유료 모델 API 호출 없음. 기존 외부 앱 영수증을 현재 앱 실행 성공으로 사용하지 않는다.

현재 코드로 source JSON3개, 기존/수정/재열기 GLB9개를 새로 생성했고 수정·재열기는 전체 바이트 일치했다. Khronos9개 오류0·경고0, 독립 WebIO 실제 accessor 재열기 및0.005mm 면 편차 검사 PASS. 새 target3개 topology PASS. 수정하지 않은 기하/재질/계층은 기존 editPart로 처리하며 이전 구체 편집 보존 회귀 검사도 실행했다. SHA는 files/manifest.json에 있다.

## 환경·범위와 다음 단계

실행은 /private/tmp/sceliph-refine-20261006, macOS arm64,Node24.13.1. 정상 git status/HEAD는 기존 작업 폴더의 Git 정보 누락으로blocked, 과거 HEAD를 현재 상태로 보고하지 않는다. 원본 바이트를 확인한 뒤 기존 작업 경로에 해당 소스·테스트만 반영하고 Documents/Raptor 원본은 수정하지 않는다. source hashes와 현재 로그를 보존한다. push없음.

브라우저 조작/시각/다운로드 흐름은 기존 로컬 서버 제약으로blocked/not-run. Blender import·재export·렌더는이번 단계not-run, 앞선 Blender crash를 새 성공으로 대체하지 않는다. 기존 legacy ARM/x64 기어 차이, 일반 Blender normal drift 및 전체 production 실패는 별도 미해결이다. schema/새도메인/사진복원 지원 확대 없음.

요구 정확도 안의 자원 효율 개선에 대한 코드·파일 검증과 전체 제품 납품은 구분한다. 다음은 정상 로컬 실행 환경에서 Fit→Apply/Cancel→source 저장/재열기를 실제 조작해 검증하는 것이다.

```sh
cd /private/tmp/sceliph-refine-20261006
npx vitest run tests/sphere-anisotropic-budget.test.ts tests/sphere-surface-budget.test.ts
npm test
npm run check
npm run build
npm run benchmark
npm run gltf:validate -- outputs/sphere-anisotropic-budget-20261007/files/*.glb
node outputs/sphere-anisotropic-budget-20261007/verify-delivery.mjs
```
