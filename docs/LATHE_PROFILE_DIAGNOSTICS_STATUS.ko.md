# 회전체 단면 오류 위치 — 2026-10-04

기준8cbf2fa29eedd01e05b4d0d4bc348631d4c83a83/compiler0.40.0.
이전 UI에서는 점0/1이 겹쳐도 “Custom geometry contains a degenerate triangle before UV generation”만 표시됐다. 기존 실패 차단 자체는 있었지만 사용자가 어느 점을 고칠지 알 수 없었다.

## 수정

현재 bounded raw-PBR profile 편집 helper에서 closure pairing 후 연속 동일 점과 인접하지 않은 선분의 proper crossing을 미리 거부한다. 점 쌍 또는 두 선분의 번호, 반경/높이 좌표와 수정 안내를 제공한다. 새 기하 생성·자동 교정·선분 재정렬은 없다. 검사 비용은128점 이내의 O(n²)이며 새 의존성은 없다. UV/material/geometry를 만들기 전에 알려진 실패를 찾는다.

점 동일성은 입력 숫자 값의 exact equality다. 교차 방향 판별은 범위가 제한된 Float64 determinant 부호 비교이며 tolerance를 추가하지 않았다. 고정밀 robust CAD predicate가 아니다. 가까운 collinear contact·overlap·3D self-intersection의 모든 위치를 찾아준다고 주장하지 않는다. 그 경우 기존 compile/UV/analyzeTopology 검사가 그대로 적용된다. 기존 임계값·releaseAllowed·schema·kernel version은 바꾸지 않는다.

## 현재 증거

신규2tests는 수정 전 실패, 수정 후 기존 profile edit3tests와 함께5tests PASS. 전체 npm test117files/826tests PASS; npm run check/benchmark/build PASS. source diff --check PASS. 원본 실패/성공 로그를 그대로 보존한다.

수정 전/후 이번 실행에서 각각 small/default/large/solid IR 저장/재읽기 및 반복 GLB 생성, Khronos/WebIO를 수행했다. actual IR/GLB/proof 파일 bytes가 전후 동일하다. 기본 수정 GLB SHA eff9368cd352fcaa23b2c39f109eb3f9f150df2d023c67fdadf3eb7267dc6780. 메시 품질 변화나 새 Blender 실행을 주장하지 않는다. Blender/중립 렌더 이번 단계 not-run; 전체 actual GLB bytes 동일인 사전 진단 변경이므로 재실행하지 않았다.

실제 브라우저: 점1을[8,-6]으로 변경→points0-1 coincide 오류와좌표표시→SAVE IR 원본 exact→높이7로 교정→저장 IR/GLB 엔진 결과 exact. 다음[8,-6],[14,6],[8,6],[14,-6],[8,-6] 초안은segments0-1/2-3 cross 오류표시→Cancel→저장 IR 정상 수정본 exact. 화면 캡처browser-duplicate/browser-crossing.png 보존.

quality:gate 및 quality:production exit1. 기존 cooling unusedUV infos23과 Blender cross-domain benchmarkAccepted 차단이 유지된다. dominance는 upstream 실패로 not-run. 내부 품질 검사와 전체 production 판정은 별개이며 production-ready가 아니다. UNI_AI/Claude 추가호출0.

## 재현과 다음 단계

증거 benchmarks/modeling-slices-20261004/lathe-profile-diagnostics/manifest.json에 실제 input/output SHA. before/after 디렉터리는 현재 단계에서 각각 생성한 자료다. before.ts/after.ts 실행 원본은work/lathe-profile-diagnostics 상대 import와 기록된 outputs 절대경로를 전제로 한다. 다른 환경은 경로 조정이 필요하다.

macOS AppleM5/Node24.13.1/Python3.9.6. 20분/진단2/증거25MiB/API0 선작성 CONTRACT.md. 재현npm test -- --run tests/lathe-profile-diagnostics.test.ts tests/lathe-profile-edit.test.ts; npm run check; npm run benchmark; npm run build.

다음 한 가지: 회전체 프로파일에 명시적 실제 크기 chamfer/fillet을 넣는 최소 기존 경로와 품질 계약을 조사한다. 데이터 없는 자동 마모·베벨 적용은 하지 않는다.
