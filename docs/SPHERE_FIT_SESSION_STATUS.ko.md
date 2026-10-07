# Sceliph 구면 Fit 실패·stale 적용 차단 · 2026-10-07

## 계획과 현재 구현

ENGINE_NEXT_PLAN.ko.md에 현재 편집 안전성 완결→다음 회전체 엔진 슬라이스→LLM/IR 고정 예제 품질 평가를 기록하고 ACTIVE_GOAL.ko.md 상단을 현재 범위로 갱신했다. 예전 날짜/예산/실행 기록은 별도 역사 기록으로 보존했다. Goal 도구의 paused/objective를 수정 또는resume했다고 보고하지 않는다. 현재 Git HEAD/branch는 기존 경로의 메타데이터 누락 때문에 미확인이다.

기존 구면 Fit handler는 실패에도 sphereResult 문자열만 갱신했다. radius100같은 유효 범위의 draft 변경 후 목표0.005mm Fit이 실패하면 dirty는true, numeric/tile/gear 오류는false여서 Apply가 가능했다. 빈 numeric 입력은 기존 Apply 차단은 있었지만 예전 성공 문구가 남을 수 있었다. 성공한 Fit 후 radius/tolerance 변경도 새 면 검사 없이 Apply할 수 있었다. 이전 source/handler를 before 파일에 보존하고 정적 추적으로 원인을 확인했다.

sphere-fit-session.ts에 idle/failed/ready 세션 상태와 현재 기하 선언/허용 오차/불완전 입력을 기준으로 stale를 판정하는 함수를 추가했다. 실제 Fit 성공의 기하·measurement 복사본에만 ready를 부여한다. 실패는 Apply를 막고 reason을 alert로 표시한다. ready 이후 기하/tolerance/불완전 입력이 바뀌면 stale로 차단하며 성공한 재Fit 또는Cancel로 복구한다. 기존 Fit을 사용하지 않은 편집은idle로 하위 호환을 유지한다. Cancel은 pending 기하가 없더라도 Fit 세션이 있으면 활성화된다. Apply handler도 blocked 상태를 직접 확인한다.

이 receipt는 현재 primitive-local 구면 선언에 관한 세션 상태이며 암호학적 GLB/source binding이나 최종 품질 승인이 아니다. IR에 receipt/measurement/PASS를 저장하지 않는다. 새 browser session의 패널은idle로 시작하며 재Fit은 실제 geometry를 재측정한다. 같은 화면에서 동일 데이터 파일을 다시 로드하는 모든 경우의 세션 리셋까지 검증했다고 주장하지 않는다. 기존 원본 대응·UV·releaseAllowed 및 납품 실패 차단은 변경하지 않았다.

## 실행과 증거

신규3개 검사는 실제 fitSphereSurfaceBudget 결과를 사용해 성공/실패/기하 변경/tolerance 변경/불완전 입력/cancel/새 성공의 전이를 검증한다. 기존 editPart→serializeProject→parseProject를 실제 호출해 receipt가 IR에 저장되지 않고 새 세션에서 다시 측정해야 함을 확인했다. receipt는 measurement 복사본을 보유해 외부 원본 measurement 변경으로 성공 값이 뒤바뀌지 않는다. 최초 테스트는 새 module 부재로 실패했으며 해당 로그와 이전 UI handler를 보존했다. 이 로그 자체를 브라우저 결함 재현으로 취급하지 않는다.

현재 npm test149files/968tests PASS,101.37초. check/build/benchmark PASS. 디자인 detector는 빈 결과지만 시각 승인 증거가 아니다. 전체 quality:gate/quality:production exit1, 기존 전자 근거52/90·Blender acceptance 등의 납품 미충족 유지. 후속 dominance not-run. CPU-heavy 게이트는 전체 테스트 완료 후 실행했으며 timeout/임계값/skip 변경 없음.

실행 환경은/private/tmp/sceliph-refine-20261006,macOS arm64,Node24.13.1. 원본 체크아웃 소스/계획 문서 바이트를 확인한 뒤 좁은 변경만 반영한다. Documents/Raptor 원본은 수정하지 않는다. source SHA와 명령 결과는 outputs/sphere-fit-session-20261007/results.json에 있다. 외부 API/UNI_AI/Claude CLI 호출·새 의존성·push 없음.

이번 변경은 UI 상태/적용 차단이며 기하 생성 연산은 바뀌지 않았다. 신규 GLB 생성·Blender import/reexport는not-run이다. 이전 기하 증거를 현재 브라우저 성공으로 재사용하지 않는다. 실제 keyboard/click·파일 다운로드·새 브라우저 재열기는 정상 서버 환경 제약으로blocked/not-run이다. 따라서 코드의 상태 전이 검증과 사용자 흐름 전체 완료는 구분하며 전체 제품 production-ready로 선언하지 않는다.

## 재현과 다음 한 단계

```sh
cd /private/tmp/sceliph-refine-20261006
npx vitest run tests/sphere-fit-session.test.ts tests/sphere-surface-budget.test.ts tests/sphere-anisotropic-budget.test.ts tests/part-inspector-preflight.test.tsx
npm test
npm run check
npm run build
npm run benchmark
npm run quality:gate
npm run quality:production
```

정상 Sceliph 경로/localhost 서버가 확인되면 실패Fit→Apply 차단→radius/tolerance 복구→성공Fit→Apply/Cancel→JSON 저장·새 session 재열기를 실제 조작한다. 이 흐름을 마무리한 뒤 다음 회전체의 개별 면 오차 계약을 고정한다. 최근 모델링 성공을 다른 분야 전체에 일반화하지 않는다.
