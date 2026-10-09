# 명시적 단면 지점 피팅 — 2026-10-05

LLM/사용자가 component ID와 primitive ID, primitive-local mm 지점2..16개를 선언하면 고정 반축·고정 radialPower에서 axialPower 하나를 계산한다. 외부 모델/API/의존성은 추가하지 않았다. 독립 타원체만 지원하며 합성 형상·사진/월드 좌표·미지 단위는 거부한다. designed/measured/estimated는 입력 선언이며 독립 측정 인증이 아니다. 기존 부품 evidence는 자동 승격하지 않는다. 피팅 출처와 수치 잔차는 별도 receipt에 남기고 저장 IR에는 기존 sectionShape를 반영한다.

u=(|x/rx|^p+|y/ry|^p)^(1/p), v=|z/rz|에 대해 u^q+v^q=1을1.5..4 범위에서48회 이분법으로 푼다. 지점별 지수 차이≤0.02 및 각 지점 잔차≤0.002를 고정했다. 평균으로 실패를 숨기지 않는다. u0.1..0.95, v0.1..0.9이며 서로 다른 단면 차이≥0.1rz가 필요하다. q를1e-8로 반올림하여 절대 편집/재열기에서 누적하지 않는다. 정확한 Euclidean SDF/CAD 또는 물리 정확도 보장이 아니다. 측정 불확실도 전파는 지원하지 않는다.

recipe0.4와 fit schema0.1을 추가했다. 기존 recipe0.1..0.3는 유지하고 fit 연산을 거부한다. AssemblyIR0.1은 기존 versioned sectionShape로 저장하며 별도 IR 마이그레이션이 필요 없다. unknown version/frame/units/fields/범위 및 모순 지점은 원자적으로 실패한다. 기존 fingerprint·raw PBR·frozen contract·폐쇄 topology·shell·contact·예산 제한을 재사용한다. 기존 UV5% 기준은 변경하지 않았다.

사용: OPEN RESULT → 독립 타원체 IR → Primary form recipe → Prepare section fit recipe → 목표 pointsMm/evidence 수정 → Apply primary recipe → SAVE IR. Template는 현재 형상에서 만든 창작 예시이며 독립 실측 자료가 아니다. 새 세션에서 OPEN RESULT → GLB 재생성 후 추가 편집이 가능하다. 기존 intent/readiness/history 경로를 재사용했다.

## 주요 시도와 판단

1. 기존 camera/capture-pose fit은 자세 잔차이므로 단면 계산에 재사용할 수 없었다. 새 테스트는 처음 모듈 부재로 실패했다. 기존 유효 입력 회귀가 아닌 기능 부재다.
2. 첫 fixture3개는 z/rz0.3에서 u≈0.99로 제한0.95를 넘어 실패했다. 제한을 낮추지 않고 유효한 단면0.75/0.88로 수정했다.
3. 새 세션 GLB/CLI 전체 바이트 비교가 실패했다. BIN은 같고 JSON extras의 납품 준비 기록/stable node ID만 달랐다. CLI 증거 exporter가 기존 preparePortableGltfGeometry를 빠뜨린 원인이었다. 실패 파일/렌더/진단은 unprepared-cli-attempt에 보존했다. 같은 준비 함수 적용 후 전체 GLB가 byte-exact로 일치했다. 오차 비교로 성공 판정을 바꾸지 않았다.

## 현재 검증

| 명령 | 결과 |
|---|---|
| npm test |137파일/916테스트, exit0|
| npm run check / benchmark / build |각 exit0|
| quality:gate / quality:production |각 exit1|
| Khronos + 독립 WebIO 읽기 |실제3파일, error0/warning0|
| Blender5.2.1LTS 첫 import/중립 렌더 |실행 성공|
| Blender reexport/normal drift 재검증 |not-run|

quality는 로컬 실행이며 외부 호출/비용이 없다. 전자 조립 evidence52/90, 기존 Blender benchmarkAccepted=false 등 전체 증거 부족이 남았다. 의도된 regressed fixture의 실패는 차단 검사가 작동한 결과다. production dominance는 앞 게이트 실패로 not-run. 기존 cross-domain 보고서를 현재 DCC 재실행으로 주장하지 않는다.

.5/1/3배 fixture에서 실제 mesh section·JSON 재열기 position/normal/UV/index 배열·반복 생성·변경 없는 적용·연속 목표 변경을 검사했다. 실제20/14/30mm authored pod의 z22.5/26.4mm 단면 x 오차는0.114950/0.108418mm다. 결과 전에 고정한32-grid 한 셀50/32=1.5625mm tolerance이며 다른 사례의 정확도 보장은 아니다. 크기별 tolerance는 비례한다. 제품은 속이 찬 창작 mass이며 hollow housing/제조 모델이 아니다.

실제 브라우저에서 잘못된 단위 거부, 피팅 적용·저장, 새 세션 IR 업로드·GLB 다운로드, 전체 GLB byte-exact, 추가q2.5 편집·저장 및 Undo/Redo를 확인했다. 이번 단계에서 delayed read/unmount race를 브라우저로 새로 주입한 검증은 not-run이며 기존 회귀 테스트는 통과했다. 동일1024² iso/clay before/after 렌더를 확인했다. 인간 전문가 검수는 not-run.

## 증거와 재현

코드: src/engine/ellipsoid-section-fit.ts, src/engine/assembly-primary-recipe.ts, src/AssemblyPrimaryRecipePanel.tsx. 테스트: tests/ellipsoid-section-fit.test.ts. 스키마: schemas/assembly-primary-recipe-v4.schema.json.

증거: outputs/section-fit-20261005/manifest.json에 현재 코드·입출력 SHA/환경/실행 결과. browser-actions.json, browser-reopen-actions.json, browser-history.json은 실제 조작 기록이다. 현재main HEAD3d26188, 미커밋/미push. 기존 사용자 변경을 보존했다. 플랫폼 Goal 도구는paused이며 resume/본문 수정API를 사용했다고 보고하지 않는다.

재현: npx vitest run tests/ellipsoid-section-fit.test.ts; npx vite-node outputs/section-fit-20261005/product-case.ts; npx vite-node outputs/section-fit-20261005/measure.ts; npm run gltf:validate -- outputs/section-fit-20261005/product-after.glb.

이번 제한된 피팅 기능 경로는 구현·검증했다. 전체 플랫폼 납품 완료가 아니다. 다음 한 작업은 contour에서 생성 메시로 옮길 때 해상도 선택에 측정 가능한 오차 예산을 연결하는 것이다.
