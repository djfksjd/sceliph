# 2026-10-07 검증 경로 실행 비용 체크포인트

목표는 LLM이 선언한 IR의 생성·편집·실제 파일 검증을 실무 사용 가능한 좁은 범위로 이어가는 것이다. 이번 단계는 기존 5초 테스트 예산의 실패 원인 조사다. 전체 플랫폼 또는 실무 납품 완료 선언은 아니다. 30분 체크포인트, 같은 결함 수정 가설 최대 2회, 새로운 모델/API/의존성 호출 없음. 도구 Goal의 paused 상태는 변경되지 않았다.

기준 작업 트리: `/private/tmp/sceliph-publish-20261007`, `engine/lathe-connectivity-20261007`, HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 이전 lathe 연결 검사 변경과 사용자 변경을 보존한다. GitHub write는 이전 승인 정책 거부로 차단되었고 우회하지 않는다.

## 원인과 변경

| 항목 | 확인한 원인 | 변경 | 증거 |
| --- | --- | --- | --- |
| 3,000 override 편집 이력 | 필드마다 허용 배열 생성/선형 검색, 사전 검사 비용이 제곱으로 증가 | 객체당 Set 하나 생성, 필수 필드·unknown·prototype·slot 검증은 동일 | 동일 이력 테스트 8.675초 실패 → 0.942초 통과; 기존 element/history 22개 통과 |
| repeat가 다른 절차 표면 | repeat가 픽셀 생성식에 사용되지 않는데도 모든 픽셀 재계산 | 기존 제한된 캐시의 동일 finish/pattern/contrast 픽셀을 읽어 독립 Texture/DataTexture로 복사 | 20 asphalt repeat 전후 실제 60개 맵 SHA·repeat·shared·cache 통계 동일. 단일 실행 6.601초 → 0.917초; 기존 overflow 소유권 검사 통과 |
| native Blender kit 테스트 | 2.52MB GLB와 0.56MB ZIP의 범용 객체 깊은 비교 비용 | 테스트의 바이너리 비교를 길이와 모든 바이트의 Buffer.compare로 대체. 생성·재생성·변조 차단 구현은 변경 없음 | 첫 kit 생성 0.432초, 반복 0.431초. 기존 4개 테스트 통과, 성공 사례 1.253초. 오차·해시 근사 비교가 아님 |
| implicit section 편집 | 매 샘플 고정 transform/trigonometry와 임시 Vector3 재생성 | polygonization 범위에서 primitive별 inverse/translation 준비, 동기 scalar 샘플별 scratch 재사용. Vector3.length와 동일한 sqrt 산술 | legacy/shaped × local/transformed 4개 actual attribute/index SHA 일치. 첫 최적화 뒤에도 5.255초 실패, 두 번째도 isolated 실패. 이 타임아웃 해결로 보고하지 않음 |

작은 표면 패턴과 큰 aggregate의 차이를 유지하며 CPU/GPU 메모리 예산을 늘리지 않았다. 새로운 픽셀 캐시를 추가하지 않았고 overflow texture는 여전히 개별 소유한다. 캐시에서 다른 repeat의 데이터를 읽어도 output texture payload는 독립 복사다.

암시적 곡면의 두 수정 가설 뒤에도 통과하지 않아 동일 테스트의 무작정 재실행을 중단한다. CPU 프로파일은 polygonization과 반복 topology/contact 검사 비용이 남아 있음을 보여준다. 다음 변경은 중복 검사의 수명과 정확한 입력 binding을 먼저 설계해야 하며 검사를 삭제하거나 이전 PASS를 재사용하는 방식은 허용하지 않는다.

## 증거와 제한

로컬 증거: `outputs/validation-cost-20261007/`. 실패 로그, 이전 구현 복사본, 프로파일, 독립 진단 스크립트, 전후 actual buffer SHA를 보존한다. 측정 환경 macOS arm64 / Apple M5 / Node 24.13.1. 한 번의 시간 측정은 통계적 성능 보장이나 모든 기기의 응답성 증거가 아니다.

현재 전체 실행 결과는 `execution.json`과 각 명령 log에 기록한다. 전체 검사를 순차 실행하며 관련 임계값·5초 timeout·원본 결합 UV 검사·엄격한 GLB byte 계약을 변경하지 않았다. 이 문서의 targeted 통과를 전체 gate 통과로 읽으면 안 된다.

실제 브라우저 파일 선택·저장·재열기는 미실행/기존 localhost 권한 차단 상태다. Blender 과거 실패 로그는 first import 전에 Metal backend 초기화 중 crash임을 보여준다. 현재 설치의 `--help`는 metal만 지원하여 존재하지 않는 OpenGL fallback으로 해결했다고 주장하지 않는다. Blender first import, GLB reexport, neutral render 모두 이번 단계 not-run이다. WebIO 재열기는 Blender 검증과 별도다.

코드 변경은 생성 검사 실행 비용을 줄이고 데이터 보존을 확인한다. 새나 복잡한 제품의 외형 품질이 개선되었다고 주장하지 않는다. 실무 납품 판정에 필요한 실제 UI와 대상 앱 증거가 없으므로 완료 및 GitHub 최신화 조건은 아직 충족하지 못했다.

## 현재 수정본 최종 실행

| 명령 | 실제 결과 |
| --- | --- |
| npm test | FAIL: 150파일 중149통과, 970테스트 중969통과/1타임아웃. implicit section 복합 recipe 5.216초/기존5초 제한. 이전 baseline에서도 발생한 실패이며 해결 미완료 |
| npm run check | exit0 |
| npm run benchmark | exit0 |
| npm run build | exit0 |
| npm run quality:gate | exit1. quality 자체의 locked-case/expected-rejection rates는 전부1. 이어지는 competitive gate에서 기존 Blender cross-domain/import-edit receipts가 benchmarkAccepted=false. 예전 성공 영수증을 현재 수정본의 실행 증거로 승격하지 않음 |
| npm run quality:production | exit1. 내부 quality gate 실패 때문에 dominance 실행은 not-run |

전자 조립 domain 자체는 여전히 production/evidence52/90 차단이다. 이 expected rejection을 올바르게 거부한 것을 플랫폼 납품 성공으로 보지 않는다. 이 단계는 관련 임계값과 원래 거부를 유지했다. `benchmarkAccepted=true`인 예전 다른 앱 receipt 역시 이번에 그 앱을 새로 실행했다는 의미가 아니다.

실제 GLB 진단 `implicit-attempt2/implicit-glb-parity.json`: sphere/capsule/box/cone/ellipsoid 각각 local/transformed10입력. 9입력은 수정 전후18개 실제 GLB가 모든 바이트 동일하며 Khronos0오류/0경고·WebIO재열기 통과. transformed box는 기존/현재 모두 resolution28에서 동일한2 non-manifold 오류로 거부된다. 원래 첫 시도는 이 실패에서 종료됐고 로그와 이미 생성된 파일을 보존했다. 두 번째 진단은 입력이나 예산을 바꾸지 않고 양쪽 오류까지 비교해 결과를 분리했다. 실패 사례를 합격시키거나 제품 생성 계약을 변경하지 않았다. 이 GLB는 `diagnostic:true, deliveryApproved:false`이며 일반 납품 승인 파일이 아니다.

남은 한 작업: implicit 복합 recipe의 반복 polygonization/contact/topology 검사 설계와 수명을 진단하고, 변조된 입력은 계속 재검사하면서 동일 입력의 중복 작업만 줄인다. 2개 최적화 가설 뒤에도 실패했으므로 같은 검사를 다시 돌려 우연한 PASS를 얻는 방식은 중단한다. 현재 전체 판정 INCOMPLETE이며 새로운 형상 기능 확대나 GitHub push 조건 충족으로 처리하지 않는다.
