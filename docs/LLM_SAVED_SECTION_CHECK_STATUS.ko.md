# 저장·재열기 가능한 단면 검사 — 2026-10-05

## 실제 구현

이전 오차 budget은 별도receipt에만 남았다. 새 선택형 AssemblyIR.sectionMeshChecks에는 버전0.1, 대상 ID, geometry fingerprint, 엔진 계약 버전, 원자료 분류/지점과 요청 tolerance/maximumResolution을 저장한다. PASS나 측정 결과를 신뢰 가능한 값으로 저장하지 않는다. 재열기 때 실제 현재 메시의 ray 교차 오차를 다시 계산한다. 단순 라벨/metadata만 추가한 구현이 아니다.

fingerprint는 geometry·component scale·units를 canonical SHA256으로 묶는다. 위치·회전·색상 및 비대상 부품 변경은 로컬 단면 geometry를 바꾸지 않으므로 불필요하게 stale로 만들지 않는다. 실제 형상 변경이면 stale이며, 현재 지점별 오차가 모두 만족할 때만 사용자의 명시적 Refresh가 binding을 갱신한다. 갱신은 geometry/UV/normal/index를 바꾸지 않는다. 오차 초과나 비지원 대상이면 갱신 버튼을 비활성화하고 엔진도 원자적으로 거부한다.

기존 budget selector와 검사기가 동일 실제 mesh 측정 helper를 사용한다. 기존 raw-PBR/frozen-shape/closed-topology/contact/triangle/resolution/frame 지원 한도를 유지한다. primitive transform과 component scaling은 이전과 같이 미지원이다. 최대4개 대상·각2..16지점이다. 임의 메시/CAD/전체 표면 정확도 또는 제조 공차 승인이 아니다. measured는 입력 선언이며 독립 실측 인증이 아니다.

record 연산은 primary recipe0.6에만 추가했다. 기존0.1..0.5와 IR0.1은 새 optional record가 없으면 기존대로 작동한다. optional 계약에는 별도 버전을 주며 unknown version/engine/extra fields/cached PASS/duplicate component/malformed unit/budget을 거부한다. 기존 IR을 강제로 migration하지 않는다. 이전 엔진이 이 optional 검사를 이해하거나 유지한다고 보장하지 않으며 검사 사용에는 현재 코드가 필요하다. compiler0.41.0 라벨만으로 수정본을 식별하지 않고 코드SHA를 함께 기록한다.

## 사용자 흐름

OPEN RESULT → 독립 타원체 IR → Primary form recipe → Prepare saved section check recipe → 목표 좌표/예산 수정 → Apply → SAVE IR. 새 세션 OPEN RESULT에서 검사 입력을 복원하고 실제 메시를 재검사한다. template는 현재 형상의 창작 예시다. 기존 sourceCurrent/intent/history를 재사용하고 async 검사 결과도 현재IR에만 표시한다. LLM API나 외부3D 모델을 추가하지 않았다.

실제 브라우저에서 record 적용·저장 JSON과 CLI 결과가 일치했고 새 세션 GLB도 전체 byte-exact로 일치했다. 재열기 actual inspection verified를 확인했다. UI에서 axialPower1.5로 바꾸면 stale/withinBudget:false 및 Refresh 차단을 확인했다. Undo로 이전 geometry를 복원하면 verified로 돌아온다. 해상도38의 passing 변경도 자동 PASS 승격하지 않고 stale로 표시하며 explicit Refresh 후 geometry를 그대로 유지한 새 binding을 저장한다.

600ms의 crypto digest 지연을 주입한 후 원본 파일을 교체했고 늦은 이전 검사가 새 stale/실패 결과를 덮지 않음을 확인했다. 읽기 실패 및 unmount를 이번 browser 사례로 새로 주입한 검증은not-run이며 기존 회귀 테스트는 통과했다.

## 검증과 제한

현재 로컬139파일/930테스트 PASS. check/benchmark/build exit0. quality:gate/quality:production exit1이며 기존 electronics evidence52/90 및 Blender acceptance 부족 등이 남았다. production dominance는not-run이다. 원격HEAD의 CI 실패와 현재 로컬 결과는 별도로 기록했다. 임계값/검사를 낮추지 않았다.

새7테스트: 저장/재열기 실제 오차, 변경 후 stale/실패 및 원자적 refresh 차단, 비대상/색상 보존, passing 변경의 명시적 refresh와 버퍼 보존, cached PASS/unknown schema/engine/duplicates/forged binding 거부, version6/legacy/no-op, async hashing 전 snapshot 보존. 실제 GLB2개 Khronos error0/warning0 및 독립WebIO 재열기 통과. 이번 변경은 workflow 검증이며 외관 향상이라고 보고하지 않는다. 이번 Blender 첫 import/reexport·normal drift·전문가 검수는not-run이다. 이전 렌더/Blender 성공을 이번 수정본 재실행으로 대체하지 않는다.

원본·수정·stale·refreshed JSON과 browser actions, GLB·코드SHA·현재환경은 outputs/saved-section-checks-20261005에 보존한다. 재현: npx vitest run tests/saved-section-checks.test.ts; npx vite-node outputs/saved-section-checks-20261005/product-case.ts; npm run gltf:validate -- outputs/saved-section-checks-20261005/product-after.glb.

사용자의50% 고도화 목표는 계속 진행 중이다. 이 한 단계와 GitHub ruleset 설정으로50%를 달성했다고 평가하지 않았다. 다음 우선순위는 원격 CI의 엄격한 byte 비교 실패를 분리한 뒤 필수 CI를 ruleset에 연결하고, 대표 에셋의 실제 시각 품질·납품 합격 근거를 늘리는 것이다. 로컬 미커밋/미push이며 기존 사용자 변경을 보존했다. Goal 도구는paused이고 도구 상태/본문을 수정했다고 보고하지 않는다.
