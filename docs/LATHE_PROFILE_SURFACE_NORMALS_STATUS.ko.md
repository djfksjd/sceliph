# 명시적 회전체 단면 법선 0.2 — 검증 진행 중

기준 HEAD `eb402fa477eae10f4080639b5ca4791d7979208a`, 현재 미커밋 수정본, compiler `morphloom-compiler/0.41.0`. 기존 0.1과 미선언 법선 계산은 자동 변경하지 않는다. UNI_AI/Claude 호출 0회.

## 결함과 구현

명시적 0.1 corner-angle 30°는 단면의 작은 각도까지 평균한다. 실제 사선 chamfer의 평평한 상단 캡에서 법선 편차가 shallow 3.654878°, moderate 11.705707°였다. 원주 분할 각도보다 더 작은 crease 각도를 전체에 적용하면 원통이 각져 보이므로 전역 임계값 변경으로 해결하지 않았다. Blender import drift와 별개의 생성 단계 문제다.

새 선언은 `{schema:"morphloom.lathe-normals/0.2", weighting:"profile-surfaces"}`다. 단면 선분별 회전면의 해석 법선 `(-dy*cosθ, dr, -dy*sinθ)/hypot(dr,dy)`를 계산해 단면 접합은 분리하고 원주 방향은 연속으로 유지한다. 원점 축에서 원추 법선은 하나로 정의되지 않으므로 삼각형 중심의 원주 방향 극한을 사용한다. 단면 밴드별 실제 compiler 삼각형 순서를 검사하며 구성 불일치는 실패한다. 원추 끝점을 매끄러운 유일 법선으로 복원했다고 주장하지 않는다.

AssemblyIR 0.1은 유지하며 nested policy만 0.2로 버전 구분한다. 기존 migration과 component-patch 0.2 set/clear를 재사용한다. 미지원 버전, 잘못된 weighting, 무시될 creaseAngleRad 등 추가 필드는 거부한다. UI에서 선택 후 Apply, Cancel, Undo/Redo, SAVE IR과 새 세션 재열기가 가능하다.

## 현재 증거

- 현재 `npm test`: 119파일 832테스트 PASS. `npm run check`, `npm run benchmark`, `npm run build` PASS. 최초 PNG 타입 빌드 실패를 보존하고 Vite 자산 URL로 수정한 재실행 PASS를 별도 기록했다.
- 사선 3사례와 작은/기본/큰/축 솔리드 4사례: 수정 IR 저장·파일 재열기·실제 GLB 반복 생성의 전체 SHA 일치, Khronos 검사 및 독립 WebIO 읽기 PASS.
- 독립 actual accessor 해시: 대상 POSITION/UV/index, 비대상 모든 accessor, 재질 값/원본 material JSON, 이름·변환·부모 계층 보존 PASS. 대상 NORMAL만 바뀐다.
- 실제 GLB 평면 캡 편차 3.654878°→0°, 11.705707°→0°, 0°→0°. 고정 0.01° 검사 유지. 단위 mm, GLB m 변환은 기존 경로다.
- 브라우저 moderate 수정 IR 및 GLB는 엔진 결과와 정확히 일치. 새 세션에서 0.2 재열기, 추가 profile 높이6→7mm, Undo/Redo의 저장 JSON 비교 PASS. aria 기반 Undo 대기 선택자는 timeout으로 기록했고 실제 다운로드 비교로 확인했다.
- 사선 3사례 Blender 5.2.1 LTS import/export/reimport 및 선택 bushing 재export normal 0.01° 검사 PASS. 크기/축 4사례도 동일한 native 재열기 및 선택 NORMAL 0.01° 검사 PASS. 첫 import normal payload 측정은 이번 단계 not-run.
- 동일한 고정 공간·카메라·조명으로 moderate before/after 사광 render를 생성하고 실제 확인했다. 평면 캡과 작은 chamfer 경계가 분리된다. 미관 우열의 독립 전문가 평가는 not-run.
- Sceliph 이름을 유지하고 로컬 두 화면의 이전 M 아이콘을 제공된 벌 이미지로 교체했다. 원본 이미지 수정 없이 SVG viewport로 표시하며 파비콘도 원본 심볼을 사용한다. 원본 체크아웃에 충돌 없는 브랜딩 파일만 동기화했다. 화면 구조 전체 재설계는 아니다.

## 전체 게이트와 미검증 범위

0.41로 변경 후 기존 0.40 revision-bound 영수증은 의도대로 차단된다. 첫 quality:gate/quality:production은 browser 증거 부재로 exit1. 실제 브라우저 7자산 SAVE PROOF를 새로 실행해 0.41 영수증을 갱신한 뒤 내부 quality는 회복했지만 competitive의 native/static 0.40 자료는 아직 차단된다. 이를 구 자료의 버전 문자열 수정으로 해결하지 않는다. 이후 실제 현재 버전의 Blender 5분야 재열기/부품 편집, Godot, PrusaSlicer, static 다운로드/Blender/Apple usdchecker, bound 단일 proof를 모두 재실행했다. 현재 0.41 영수증에서 내부 quality 모든 required rates=1, release browser4/4 PASS. 최종 quality:production은 기존 cooling infos23 때문에 competitive에서 exit1, dominance는 not-run이다. 버전 변경으로 생긴 영수증 공백은 닫혔다.

기존 cooling TEXCOORD_0 infos23과 비대상 sphere 첫 Blender import normal drift0.02968046°는 별도 미해결이다. 전체 production-ready가 아니다. Unity/Unreal 실앱, 제조 CAD/BREP 정확도, 인간 전문가 검수는 not-run.

로컬 근거: `/Users/danny/Documents/morphloom/outputs/lathe-profile-surface-normals-20261004`. 스크립트: `work/lathe-profile-surface-normals`(로컬 격리). 실제 파일 SHA와 코드 SHA는 manifest로 연결한다. 추가 현재 검증 자료는 `outputs/current-delivery-041-20261004`다. 공개 자료는 `benchmarks/modeling-slices-20261004/lathe-profile-surface-normals`와 `current-delivery-041`에 보존한다. Goal은 active다.
