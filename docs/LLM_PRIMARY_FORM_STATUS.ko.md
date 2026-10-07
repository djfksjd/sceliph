# LLM 선언형 primary form — 2026-10-05 체크포인트

이번 결과는 **연속 곡면의 생성·수치 편집·저장·재열기 경로**다. 범용 LLM 생성 품질 완성, 실사 새 복원, 종별 해부학 검증 또는 production-ready를 뜻하지 않는다.

## 기준과 범위

- 실제 작업 체크아웃: `/var/folders/z4/_txy7z5d7hb83mc592z_cq540000gn/T/morphloom-publish-w4nfo7ko/repo`, main, HEAD `3d26188af5951e7be77ffd0d5c3c9bdf15348fea` + manifest의 미커밋 변경.
- 원본 `/Users/danny/Documents/morphloom`의 iCloud git index는 수정하지 않았다. 이번 변경 파일은 원본이 HEAD와 같음을 먼저 확인하고 복사한다. 이전 surface-flow/layout/recipe 작업은 보존한다.
- 기존 `morphloom.assembly/0.1`, implicitSurface, smooth-union, Surface Nets, scalar PBR, component history, IR 로드/저장과 GLB 경로를 재사용한다. 새 의존성·외부 3D 모델·UNI_AI·Claude 호출 없음.
- 비교 대상은 기존 bird demo의 깃털 없는 primary 형상과 **별도 authored study**다. 기존 기본 bird generator를 자동 교체한 결과가 아니다. 원자료가 없으므로 개선은 구조/실루엣 검수이며 사진 정확도 측정이 아니다.
- 구현 전 예산: 형상 후보 최대2회, 전체5만 삼각형 이하, 텍스처 추가 없음. 최종 study 31,888삼각형, 머리 수정본32,088삼각형. 성능 보장은 이 기기/에셋에 한정한다.
- 환경: Apple M5/24GB, arm64, Node24.13.1, Blender5.2.1 LTS. 엔진 컴파일러 `morphloom-compiler/0.41.0`는 변경하지 않았다. 정확한 추가 코드 SHA는 `manifest.json`에 기록한다.
- Goal 도구의 기존 상태는 paused이며 재개 API가 없다. 사용자 재개 요청에 따라 로컬 구현은 수행했지만 도구 상태를 active로 변경했다고 주장하지 않는다. 연속 목표를 complete로 표시하지 않았다.

## 구현과 원리

`bird-primary-study.ts`는 몸통·목·머리를 타원체 거리장과 두 smooth-union 노드로 연결한다. 거리장의 0등위면을 Surface Nets가 메시로 만들고 기존 경계·예산 검사를 거친다. ellipsoid distance는 근사 거리이며 exact BREP가 아니다. 닫힌 단일 core 연결 성분을 실제 정점 adjacency로 검사한다. 다리 시작점의 core 내부 포함은 컴파일된 메시 ray parity로 검사한다. 다리와 발가락은 닫힌 tube로 연결하며 상호 접합은 의도된 중첩이다. 이는 부품 간 boolean union이나 하중/관절 검증이 아니다.

`implicit-ellipsoid-edit.ts`는 기존 component ID와 primitive ID로 타원체의 **로컬 반축 mm**를 절대값 편집한다. 직경이 아니며 기존 transform의 회전·배율이 이후 적용된다. 실제 컴파일 결과는 glTF 미터 단위다. 저장된 기존 radius tuple도 읽으며 변경 시 명시적 radii 필드로 정규화한다. IR 스키마는 그대로0.1이고 기존 compiler가 읽을 수 있다.

허용 범위: 기존 타원체, finite 반축0.1..100000mm, explicit raw scalar PBR, resolution≤48, primitives≤16, operations≤32, triangleBudget≤50000. 원본을 복제하고 대상 메시를 재생성해 기존 strict topology가 통과한 뒤에만 commit한다. 반축이 같으면 no-op이다.

거부 범위: 없는/다른 종류의 primitive, 잘못된 값, clipping bounds, topology 실패, 초과 예산, frozen fidelity/visual-plan/dimension/plan/architectural 계약, projected/procedural surface mapping. 관련 부품 자동 피팅, live 접합 제약, 리깅, 제조 정확도는 지원하지 않는다. 대상의 normal/UV/정점은 재생성된다. 기본 UV는 기존 dominant-axis triangle projection이며 texture atlas·texel density·변형용 quad 토폴로지 검증은 아니다.

## 주요 시도

|가설/변경|현재 실행 증거|다음 판단|
|---|---|---|
|타원체를 겹친 기존 primary demo의 목/발 접합이 어색함 → 기존 smooth union으로 core 생성|후보1 clay, closed topology PASS. 날개는 둥근 판처럼 보임|후보1을 candidate-1에 보존. root/mid/tip을 가늘게 연결|
|후보2의 날개 root/mid/tip + 다리/발 연결|동일 fixed-space의 after/clay, wire, grazing, side 렌더. core 단일 성분·다리 내부 시작점 검사 PASS|구조 개선은 확인. 아직 단순화된 새 형상이며 종별 정확도 미검증|
|초기 테스트가 index 존재를 가정|focused-initial.log 실패. 기존 compiler의 UV 경로는 non-indexed|실제 null-index 구성과 position/normal/UV 배열의 정확 일치를 검사. 제품 계약 변경 없음|
|ray test에 IR mm 좌표를 직접 넣음|focused-v2.log 실패. compiler 출력은 미터|단위 경계를 수정해 실제0.012/0.059/-0.005m에서 ray 검사. 테스트 삭제/skip 없음|
|브라우저 머리 반축 편집·저장·되돌리기|head[22,22,26], Undo X=21, Redo source exact. X=100 + 위치X=1 동시 변경은 bounds 실패 후 source exact|부분 commit 없음. 새 세션에서도 source 재열기 후 GLB exact|
|재열기 뒤 추가 편집 가능 여부|browser-second-edit-source.json의 head[23,22,26], 다른 source 속성 exact|저장 파일만 만든 성공과 실제 추가 편집 성공을 구분해 완료|

## 사용자 경로

1. 로컬 viewer `/?asset=bird-primary-study` 또는 상단의 **Bird Primary Form Study** 선택.
2. 실측 도구를 끄고 몸통 클릭 → stable ID `organic_core` 확인.
3. **Ellipsoid primitive**에서 torso/neck/head 선택 → X/Y/Z 반축mm 입력 → **Apply component edit**. 실패 이유는 alert에 표시되고 원본은 유지된다.
4. **Undo / Redo / Cancel** 사용 가능. 재생성 후 primitive 선택은 첫 타원체로 돌아가므로 확인한다.
5. **SAVE IR** → 새 세션 **OPEN RESULT**에서 저장 파일 선택 → GLB 재생성. 다시 몸통/primitive를 선택해 추가 편집할 수 있다.

브라우저 검증은 실제 button과 file input을 조작했다. download anchor를 관찰해 동일 Blob 바이트를 로컬 증거로 수집했으며 export 검사 우회나 React state 주입은 하지 않았다. OS의 여러 다운로드 자동 수집을 완료했다고 대신 주장하지 않는다. 새 세션에는 이 실제 SAVE IR Blob의 source를 파일로 제공했다.

## 현재 수정본 검증

|명령/검사|결과|증거|
|---|---|---|
|npm test|exit0, 131files/881tests PASS|test-final.log|
|npm run check|exit0|check-final.log|
|npm run benchmark|exit0|benchmark-final.log|
|npm run build|exit0|build-final.log|
|npm run quality:gate|exit1|quality-gate-final.log|
|npm run quality:production|exit1; dominance not-run(앞선 gate 차단)|quality-production-final.log|
|실제 Node study/edited/reopened GLB|strict topology PASS, reopen byte exact, 비대상 attribute/index/material/hierarchy exact|receipt.json, node-glb-validation.log|
|실제 browser GLB|Khronos errors0/warnings0, WebIO 독립 재열기 PASS|browser-glb-validation.log|
|새 browser session에서 SAVE IR 재열기·GLB 생성|browser.glb = browser-reopened.glb 바이트 exact|browser-results.json|
|Blender 첫 import|17 mesh, 렌더 성공 exit0|browser-import.json/.log|
|Blender reexport 및 원본 normal parity|not-run. 이전 normal drift 해결 주장 없음|전체 납품 차단 유지|
|독립 인간 전문가 평가·종별 anatomy·사진 비교|not-run|정확도/전문가 완료 주장 없음|

quality scripts는 로컬 기존 게이트이며 유료 모델/서비스 호출을 추가하지 않았다. 현재 실패는 직전 quality-gate-final2.log와 같은 electronics-production-evidence 및 electronics-evidence(52/90), Blender cross-domain benchmarkAccepted=false다. 이번 파일은 기존 compiler/quality gate 판정과 임계값을 변경하지 않았다. 의도된 negative dimension fixture의 pass=false는 회귀 검사의 기대 결과이며 새 제품 실패로 세지 않는다. 이번 테스트/feature 회귀는 발견된 범위에서 해결했지만 전체 납품은 차단 상태다.

## 파일과 재현

모든 증거는 `outputs/bird-primary-20261005/`에 있다. 원본/수정 IR·GLB·후보1·실패 로그를 보존한다. `receipt.json`은 Node input/output SHA, `browser-results.json`은 실제 브라우저 파일 SHA, `manifest.json`은 현재 코드/보고서/전체 산출물 SHA와 실행 결과를 연결한다. 이전 영수증을 현재 파일 성공으로 재사용하지 않는다.

```
npx vite-node outputs/bird-primary-20261005/export.ts
npx vitest run tests/implicit-ellipsoid-edit.test.ts
npm run gltf:validate -- outputs/bird-primary-20261005/browser.glb
blender --background --python-exit-code 1 --python scripts/blender-neutral-render.py -- outputs/bird-primary-20261005/study.glb outputs/bird-primary-20261005/after.png outputs/bird-primary-20261005/after-render.json iso clay outputs/surface-flow-20261004/fixed-space.json
```

렌더러는 고정 카메라·조명·1024²·같은 world transform을 사용한다. closeup만16배의 별도 고정 공간을 기록한다. 자료 없는 시점은 구조 검사다.

## 次の一つ

LLM이 생성하는 최초 AssemblyIR의 primary form 분해·접합·비율을 평가하고 같은 선언형 IR에서 수정하는 경로를 연결한다. 이번 authored study는 곡면 표현·편집 경로의 실증이며 임의 프롬프트 출력 품질이 자동 개선됐다는 증거는 아니다. 대상 스타일/치수/참조를 고정한 다른 사례로 재현성과 이미지 비교를 수행한다. 깃털과 표면 노이즈는 primary form이 충분한 뒤에 추가한다.
