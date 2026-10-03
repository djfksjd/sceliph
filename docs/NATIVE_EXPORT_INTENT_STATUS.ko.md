# Native elements 내보내기 intent 취소 — 2026-10-04

기준 HEAD `d285077b8f641da7576d72f87a163d55be236553`. 이번 단계는 일반 GLB/UV 진단/선택 부품과 진단 톱니 내보내기의 늦은 완료를 차단한다. 소스 스키마·기하 생성·normal·UV 계산·기존 임계값은 변경하지 않았다.

## 재현과 수정
기존 코드는 async 완료 때 `currentProject === project`만 확인했다. 파일 선택 후 읽기가 실패하거나 같은 프로젝트에서 선택 intent가 바뀌면 이 객체는 그대로다. 실제 브라우저에서 exporter를 한 번 지연하고 파일 읽기를 실패시켰을 때 이전 GLB/source/UV 보고서 3개가 다운로드됐다. 기본 기어의 기존 UV 실패 경로에서는 늦은 export 오류가 새 파일 읽기 오류를 덮었다.

기존 `loadTicket`을 내보내기 시작 시 캡처하고 다운로드 및 오류 반영 전에 함께 비교한다. 실제 unmount guard와 finally의 scene dispose/진단 checker 복원은 유지한다. JSON 읽기 완료와 실패에도 기존 mounted guard를 명시했다. 버튼/파라미터/선택/파일 intent 변경 시 진행 중인 결과는 폐기된다. 작업량 자체의 중단을 주장하지 않는다.

## 현재 증거
- `npm test`: 120 files / 835 tests PASS. check, benchmark, build PASS.
- 실제 유효한 기어 source 로드 후 읽기 실패와 선택 intent 변경: 이전 다운로드 0. 최신 읽기 실패 메시지 유지.
- 실제 같은 기어의 axialChamferMm를 제거한 지원 입력에서 진단 톱니 cut exporter를 지연: 선택 intent 변경 후 다운로드 0. 지원하지 않는 chamfered cut 거부도 유지했다.
- 정상 내보내기 GLB/JSON/UV 보고서 3개 저장. source JSON 내용 보존. 새 독립 브라우저 세션에서 실제 저장한 JSON 재열기와 재생성: GLB 및 source JSON 전체 SHA 동일. UV 보고서는 실행별 영수증을 포함하므로 전체 바이트 동일을 주장하지 않는다.
- 실제 GLB Khronos errors/warnings/infos 0, 독립 read PASS. Blender 5.2.1 기본 import→재export→재import 기존 semantic roundtrip PASS, bounds drift 0 mm. 이 검사로 strict normal 보존을 주장하지 않는다. strict normal 별도 비교는 not-run.
- 실제 textured 기어는 optional Float32 normal helper가 명시적으로 거부했다. 지원 범위를 넓히지 않았으며 native-elements normal-kit UI 연결은 아직 구현하지 않았다.
- quality:gate/quality:production exit 1. 기존 cooling 및 competitive 실패가 남아 있으며 production-ready가 아니다. 이번 수정은 gate 계산이나 compiler revision을 바꾸지 않는다.

## 재현
저장소 루트에서 agent-browser와 로컬 Vite 4179 필요. 증거 폴더를 `work/native-export-selection-20261004`로 복사한다. `python3 work/native-export-selection-20261004/reproduce.py after read-failure` 및 `... after selection`은 실제 exporter를 한 번 지연하고 stale 다운로드 0을 assert한다. 최초 before 결과는 수정 전 실행이며 현재 코드에서 재사용한 PASS 자료가 아니다. fresh browser 생성 시 새 session 이름을 사용한다.

UI 준비 전 파일 업로드, 상대 경로 upload의 NotReadableError, 종료 직후 같은 browser session 재시작의 about:blank 실패는 검증 환경 문제로 기록했다. 이후 절대 경로와 새 독립 session의 실제 로드 완료로 확인했다. 기존 fixture의 chamfered tooth cut은 지원하지 않는 입력이라 거부되었으며, 이를 테스트 통과로 세지 않았다.

증거: `benchmarks/modeling-slices-20261004/native-export-intent`, 현재 source 해시와 파일 SHA는 manifest.json. 원본 체크아웃은 byte 비교 후 이번 자체 변경만 동기화한다. 다음 한 작업은 textureless native elements source를 실제 대응 검증 후 optional normal-kit 경로에 연결하는 것이다.
