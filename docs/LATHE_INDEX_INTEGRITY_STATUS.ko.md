# 회전체 실제 삼각형 대응 검사 · 2026-10-07

기준: 정상 별도 체크아웃 `/private/tmp/sceliph-publish-20261007`, base `24b541fc3fca9a35f16c34a1ba38c934777b647a`, branch `engine/lathe-connectivity-20261007`. 기존 게시 branch와 bundle은 보존한다. 이번 기하 검사는 API/Claude/UNI_AI 호출 없이 로컬에서 진행한다. 새 의존성·schema·기하 생성 변경·push 없음. 체크포인트 예산30분, 같은 결함 수정 가설2회, 기존129 profile points/300000 vertices/100000 triangles/512 segments 한도와0.03mm fixture 계약 유지.

## 재현한 결함

기존 measureLatheCircumference는 실제 position 링을 정렬해서 현 오차를 구했지만 실제 index 연결을 읽지 않았다. 유효한 원래 정점/UV/normal을 보존한 채 삼각형 한 모서리를 원주 반대편 정점에 연결하면 그 변이 축을 가로지르는데도 약0.03mm 링 편차로 측정했다. 실제 변의 중점 반경은0에 가깝다는 독립 지점 계산으로 차이를 확인했다.

첫 fixture는 normalPolicy가 생성한 non-indexed 메시의 index가 null이라는 계약을 놓쳤다. 원본 compiler 위치·normal·UV는 그대로 두고 identity index를 부여해 같은 실제 삼각형을 indexed로 표현한 유효한 fixture로 수정했다. 제품 검증을 변경하지 않았다. 수정 fixture에서 반대편 연결·중복·누락·뒤집힘·퇴화·범위초과·소수 index·NaN index8종이 기존 검사에서 차단되지 않았다. 정상 저장순서/비indexed3종은 통과했다. 두 실패 로그는 삭제하지 않는다.

## 구현

- src/engine/lathe-surface-budget.ts: actual triangle index의 정수/유한/범위와 position의3성분을 확인한다. native source를 기존 compiler로 재생성하고 각 면의 실제 좌표를 exact 값으로 비교한다. cyclic rotation은 같은 winding이며 역순은 다른 면으로 취급한다. face multiplicity도 비교하므로 원래 면 하나를 중복 면으로 바꾼 손상을 차단한다. 생성한 expected geometry는 finally로 dispose한다.
- 정점 순서·면 순서·indexed/non-indexed 저장은 triangle correspondence에서 정규화한다. 좌표 값의 오차 비교로 대체하지 않는다. 이 검사 자체는 geometry 대응이며 normal/UV/material·완전한 topology 또는 기존 strict GLB whole-byte 규칙을 대체하지 않는다.
- 기존 손상 링 검사의 실패 순서를 유지한다. 첫 구현은 새 검사 오류가 기존 /ring/ 오류보다 먼저 발생했다. 기존 테스트 assertion을 바꾸지 않고 검사 순서를 조정해 이전 오류 계약을 유지했다.
- tests/lathe-index-integrity.test.ts: 독립 축 중점 witness,8손상 차단,3등가 저장 표현의 동일 측정. 실제 source geometry와 기존 compiler를 사용한다.

## 지원 범위

선언된 native AssemblyIR lathe의 정확한 좌표·삼각형 대응만 검사한다. 일반 DCC remesh·재삼각화·압축 quantization·월드 변환·제조 CAD 정확도 승인으로 확대하지 않는다. geometry canonical 대응을 허용해도 기존 원본/현재 GLB 바이트 계약의 실패를 PASS로 바꾸지 않는다. 원래 프로파일 자체의 설계 정확도나 물리적 적합성도 보증하지 않는다.

## 증거

outputs/lathe-index-integrity-20261007에 변경 전 helper, fixture 실패·최종 테스트·파일 재생성·전체 gate 로그와 현재 source SHA를 보존한다. 실제 GLB/sourceJSON 재생성은 이번 코드에서 다시 실행하고 이전 파일 SHA와 비교한다. 브라우저·Blender first import/reexport·중립렌더는 이번 단계 not-run이다. 이번 개선은 잘못된 형상에 작은 오차 점수를 부여하는 것을 막는 검사 개선이며, 새 beauty render나 임의 모델의 외형 품질 개선을 주장하지 않는다.

## 이번 실행 결과

- 관련3파일18테스트 PASS. 8손상 차단·3등가 표현 허용과 기존4프로파일 회귀 포함.
- 현재 전체 테스트:145파일/964테스트 PASS,4파일/4테스트 FAIL(5000ms timeout),208.26s. 실패 파일은 implicit-section-shape, native-blender-normal-kit, workspace-history, surface-cache다. 해당4파일의 단독 실행도 같은4개 FAIL이었다.
- 변경 전24b541f의 깨끗한 worktree에서 같은4파일 재실행:15테스트 PASS/4테스트 timeout FAIL,36.70s. 테스트 파일도 바이트가 같고 새 검사 함수는 이 경로에 호출되지 않는다. 이번 변경만의 회귀로 확인되지 않았으며 현재 환경에서 기준선에도 재현되는 시간 초과로 구분한다. CPU/메모리 경합의 구체적 원인은 확정하지 않았고 제한은 변경하지 않았다. baseline checkout 완료 전에 시작한 조사는 exit130으로 중단해 별도 premature 로그를 유지했다.
- check/build/benchmark PASS. quality:gate/quality:production는 기존 전자 근거52/90 실패 유지. 이후 dominance not-run.
- small/default/large/solid+no-op5흐름의15GLB를 현재 코드에서 다시 생성·Khronos/WebIO 확인. 오류·경고0, 반복 재생성 whole-byte 일치. 이전4사례의12개GLB와도 전체 바이트가 같고 no-op sourceJSON/GLB도 같다.
- 별도 원본/손상 diagnostic GLB2개도 Khronos 오류·경고0이었다. 손상 GLB의 실제 반대편 변 중점 반경은 약4.9e-16mm인데 이전 검사 편차는 원본과 같은0.029975mm였다. 새 검사는 거부한다. 이 손상 파일은 진단용이며 납품/편집 가능한 source export로 승인하지 않는다.

## 비용과 판정

macOS arm64/Node24, warm-up1회 후3측정의 평균:384삼각형에서1.13→4.56ms,99328삼각형의 열린 진단 프로파일에서773.60→1315.66ms. 큰 사례는 성능 측정용이며 납품 topology 합격 사례가 아니다. 순차 실행·3샘플의 관측값으로 기기 일반 성능이나 통계적 보장을 하지 않는다. 추가 source 재생성과 면 비교로 비용이 늘며 UI의 매 프레임 검사로 연결하지 않았다. 기존 geometry/disposal·triangle budget은 유지한다.

현재 helper/test SHA, 실제 파일 SHA, 재현 명령·실패 로그는 outputs/lathe-index-integrity-20261007/results.json / execution.json / diagnostic-report.json / manifest.json에 연결한다. 이번 좁은 triangle 대응은 관련 코드·파일 증거를 확보했지만 전체 검사/사용자 흐름/납품 판정은 INCOMPLETE다. 다음 하나는 시간 초과의 실행 조건을 안정화한 뒤 동일한5초 제한으로 전체 검증을 다시 확인하는 것이다. 새 가설이나 환경 변화 없이 같은 전체 검사를 반복하지 않는다.
