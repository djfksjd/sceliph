# 회전체 원주 품질 예산 · 2026-10-07

## 범위와 계약

AssemblyIR lathe 기반 원주 분할만 대상으로 한다. 프로파일과 normalPolicy는 그대로 보존하며 기존 component patch / latheSegmentEditBlocker / 100000 triangle·512 segment 제한을 재사용한다. 자동 Fit은 primitive-local mm 기준이며 비균일 scale의 월드 오차, 프로파일 설계 정확도, CAD/BREP·제조 정확도는 보증하지 않는다.

이번 고정 예제 허용 원주 편차는 0.03mm다. 기존 small/default/large/solid 프로파일을 사용하고 입력 분할은 모두 명시적으로16으로 설정한 authored 비교 입력이다. 이전 benchmark 영수증을 이번 실행 성공으로 재사용하지 않는다. 자동 Fit은 기존 분할을 줄이지 않으며, 현재 오차가 이미 계약 안이면 그대로 반환한다. 부족한 경우 네 축 끝점을 보존하도록 현재 분할이4의 배수인 입력만 자동 정련한다. 그 외 입력은 기존 수동 segment edit을 사용해야 한다.

측정은 실제 position accessor의 프로파일 링을 모아 각 현의 가장 가까운 점과 끝점의 반경 편차를 계산한다. normal split에 따른 중복 정점은 제거하되 각 링의 기대 정점 수, 유한 좌표, authored 프로파일 대응을 검사한다. 위상·normal·UV 검사를 대체하지 않는다. 최대129개 profile points,300000 vertices,100000 triangles와 최대11회 측정으로 자원을 제한한다. 4의 배수 후보에서 실제 Float32 오차를 재검사하며 반올림 극한에서 전역 최소 비용을 주장하지 않는다.

## 구현

- src/engine/lathe-surface-budget.ts: 실제 링별 원주 편차 측정과 제한된 선언형 segments Fit.
- scripts/fit-lathe-surface.ts: 로컬 명시적 입력 → 기존 source validation/blocker/patch → 별도 sourceJSON → 재parse → GLB 재생성. 원본 파일은 수정하지 않고 기존 결과 디렉터리는 덮어쓰지 않는다.
- tests/lathe-surface-budget.test.ts:4프로파일의 분석식 sagitta와 실제 facet 비교, 치수 bounds·원본·비대상IR 보존, 재열기·no-op·불가능예산·손상링·비지원자동grid·mapping/frozen 거부.

## 주요 시도

1. 처음 native elements 검증기를 사용했으나 AssemblyIR normalPolicy와 axis-cap profile 계약 차이로3테스트 실패. 제품 validator를 바꾸지 않고 AssemblyIR validation 경로를 사용했다. 첫 wrapper의 필수detail 누락도 실제 validation 오류로 수정했다. 실패 로그 유지.
2. normal-split 중복 때문에 정점 하나의 손상이 숨겨지는 것을 테스트로 확인. 링 완성도에 더해 모든 정점이 authored profile에 대응해야 하는 검사를 추가했다. 기존 일부 fixture는 이미0.03mm를 만족하므로 비교 입력을 명시적16분할로 고정했고 원본 verified fixture는 변경하지 않았다.
3. 실제bounds 검사에서 small34분할이 Z 끝점을 잃는 실패를 재현. 4의 배수 후보로 변경하여 cardinal bounds를 보존했다. pre-fix GLB는 당시 진단 자료이며 최종 승인 자료가 아니다.

## 실행과 증거

현재 수정 사본: /private/tmp/sceliph-refine-20261006. 정상 Git branch/HEAD 확인은 blocked, push 없음. UNI_AI/Claude/외부 생성모델/새 의존성 사용 없음. 출력과 로그는 outputs/lathe-budget-20261007에 보존한다.

재현: npx vite-node scripts/fit-lathe-surface.ts outputs/lathe-budget-20261007/default.input.json bushing .03 <새 출력 디렉터리>

sourceJSON.json은 AssemblyIR이며 기존 LOAD IR 입력 대상이다. 이 단계에서는 새로운 브라우저 도구를 노출하지 않는다. 실제 브라우저 클릭·저장·재열기는 blocked/not-run이며 CLI 성공을 사용자 흐름 완료로 보고하지 않는다. Blender first import/reexport/neutral render는 이번 단계 not-run이며 이전 crash/normal drift가 해결됐다고 주장하지 않는다. 전체 delivery/production-ready도 완료가 아니다.

최종 실행 상태와 각 파일 SHA는 outputs/lathe-budget-20261007/execution.json 및 manifest.json에 연결한다.

## 이번 실행 결과

| 입력 | 분할 전→후 | 최대 원주 편차 mm 전→후 | 대상 삼각형 전→후 |
|---|---|---|---|
| small |16→36|0.134503→0.026637|128→288|
| default |16→48|0.269006→0.029975|128→384|
| large |16→68|0.538012→0.029877|128→544|
| solid |16→48|0.269006→0.029975|64→192|

final-* 디렉터리만 최종 파일 증거다.4사례+명시적no-op+segments생략 기본64 사례에서18개 실제GLB의 Khronos errors/warnings0, 독립WebIO accessor 재측정, targetbounds·비대상position/normal/UV/index/material/계층/transform 보존, after/reopened 전체 바이트 일치를 확인했다. default no-op의 sourceJSON 및GLB는 이전after와 바이트가 같다. segments생략 입력은 기본64를 새 파라미터로 강제 기록하지 않고 보존한다.

- targeted:2파일7테스트PASS.
- 첫 전체 실행:149파일/970테스트PASS, 기존 implicit-section-shape 1테스트5000ms timeout FAIL. 실패로그보존. 이후 같은 시간제한의 단독8테스트PASS, 최종전체150파일971테스트PASS(127.70s). 타이밍 민감성을 관측했으며 CPU경합 원인을 확정했다고 주장하지 않는다. 제한·skip·assertion은 변경하지 않았다.
- npm run check / npm run build / npm run benchmark:exit0.
- npm run quality:gate / npm run quality:production:exit1. 기존 competitive electronics-production-evidence / electronics-evidence52/90 실패가 현재도 동일하다. Unity current-revision report not-run 등 미검증이 남아 있다. 의도된 regressed dimension fixture의 pass:false는 실패를 잘 차단하는 음성 대조군이므로 엔진 회귀로 분류하지 않는다. production chain이 실패하여 dominance는 실행되지 않았다.
- 실제 브라우저 UI·download·재열기, 중립렌더·Blender first import/reexport:이번 실행blocked/not-run. 이전성공 영수증을 새 UI증거로 사용하지 않았다.

구현은 좁은 엔진/명시적CLI 경로까지 확인되었으며 전체 사용자 흐름·플랫폼 납품은 INCOMPLETE. 다음 한 작업은 정상Sceliph 작업경로와 localhost환경에서 기존편집·저장·재열기 흐름을 실제 조작 검증하는 것이다.
