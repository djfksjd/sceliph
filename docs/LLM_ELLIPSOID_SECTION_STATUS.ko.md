# 타원체 단면 제어 — 2026-10-05 체크포인트

## 구현

기존 타원체는 반축으로만 형상을 제어했다. 같은 축 길이에서 더 좁아지는 끝 윤곽이나 더 넓은 어깨 단면을 별도 지정하는 기능은 없었다. 새 기능 검수 사례는 변경 전 실제 정점 변화가 없어 실패했다(repro.log). 신규 sectionShape 필드는 이전 JSON 스키마의 지원 범위 밖이었으므로 이 실패를 기존 유효 IR의 회귀로 분류하지 않는다.

`implicitSurface`의 ellipsoid primitive에 선택형 `sceliph.ellipsoid-section-shape/0.1`을 추가했다. XY radialPower=p, Z axialPower=q이고 각각1.5..4다. 반축rx/ry/rz 및 local transform을 그대로 둔다. 사용한 zero contour는 다음이다:

```
(|x/rx|^p + |y/ry|^p)^(q/p) + |z/rz|^q = 1
```

기존 Surface Nets·union/subtract/intersect·gradient normal·경계/triangle budget·manifold 검사 경로를 재사용했다. 부호와 zero contour가 정해진 scalar field이며 정확한 Euclidean signed distance 또는 CAD/BREP로 주장하지 않는다. smooth-union도 기존 approximate field의 blend다. power가 낮은 경우 C2 곡률 연속성을 보장하지 않으며 voxel 근사/normal 품질 범위가 남는다.

2/2 또는 선언 없음은 기존 ellipsoid field 산술을 그대로 호출하여 실제 vertex/normal/index 배열을 보존한다. 새 shape set/clear는 explicit deep-copy migration helper로 제공한다. AssemblyIR0.1과 기존 primitive ID/axes/transform/order는 유지하고 선택 필드의 독립 버전을 검사한다. unknown version/keys/range와 비ellipsoid 선언은 거부한다. 이전 엔진이 새 필드의 의미를 보존한다고 주장하지 않는다; 신규 입력은 현재 코드 build가 필요하다. compilerRevision0.41.0 라벨만으로 수정 전후 build를 혼동하지 않도록 manifest의 코드SHA와 feature version을 함께 기록했다.

editImplicitEllipsoidSectionShape는 기존 frozen shape/dimension·raw scalarPBR·interactive node/resolution/triangle 한도를 재사용한다. 원본/수정의 실제 closed topology·shell수·declared contact를 검사하고 실패 시 원본을 보존한다. projected/procedural texture와 frozen fidelity/치수계약 편집은 지원하지 않는다. 기존 반축 편집도 새 sectionShape를 보존한다.

primary recipe0.3에서 새 ellipsoid-section-shape 연산을 제공한다. 기존0.1/0.2는 유지하고 새 연산을 거부한다. 기존 연산도0.3에서 지원한다. source fingerprint와최대4연산/16384문자/원자적 적용/intent ownership/기존 Undo/Redo/SAVE IR/OPEN RESULT 경로 유지. 같은 field operation 중복은 거부한다. 다른 field operation은 순서대로 검증하며 중간 실패도 부분 적용하지 않는다. 별도 schema: assembly-primary-recipe-v3.schema.json.

## 실제 형상과 측정

창작 Bird Primary Form Study의 두 날개 root에서 radial2/axial1.5를 적용하여 끝으로 더 좁아지는 윤곽으로 만들었다. 다른 부품과 primitive는 유지한다. factory의 legacy 기본값은 유지하고 Viewer가 shapedWings:true를 명시한다. 실제 렌더를 본 뒤 후보를 Viewer에 반영했다. 종/해부학/사진 복원을 검증한 결과가 아니라 창작 의도의 조형 변화다. 전체 형태는 여전히 단순 조형 study다.

고정 반축20/20/30mm, z=22.5mm의 실제 mesh section radius:

| axialPower | 실제 ray 교차 반지름mm | 설계 contour 반지름mm | 오차mm |
|---|---:|---:|---:|
| 2 |13.1504|13.2288|0.0784|
|1.5|9.8639|9.9420|0.0781|
|3|16.5565|16.6611|0.1046|

기준 tolerance는 결과를 보기 전 고정한32-grid fixture의 한 cell=50/32=1.5625mm다. 관측된0.08..0.11mm 오차는 이 fixture의 값이며 플랫폼/CAD/다른 크기의 정확도 보장이 아니다. .5/1/3배 크기에서도 실제 단면·폐쇄 topology·finite normal을 검사했다.

별도 product pod-shell/envelope ID의 반축20/14/30mm에서 radial3/axial3를 같은 엔진/recipe로 생성했다. 실제GLB·JSON재열기 byte-exact·Blender 첫 import·동일 iso neutral render까지 확인했다. 이 사례는 속이 찬 설계 mass이며 hollow housing/제조 제품으로 주장하지 않는다. 새 전용 ID 분기나 engine 예외 없음.

## 현재 검증

| 명령 | 결과 |
|---|---|
| npm test |exit0,136파일/908테스트|
| npm run check |exit0|
| npm run benchmark |exit0|
| npm run build |exit0|
| npm run quality:gate |exit1|
| npm run quality:production |exit1,dominance not-run|

전체 quality의 기존 electronics evidence52/90 및 Blender benchmarkAccepted=false 차단 유지. 기존 한 톱니 UV5% 기준 변경 없음. 현재 전체 명령의 로그와 오래된 DCC receipt를 분리했다. 이번 기능은 검증했지만 플랫폼 전체 납품/production 완료 아님. 일반 Blender normal drift도 별도 미해결이다. 외부 service/API/UNI_AI/Claude 호출/추가 dependency 없음.

현재 신규 실패·회귀는 테스트에 남지 않았다. 추가 검수: malformed/version/unsupported primitive/range, source mismatch 및 old recipe version, 원자적 후속 실패, head section 변경으로 기존 눈 contact가 사라지는 실패를 차단했다. legacy와 neutral/clear migration의 geometry 배열 일치, no-op, 반복 receipt/IR, 재열기 후 반축 추가 편집, 기본 Viewer factory와 검증된 IR 일치 확인.

## 실제 브라우저·납품

실제 원본 sourceJSON 업로드→Prepare section shape recipe→접촉을 잃는 head edit 오류/미적용→유효 날개 section Apply→SAVE IR 다운로드→새 browser session OPEN RESULT 업로드→GLB 재생성. 저장 IR은 Node 수정IR과 deep-equal이고 actual browser GLB는 재열기 전후 byte-exact다. 새 세션에서 torso radial2.1/axial2.1 추가 편집도 저장했고 해당 declaration 이외 원본 속성이 보존됐다. 추가 편집의 contact5개를 실제 mesh로 다시 검사했다.

브라우저 GLB SHA256:
`aab08ca2d209daabd03cb79609404fdd4258d55cb7d06c33feadc3618d98fed9`

Node actual export도 JSON 재열기 byte-exact, 비대상 node/hierarchy/material 및 position/normal/UV/index accessor 구성·실제 바이트 보존. raw 파일SHA와 canonical sourceFingerprint는 다른 값이며 manifest/operation-receipt에 각각 기록한다.

Khronos actual Node/browser/product GLB errors0/warnings0. 독립 WebIO는 필요한 glTF extensions를 등록하고 실제5파일의 vertex/normal/UV counts 및 유한 값을 확인했다. 새/원본 GLB Blender5.2.1LTS 첫 import·clay1024² 전체 렌더와 component-isolation closeup 실행. 첫 closeup은 계산한 프레임이 부족해 기존 gate가 clipping을 차단했다. clipped-closeup-attempt/에 실패 자료 보존 후 동일 쌍의 scale/center를 조정하여 재검증했다. gate 임계값을 낮추지 않았다. Blender 재export는 not-run, 독립 인간 전문가 평가는 not-run.

## 사용법·위치

Bird Primary Form Study → Primary form recipe → Prepare section shape recipe. 원하는 기존 componentId/primitiveId와 radialPower/axialPower를 선언하고 Apply. 2는 기본 타원체, 낮은 값은 더 좁아지는 윤곽, 높은 값은 더 넓은 어깨/둥근 사각 단면이다. local Z축 기준이므로 primitive rotation을 함께 확인한다. SAVE IR 후 OPEN RESULT로 재열어 추가 편집한다. 접촉/경계/topology 실패 시 수치를 되돌리고 오류 원인을 확인한다. 정확도 높은 값을 사진에서 자동 추출하는 기능은 이번 단계에서 구현하지 않았다.

변경 파일: src/engine/ellipsoid-section-shape.ts, implicit-surface.ts, implicit-ellipsoid-edit.ts, assembly-primary-recipe.ts, bird-primary-study.ts, src/AssemblyPrimaryRecipePanel.tsx, src/ViewerApp.tsx, tests/implicit-section-shape.test.ts, schemas/assembly-ir.schema.json, assembly-primary-recipe-v3.schema.json, docs/ACTIVE_GOAL.ko.md, 본문서.

증거: outputs/ellipsoid-sections-20261005/manifest.json, section-measurements.json, receipt.json, browser-roundtrip.json, product-case.json 및 현재 로그/actual파일. 원본/수정 전체 before.png/after.png, 날개 before-closeup.png/after-closeup.png, 제품 product-before.png/product-after.png. main/HEAD3d26188, uncommitted/no push; 사용자 변경 보존. M5/24GB/arm64/Node24.13.1/Blender5.2.1LTS. 원본 mirror는 이전 codeSHA 확인 후 이번 파일만 복사한다. 기존 Vite 유지, 자체 검증용 browser2세션 종료.

```sh
npx vitest run tests/implicit-section-shape.test.ts
npx vite-node outputs/ellipsoid-sections-20261005/export.ts
npx vite-node outputs/ellipsoid-sections-20261005/section-measurements.ts
npx vite-node outputs/ellipsoid-sections-20261005/product-case.ts
npx vite-node outputs/ellipsoid-sections-20261005/independent-reopen.ts
npm run gltf:validate -- outputs/ellipsoid-sections-20261005/browser.glb
```

다음 한 가지: 고정한 원자료/설계 단면에서 이 shape parameter를 피팅하는 제한된 경로. 현재의 수동 선언·검증을 자동 사진 정확도 주장으로 확대하지 않는다. 독립 원자료·camera/unit/projection과 매 view 검사가 필요하다. 이번 선택형 엔진 연산 완료와 연속 Goal 완료는 별개다. Goal 도구의 paused 상태를 임의로 resumed로 보고하지 않는다.
