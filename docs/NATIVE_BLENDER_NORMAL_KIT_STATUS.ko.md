# Native elements Blender normal kit — 2026-10-04

기준 HEAD `d368e3508b7dc3ca6264814c9e93e023e1718128`. compiler 0.41 / element renderer 0.12 유지. 이번 단계는 현재 단일 textureless native part 소스의 GLB와 편집 가능한 JSON을 ZIP으로 보존하고 기존 Blender 5.2 FLOAT_VECTOR normal importer를 선택적으로 제공한다. 기본 Blender importer를 교체하거나 DCC 메시를 IR로 역변환하지 않는다.

## 사용자 흐름
`/?editor=elements`에서 지원 native JSON을 Load JSON으로 연다. 기존 topology/UV 검사를 통과한 현재 소스에서 **BLENDER 5.2 · NATIVE NORMAL KIT**를 누른다. ZIP의 `source.json`은 이 화면에서 재열어 부품 수치 편집을 계속할 수 있다. ZIP을 풀고 README의 명령을 실행해야 Blender import가 수행된다. 브라우저 다운로드만으로 import 완료를 표시하지 않는다.

작은/기본/큰 베어링과 textureless 기어의 실제 브라우저 ZIP 저장 성공. 기본 베어링 반복 ZIP 전체 바이트 동일. 새 독립 브라우저에서 ZIP의 JSON 재열기→원래 ZIP과 동일하게 재생성→ball_0000의 Position X 15→17 mm→Apply part edit→새 kit 저장까지 확인했다. 수정하지 않은 JSON 필드 모두 동일. 실제 GLB의 X 이동은 +0.002 m이며 로컬 POSITION/NORMAL/UV/index의 전체 BIN과 비대상 scene/PBR/hierarchy가 동일했다. 마지막 UI 문구 변경 후 실제 저장 ZIP도 동일했다.

## 소스 대응과 실패 차단
기존 parseProject/serializeProject/exportSelectedScene을 재사용한다. 실제 원본 GLB의 단일 sourceSpec, 현재 renderer revision, mm/right-handed-Y-up, selectedIds와 저장할 selection을 확인한다. 저장 IR 값과 GLB의 IR 값이 일치한 뒤 원본 IR에서 **전체 GLB를 재생성해 바이트 일치**를 요구한다. 불일치는 실패이며 부분 ZIP을 제공하지 않는다. 원본 GLB는 수정하지 않는다.

처음에는 serializeProject의 키 정렬 때문에 메타데이터 JSON 순서만 달라져 양성 테스트가 실패했다. BIN은 동일했고 JSON 의미 차이는 없었다. 값의 일치를 검증한 원본 IR 키 순서를 재생성에 유지해 전체 GLB 일치를 보존했다. BIN/normal 요구를 오차 비교로 바꾸지 않았다. 잘못된 소스/selection, 실제 NORMAL 바이트 변조, 실제 혼합 workspace를 신규 테스트에서 거부한다.

현재 파일/선택 ticket과 프로젝트/mounted guard를 재사용한다. 실제 두 번째 exporter 재생성 완료를 지연시킨 뒤 파일 읽기 실패를 발생시키면 이전 ZIP 다운로드 0이며 최신 읽기 오류가 유지된다. 기존 원본 결합 UV 및 톱니별 5% 검사는 그대로다. texture 있는 기어는 실제 UI에서 거부되고 ZIP 0이었다. generated feather/strand/group 및 혼합 workspace 버튼은 비활성화한다. rig/animation/morph/required extension 및 예산 초과는 기존 import profile로 거부한다.

## 실제 Blender 증거
다운로드 ZIP의 실제 포함 스크립트로 Blender 5.2.1 LTS에서 네 source GLB를 import: 34 mesh의 source normal 적용 최악 오차 0°. 저장 `.blend` 해시 확인과 재열기→볼 또는 기어 +1 mm native 이동→저장·재열기에서 로컬 positions/normals/UV/loops 동일, source JSON 불변. 이 native 이동은 source JSON에 역반영됐다고 주장하지 않는다. reexport된 34 mesh의 별도 원본 NORMAL 비교 최악 0.004427907932898632°로 기존 0.01° 기준 통과.

9개 실제 GLB의 Khronos 검사와 독립 read PASS. errors/warnings 0이지만 베어링 등에는 unused UV infos가 남아 있다. strict production acceptance를 주장하지 않는다. 기존 cooling/competitive 실패로 quality:gate와 quality:production exit1, dominance not-run. 기본 Blender 첫 import의 이전 normal drift는 이번 선택형 importer와 별개로 남아 있다. 제조 정밀도·하중·인간 전문가 평가는 not-run.

## 버전·호환
native kit manifest **0.2**는 기존 0.1 필드에 sourceKind=native-elements, sourceSchema, rendererRevision을 추가한다. 지원되지 않는 소스를 0.2로 표시해 성공시키지 않는다. 기존 AssemblyIR kit는 **0.1 그대로**이며 현재 builder에 이전 실제 input을 넣은 신규 실행에서 이전 ZIP과 전체 바이트 동일했다. 기존 manifest를 이름만 바꿔 native로 승격하는 마이그레이션은 없다. native IR 스키마 0.1..0.7과 기존 migration/selection codec은 변경하지 않는다. 기존 ZIP에서는 source.json을 해당 편집기로 열고 검증 후 새로운 kit를 생성한다.

## 검증·재현
121 test files / 839 tests PASS, check/benchmark/build PASS. 마지막 UI 이름을 SCELIPH · ELEMENT EDITOR로 맞추고 실행 안내를 추가한 뒤 check/build와 실제 browser export를 확인했다. topology/UV/GLB/compiler kernel은 변경하지 않았다. 시간 예산 30분, 자료 100MiB, 외부 API 호출 0; 실행 환경과 SHA는 result.json/manifest.json.

`benchmarks/modeling-slices-20261004/native-normal-kit`에 실제 ZIP/IR/GLB/Blender 파일·영수증·실패 및 성공 로그가 있다. 재현 스크립트는 저장소 루트 `work/native-normal-kit-20261004`로 복사해 사용한다. Vite 4179와 agent-browser 필요: `python3 work/native-normal-kit-20261004/browser.py`; fixtures.ts는 기존 생성기로 네 IR을 만든다. native-run.py는 실제 포함 helper로 import하고 reopen-edit.py는 `.blend` 재열기와 이동을 검사한다. compare-native.py는 기존 scripts/compare-native-normal-payload.ts로 모든 mesh를 검사한다. 출력 경로가 이미 있으면 Blender wrapper가 거부하므로 새 증거 폴더에서 실행한다.

다음 한 작업: native 일반 내보내기의 수정되지 않은 입력도 왜 UV integrity에서 차단되는지, 기본 기어의 톱니별 UV 실패를 독립 진단한다. textureless 기어 검증 사례의 uvScale=100은 기존 선언형 IR의 명시적 설정이며 기본 기어가 자동 수정됐다고 주장하지 않는다.
