# 단면 메시 오차 예산 — 2026-10-05

## 구현한 경로

앞 단계는 계산식으로 axialPower를 맞췄지만 실제 Surface Nets 메시가 목표 단면을 얼마나 벗어나는지는 적용 조건에 포함하지 않았다. 새 `ellipsoid-section-fit-budget` 연산은 각 선언 지점에서 실제 메시 ray 교차의 반지름 오차를 mm로 검사하고, 최대4개 결정론적 해상도 후보 중 처음 통과하는 것을 선택한다. 실패 시 원본과 사용자 history를 변경하지 않는다. 평균으로 실패 지점을 가리지 않는다.

recipe0.5와 `sceliph.section-mesh-budget/0.1` 계약을 추가했다. toleranceMm는 사용자 요청 값0.0001..10mm, maximumResolution은8..48이다. 현재 해상도를 낮추지 않으며 후보는 현재값부터 최대값까지 균등한4지점의 정수값(중복 제거)이다. 모든 중간 해상도를 탐색하거나 오차가 단조 감소한다고 가정하지 않는다. 기존 triangleBudget은 늘리지 않는다. 내부 topology/winding refinement에도 같은 ceiling을 전달한다. 기본 polygonize 호출은 기존64 ceiling과 배열을 그대로 유지한다.

반축/radialPower가 알려진 독립 타원체와 primitive-local mm 지점만 지원한다. primitive의 평행이동/회전/스케일 및 component scaling은 이 좁은 경로에서 거부한다. component 위치/회전은 기존 로컬 표현을 유지한다. 전체 표면·실루엣·normal 오차, 임의 합성 형상, CAD/BREP/제조 공차 검증은 지원하지 않는다. projected/procedural texture, frozen 계약 등 기존 edit blocker도 그대로다. 기존 폐쇄 topology·shell·contact·fingerprint와 UV5% 기준을 유지했다.

한 recipe에서 budgeted component에 다른 연산을 섞는 것은 거부한다. 검사 후 반축/shape 변경으로 오래된 결과를 최종 결과의 증거로 사용하는 것을 막기 위해서다. 저장 IR에는 sectionShape와 실제 선택된 해상도가 남는다. 오차 계약/피팅 출처의 영구 저장은 이번에 추가하지 않았으며 receipt는 해당 입력/출력 fingerprint에 대한 시점별 증거다. 이후 형상 편집은 budget 검사를 다시 적용해야 한다. releaseAllowed의 의미나 전체 delivery gate를 바꾸지 않았다.

UI의 Primary form recipe → Prepare section mesh budget recipe에서 toleranceMm/maximumResolution/목표 pointsMm를 명시하고 Apply → SAVE IR → 새 세션 OPEN RESULT → GLB로 재생성한다. template 좌표는 현재 형상에서 만든 창작 예시이며 독립 측정 자료가 아니다. 이번 단계의 JSON 편집 흐름은 기존 패널을 재사용하며 별도 일반 DCC를 만들지 않았다.

## 고정 fixture 결과

반축20/14/30mm, radialPower2, 목표 axialPower3, z22.5/26.4mm, 요청 tolerance0.15mm를 실행 전에 정했다.

| 해상도 | 삼각형 | 지점1 오차mm | 지점2 오차mm | 판정 |
|---:|---:|---:|---:|---|
|16|1580|0.332812|0.400405|실패|
|27|4576|0.114342|0.151387|실패: 지점2 초과|
|37|8704|0.053153|0.079370|통과|

27의 평균 오차는0.15mm보다 작지만 개별 실패로 차단한다. 낮은 해상도 q3 메시와 선택된37 q3 메시를 동일1024² iso/clay 카메라·조명에서 비교했다. 반축/윤곽 식은 같고 해상도만 다르다. 원본q2 IR/GLB도 별도로 보존했다. 이 두 단면의 통과를 전체 형상 정확도나 실측 복원 성공으로 주장하지 않는다.

## 주요 시도

1. 신규 기능 테스트가 모듈 부재로 실패했다(repro.log). 기존 원본 입력 회귀가 아닌 실제 메시 오차 계약 경로의 부재다.
2. 최초 타입 검사에서 component.transform 사용이 잘못됐음을 발견했다. 실제 AssemblyComponentIR의 scale 필드로 수정했다. 테스트 fixture는 독립 선언으로 만들어 ignored outputs 폴더에 의존하지 않는다.
3. 제한된 후보 탐색과 실제 ray 교차 오차 검사 추가. 이후 내부 refinement ceiling과 budget 이후 변경 거부를 추가하여 자원 상한/검사 소유권을 보강했다. 임계값이나 기존 테스트를 낮추지 않았다.

## 현재 검증

138파일/923테스트 PASS. npm run check/benchmark/build 각각 exit0. quality:gate/quality:production 각각 exit1. 기존 electronics evidence52/90, Blender benchmarkAccepted=false 등 플랫폼 증거 부족은 남아 있다. 이번 기능 결함이나 새 회귀로 표시하지 않는다. production dominance는 앞 게이트 실패로 not-run. 게이트는 로컬 실행이며 UNI_AI/Claude/외부 모델/새 비용 호출이 없다.

.5/1/3배에서 동작하며 tolerance도 해당 크기에 비례한 fixture다. 비대상 부품 IR과 실제 position/normal/UV/index 배열 보존, 반복 생성, JSON 재열기, 변경 없는 재적용을 검사했다. 이전 recipe0.1..0.4는 유지하고 새 budget 연산을 거부한다. 잘못된 budget/version/transform, 달성할 수 없는 예산, 같은 부품의 후속 연산은 원자적으로 거부한다.

실제 브라우저에서 최대 해상도16 요청 실패 후 저장 IR이 원본과 같음을 확인했다. 정상 적용 후 SAVE IR, 새 세션 재열기와 GLB 다운로드는 CLI prepared exporter와 전체 byte-exact다. 같은 지점 재적용 시 IR도 같고, 추가q2.5 피팅·저장·Undo/Redo도 확인했다. 추가 편집은 해상도37에서 최대 오차0.090292mm였다. 별도 CLI가 브라우저 추가 수정 IR과 정확히 일치함을 확인했다. 이번 단계에 파일 읽기 지연/unmount를 새로 주입한 브라우저 검수는 not-run이며 기존 intent/source 회귀 테스트는 통과했다.

Khronos 실제 low/after/browser GLB error0/warning0, 독립 glTF Transform WebIO 재열기 통과. Blender5.2.1LTS 첫 import와 before/after neutral render 실행. Blender reexport와 기존 normal drift 재검증, 인간 전문가 검수는 not-run이다. 원래 제품이 속이 찬 창작 mass이므로 hollow housing/제조용 설계로 보고하지 않는다.

## 재현과 상태

코드: src/engine/ellipsoid-section-budget.ts, assembly-primary-recipe.ts, implicit-surface.ts, src/AssemblyPrimaryRecipePanel.tsx. 테스트: tests/ellipsoid-section-budget.test.ts. 스키마: schemas/assembly-primary-recipe-v5.schema.json. 실제 입력/출력 SHA·현재 코드 SHA·환경·명령 결과는 outputs/section-budget-20261005/manifest.json에 기록한다.

재현: npx vitest run tests/ellipsoid-section-budget.test.ts; npx vite-node outputs/section-budget-20261005/product-case.ts; npx vite-node outputs/section-budget-20261005/second-check.ts; npm run gltf:validate -- outputs/section-budget-20261005/product-after.glb.

main HEAD3d26188 기반 로컬 미커밋/미push다. 기존 사용자 변경을 보존했다. Goal 도구는paused이며 resume/본문 수정 API가 없는 상태를 변경했다고 주장하지 않는다. 이번 제한된 기능 구현을 전체 플랫폼 납품 완료로 표시하지 않는다.

다음 한 작업: 이번 시점별 오차 receipt를 저장·재열기와 연결하고, 이후 형상 변경 시 재검사가 필요한 상태를 사용자에게 명확히 전달한다. 아직 선언하지 않은 전체 표면 정확도 검사로 범위를 확대하지 않는다.
