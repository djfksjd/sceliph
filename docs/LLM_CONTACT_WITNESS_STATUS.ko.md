# 부품 접촉 보존 — 2026-10-05 체크포인트

## 현재 구현

LLM/사용자가 선언한 owner-local mm 지점이 생성된 두 부품의 폐쇄 삼각형 메시 내부에 있는지 엔진이 검사한다. 삼각형의 solid angle 합으로 내부를 판정하고, 모든 삼각형까지의 최소 거리를 실제 월드 공간에서 계산한다. primitive SDF나 bounding box의 겹침으로 대체하지 않는다. owner 위치·XYZ Euler 회전(rad)·비균일 scale을 적용하며 glTF의 metre를 mm로 환산한다.

AssemblyIR 0.1의 기존 metadata envelope에 `sceliphContactWitnesses` JSON 문자열을 선택적으로 보존한다. 독립 계약 버전은 `sceliph.contact-witnesses/0.1`; schema는 `schemas/assembly-contact-witness.schema.json`이다. 없는 입력은 기존 편집 동작을 유지하며 마이그레이션이 필요 없다. 알 수 없는 버전·필드, 중복/없는 ID, 동일 owner/host, 유효하지 않은 좌표/공차, 열린 메시, 반사/특이 변환과 예산 초과를 거부한다. 최대8지점·8192문자·메시당50000/전체200000삼각형이다. 최소 내부 여유 범위는 0.01..100 mm다.

`editImplicitEllipsoidRadii`의 변경 전/후 검사에 연결했다. 선언한 접촉을 끊으면 원본을 변경하지 않고 전체 recipe가 실패한다. 변경 없는 편집도 원본 계약을 검사한다. 저장·재열기 후 같은 계약을 다시 적용한다. Viewer의 Bird Primary Form Study는 양 눈·날개 뿌리·부리의 창작 의도 지점5개를 선언한다. 레거시 함수의 기본 출력은 유지하고 Viewer가 명시적으로 `preserveContacts:true`를 요청한다. 특정 ID 예외는 검사 엔진에 없다.

일반적인 모든 편집/납품 경로를 검증하는 전역 접촉 게이트는 아니다. 이번 단계의 반축 편집에만 자동 적용한다. 계약을 임의로 제거한 외부 입력은 레거시 입력으로 취급한다. 한 지점의 내부 포함은 접촉 면적·전체 인터페이스·관절 강도·해부학적 정확도·제조 결합 검증이 아니다. 자동 재부착/정렬도 하지 않는다.

## 가설·수정·판정

1. 기존 connected-shell 검사는 같은 몸체 내부의 분리를 막지만 다른 부품과의 접촉은 모른다. 머리를 `[15,21,25]`mm로 줄여도 닫힌 몸체는 하나로 유지됐다. 새 테스트가 수정 전 실패했다(`repro.log`).
2. 명시한 접촉 지점의 실제 polygon 내부/거리 검사 추가. 같은 편집은 눈 지점이 몸체 밖으로 약3.99mm 나오므로 거부된다. 원본과 기존 실패 임계값을 유지했다. 외부 모델/API/의존성 추가 없음.
3. 유효한4연산 recipe와 다른 이름의 기계 형상·회전/비균일 scale 사례는 통과. 브라우저의 실패 표시/저장/새 세션 재열기/추가 편집까지 확인했다. 원자적 실패와 레거시 지원을 테스트로 확인했다.

## 현재 코드의 검증

| 명령 | 실제 결과 |
|---|---|
| npm test | exit0, 134파일 / 893테스트 PASS |
| npm run check | exit0 |
| npm run benchmark | exit0 |
| npm run build | exit0 |
| npm run quality:gate | exit1 |
| npm run quality:production | exit1, dominance not-run |

전체 quality는 기존 electronics evidence52/90와 기존 Blender cross-domain 영수증의 benchmarkAccepted=false 상태로 실패한다. 현재 새 GLB의 Blender 첫 import와 오래된 전체 DCC 영수증을 분리한다. 기존 normal drift 해결로 보고하지 않는다. 전체 production-ready 아님. 외부 서비스 호출/비용 없음. 기존 한 톱니 UV5% 계약 변경 없음. 현재 명령 로그는 outputs/contact-witness-20261005에 보존했다.

## 실제 사용자 흐름

Bird Primary Form Study 선택 → Primary form recipe 펼치기 → Prepare template → 반축 수정 → Apply. 접촉 단절은 오류를 표시하고 receipt 없이 적용을 막는다. 유효한 변경은 SAVE IR → 새 브라우저 세션 OPEN RESULT로 업로드 → GLB 저장. 동일 IR 재열기의 실제 브라우저 GLB는 바이트 단위로 동일했다. 이후 torso `[26.2,33,50]`mm 추가 편집도 저장했으며 비대상 IR와 접촉 계약은 보존됐다. 추가 편집 접촉5개도 다시 검사했다.

브라우저 실제 파일 `browser.glb`와 `browser-reopened.glb` SHA256:
`fac2335154630b42dc34cd4028909bb16749658a8bec60810f09aa551cdbf96f`

Node GLB도 after/reopened 바이트 일치, 비대상 node/재질/기하 attribute(normal/UV 포함)/index 실제 accessor 바이트와 구성이 보존됐다. Node export와 Viewer export의 root metadata 차이가 있어 둘 사이 전체 파일 바이트 일치는 요구/주장하지 않는다.

Khronos GLB 검사: Node/브라우저 모두 errors0/warnings0. Blender5.2.1LTS 실제 browser.glb 첫 import: 17메시/18재질, 동일 고정 카메라·clay 1024² 렌더. Blender 재export는 not-run이다. before.png/after.png는 동일 조건의 유효한 수정 비교이며, 단절한 편집을 개선 결과로 렌더하지 않았다. 외형은 단순 조형 스터디이며 사실적인 새로 주장하지 않는다. 독립 인간 전문가 검수 없음.

M5/24GB/Node24.13.1/arm64에서 추가 편집 IR 접촉5개의 컴파일·검사 1회317.5ms. 예열 평균/모든 기기의 성능 보장이 아니다. 반복4연산은 전후 검사를 하므로 비용이 증가한다.

## 파일·재현

변경: src/engine/assembly-contact-witness.ts, implicit-ellipsoid-edit.ts, bird-primary-study.ts, src/ViewerApp.tsx, src/AssemblyPrimaryRecipePanel.tsx, tests/assembly-contact-witness.test.ts, schemas/assembly-contact-witness.schema.json, docs/ACTIVE_GOAL.ko.md, 본문서.

증거 및 SHA: outputs/contact-witness-20261005/manifest.json. 실제 체크아웃 main/HEAD3d26188, 사용자 변경 보존, uncommitted/no push. 원본 mirror에는 이전 checkpoint SHA 확인 후 이번 파일만 복사한다. Vite 기존 프로세스 유지, 이번 검증용 두 브라우저 세션 종료.

```sh
npx vitest run tests/assembly-contact-witness.test.ts
npx vite-node outputs/contact-witness-20261005/export.ts
npx vite-node outputs/contact-witness-20261005/measure.ts
npm run gltf:validate -- outputs/contact-witness-20261005/browser.glb
```

Goal 본문 변경·재개 API는 없다. 플랫폼 Goal은 여전히 paused이며 ACTIVE_GOAL 문서는 이번 사용자 요청의 갱신한 실행 목표를 기록한 것이다. 과거 UNI_AI 호출 계획을 따르지 않고 추가 UNI_AI/Claude 호출 없이 진행했다. 이 체크포인트는 광범위한 연속 Goal의 완료가 아니다.

다음 한 가지: 실제 원자료의 실루엣과 주요 단면을 기준으로 조형을 조정하는 경로. 접촉 가드만 계속 늘리는 것으로 외형 품질 개선을 대신하지 않는다. 기존 비교 자료·fidelity 경로를 먼저 조사하고, 검증 가능한 작은 조형 변화부터 선택한다.
