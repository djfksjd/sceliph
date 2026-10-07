# 테이퍼 곡선 엔진 — 2026-10-05

## 실제 변경과 범위

기존 `tube`는 경로가 굽어도 단면 반지름이 일정했다. `radiusProfile`을 선언해도 생성된 마지막 ring은6mm였고 요구한0.6mm가 아니었다. 수정 전 실패는 repro.log에 보존했다. 선택형 `sceliph.tube-radius-profile/0.1`을 추가해 실제 정점의 radial offset을 변경한다. 정규화된 경로 호 길이에서 piecewise linear 반지름을 평가하며 모든 station이 실제 ring에 정렬되어야 한다. 노멀을 다시 계산하고 각도 UV seam의 두 복사본을 일치시킨다. 평평한 cap UV는 해당 끝의 반지름으로 다시 정규화하여 작은 끝면도 전체 disc UV 범위를 사용한다.

`AssemblyIR`0.1은 유지하고 기존 곡선/flat-cap opt-in을 재사용했다. 프로필이 없으면 기존 배열을 그대로 생성한다. 추가 dependency/외부모델/API 없음. 별도 profile version/strict validation/명시적 set-clear deep-copy migration helper 제공. `schemas/assembly-ir.schema.json` 확장. 새 선언은 이전 엔진 지원 범위가 아니므로 최신 엔진으로 읽어야 한다; 이전 엔진에서 테이퍼 의미 보존을 보장하지 않는다. 알 수 없는 profile 버전/필드는 현재 엔진이 거부한다.

지원: 기존 open quadratic Bezier+flat-outward cap, 시작 기본 반지름 유지,2..16station, 증가하는0..1호 길이 비율, 감소/동일한0.1..100000mm 반지름,ring3..256/radial3..128. 기존 max-radius 곡률 안전 검사 재사용. 생성 최대65792삼각형이며 좁은 interactive profile edit의 기존 shell audit는50000삼각형 한도이므로 큰 조합은 편집에서 명시적으로 차단될 수 있다. 임의 닫힌 sweep/반지름 증가/loop/zero tip/임의 loft/NURBS/BREP는 미지원.

기존 primary recipe0.1은 그대로 지원하고0.2에서 `tube-radius-profile` 연산을 추가했다. 기존 선언된 profile만 수정한다. source fingerprint·원자적 변경·no-op·비대상 보존·현재 의도 게이트·Undo/Redo·SAVE IR/OPEN RESULT를 재사용한다. raw scalar PBR만 편집하며 frozen fidelity/치수계약과 projection/procedural mapping은 거부한다. 수정 전후 폐쇄 토폴로지·shell 수와 명시된 contact witness를 검사한다. profile 생성이 자체적으로 제조용 자기 교차/강도 검증을 완료했다는 뜻은 아니다.

## 실제 조형 사례

Viewer Bird Primary Form Study의 직선 cone 부리를 약하게 굽은 quadratic taper로 교체했다. 다른 component는 유지했다. `createBirdPrimaryStudy()` 레거시 기본 결과는 보존하고 Viewer가 명시적으로 taperedBeak 옵션을 요청한다. contact witness도 새 부리의 local좌표로 선언했다. source는 창작 study이며 종/실측 원자료 없음. 자동 사진 복원이나 사실적인 새 완성을 주장하지 않는다.

전체 비교 baseline.png→after.png는 같은 고정 카메라·조명·clay1024²다. 부리 자체 비교 baseline-closeup.png→browser-closeup.png는 기존 renderer의 inspectionComponent=beak로 실제 GLB를 isolate하여 같은 datum/카메라/조명으로 렌더했다. 최초 전체 모델을 확대했더니 기존 framing gate가 clipping을 차단했다. 결과는 clipped-closeup-attempt/에 보존하고 PASS로 쓰지 않았다. 기존 component-isolation 경로로 다시 검증했으며 framing 임계값을 낮추지 않았다.

## 검증

| 현재 코드 명령 | 실제 결과 |
|---|---|
| npm test | exit0,135파일/900테스트 |
| npm run check | exit0 |
| npm run benchmark | exit0 |
| npm run build | exit0 |
| npm run quality:gate | exit1 |
| npm run quality:production | exit1,dominance not-run |

기존 전체 electronics evidence52/90 및 Blender benchmarkAccepted=false 차단은 유지한다. 해당 전체 품질 실패를 이 연산 통과로 대체하지 않았다. 기존 한 톱니 UV5% 계약 변경 없음. 이번 기능의 실패·회귀는 현재 테스트에서 남지 않았지만 전체 납품 완료는 아님. Blender 일반 normal drift는 별도 미해결이다.

실제 ring 반지름을 정점에서 측정했다. .5/1/4배 다른 크기의 폐쇄 토폴로지·유한 단위 노멀·UV seam·cap UV·재열기 결정성을 검사했다. malformed/version/범위/비정렬station/반지름 증가/closed path/지원하지 않는 cap/curve/예산을 거부한다. profile set→clear는 legacy actual vertex/normal/UV/index 배열로 복원된다.0.1 recipe에 새 연산을 넣거나 원자적 recipe의 후속 대상이 실패하면 적용하지 않는다.

Node 실제 export: 수정 원본 JSON 재열기 후 GLB byte-exact. 비대상 component node/hierarchy/material 및 position/normal/UV/index accessor 구성·실제 바이트 일치. 구형 cone→새 tube 비교와 기존 profile 편집 비교는 서로 다른 단계이며 receipt의 비대상 파일 검사 대상은 후자다.

브라우저 실제 template 준비→잘못된 프로필 차단→유효 프로필 Apply→SAVE IR 다운로드→새 세션 OPEN RESULT 파일 업로드→GLB 다운로드→추가 tip 편집 확인. 저장IR은 Node의 수정IR과 deep-equal. 브라우저 GLB 재열기 전후 바이트 일치. 추가 편집은 tip0.4→0.5mm만 변경하고 비대상/계약 보존. 시작 페이지 초기화 중 selection을 보냈을 때 value가fold8로 남아 실제 값을 확인한 후 bird-primary-study를 선택했다. 확인하지 않은 초기 상태를 성공으로 세지 않았다.

브라우저 GLB SHA256:
`5d00ef14a8b8e2525b5f73dfcc1ca492c567a40f8a4a588fe0903662fdc8bfbc`

Khronos: actual Node/브라우저 GLB 모두 errors0/warnings0. 독립 WebIO parser는 실제3파일을 열고17메시/17glTF재질 및 position/normal/UV accessor 구성이 일치하고 유한함을 확인했다. 선언된 glTF extensions를 등록했다. Blender5.2.1LTS first import 및 전체/isolated render 실행. Blender 재export는 not-run. 독립 인간 전문가 검수 없음.

## 사용자 작업

Bird Primary Form Study → Primary form recipe → Prepare tube taper recipe. station의 두번째 숫자가 local 반지름mm다. 첫 숫자는 유지하고 원하는 중간/끝 굵기를 수정 → Apply primary recipe. 시작6mm를 유지하고 뒤의 반지름이 증가하지 않게 한다. SAVE IR로 저장한 뒤 OPEN RESULT에서 다시 불러와 같은 방식으로 추가 편집한다. 기존 component Undo/Redo 한 단계로 처리한다.

수정파일: src/engine/tube-radius-profile.ts, tube-radius-profile-edit.ts, assembly-ir.ts, assembly-compiler.ts, assembly-primary-recipe.ts, bird-primary-study.ts, src/AssemblyPrimaryRecipePanel.tsx, src/ViewerApp.tsx, tests/tube-radius-profile.test.ts, schemas/assembly-ir.schema.json, assembly-primary-recipe-v2.schema.json, docs/ACTIVE_GOAL.ko.md, 본문서. 현재 main/HEAD3d26188의 uncommitted 수정. 원본 mirror에는 이전 SHA 확인 후 해당 파일/증거만 복사한다. push 없음. M5/24GB/arm64/Node24.13.1/Blender5.2.1LTS. 기존 Vite 프로세스 유지, 자체 browser2세션 종료. 파일/code SHA는 manifest.json.

```sh
npx vitest run tests/tube-radius-profile.test.ts
npx vite-node outputs/tapered-tube-20261005/export.ts
npx vite-node outputs/tapered-tube-20261005/independent-reopen.ts
npm run gltf:validate -- outputs/tapered-tube-20261005/browser.glb
```

다음 병목: body/wing silhouette는 여전히 ellipsoid 기반이다. 공개된 실제 자료나 명시적인 디자인 단면을 고정하고 기존 silhouette residual/implicit fitting 경로의 재사용 범위를 확인한다. 실제 자료 없는 형상의 세부 노이즈 추가를 정확도 개선으로 보고하지 않는다. 이번 선택형 연산 완료와 광범위한 연속 Goal 완료는 별개다.
