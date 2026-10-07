# native source 파일 교체 안전성 · 2026-10-07

## 현재 범위

실행 사본 /private/tmp/sceliph-refine-20261006의 ElementEditor native JSON load / edit / save / export 경로다. 이번에는 새 기하나 IR 스키마를 추가하지 않는다. 기존 parseProject, latest-intent, editPart, ElementHistory, UV/GLB 검사를 유지한다. 원본 파일과 이전 프로젝트는 보존하고 실패한 입력을 부분 적용하지 않는다. 새 외부 API/모델/의존성/push 없음. 정상 Git HEAD·branch 확인 및 실제 localhost UI 검증은 blocked다.

예산:30분 체크포인트, 동일 결함 수정 가설2회. JSON 기존2MB 한도 유지. IO를 abort한다고 주장하지 않고 superseded 응답을 무시한다. 전체 테스트·benchmark·quality gate는 순차 실행한다.

## 원인과 변경

기존 Load JSON은 loadTicket으로 당시 진행 중인 export와 늦은 load 적용을 억제했지만, 실패 후 그대로 남은 이전 project로 사용자가 다시 save/export를 시작하는 경로는 차단하지 않았다. 선택→실패→이전 프로젝트 버튼 재클릭으로 이전 소스가 새 결과처럼 저장될 수 있었다. before-ElementEditor.tsx와 changes.patch의 handler/control static trace로 확인한 결함이며 실제 브라우저에서 재현했다고 주장하지 않는다.

- src/element-source-load.ts: 기존 latest-intent token을 재사용하는 reading/failed/ready 소스 세션. 새 선택 시 즉시 blocked, 실제 parse 성공 후 ready. 이전 결과/오류는 token 및 mounted active 검사로 폐기한다. 과대 파일은 IO 전에 차단한다.
- src/ElementEditor.tsx: 파일 handler를 세션에 연결. 읽기중/실패에서 save/project export/normal kit/recipe/undo/redo를 비활성화하고 run·export·save handler에도 동기 ref guard를 넣었다. 원래 프로젝트는 화면에 보존한다. UV receipt·recipe receipt 및 PartInspector는 unresolved 동안 숨긴다. 독립 BoundReferenceUvPanel은 수정하지 않는다.
- 복구는 새 유효 파일 선택, 명시적 Discard import and keep current project, 또는 명시적 새 Domain Pack 생성이다. 자동으로 이전 소스를 성공 처리하지 않는다. 읽기 실패의 이전 geometry/UV/data를 파괴하지 않는다.
- 같은 JSON의 성공적인 재열기도 sourceRevision으로 PartInspector key를 변경하므로 session-only Fit 상태를 이전 화면에서 재사용하지 않는다. 원래 part ID·geometry JSON·IR 스키마는 바꾸지 않는다. 이 remount 연결은 static trace이며 실제 browser click은 not-run이다.
- tests/element-source-load.test.ts: 실제 native bearing parse·translation·추가 edit, selection race, stale success, latest read failure, oversized/malformed source, explicit restore, unmount late success/failure, 반복 동일 source 재열기 등을 검사한다.

## 확인 범위

사용자는 Load JSON으로 native elements source를 선택한다. reading/failed에서는 원래 프로젝트가 남지만 작업 버튼은 차단되고 파일명·원인·복구 방법을 표시한다. 새 유효 입력을 고르거나 가져오기를 명시적으로 취소하여 이전 프로젝트로 돌아갈 수 있다. 성공 후 기존 Save project JSON / Export selected or project GLB+source JSON을 사용한다. 원본 GLB translation→modified native IR 생성 계약, 톱니별 UV5% 기준, strict whole-byte GLB 규칙은 이번에 변경하지 않았다.

비지원 스키마, parseProject가 거부하는 값은 그대로 실패한다. 임의 DCC mesh→IR 역변환, 회전/스케일 부모 확대, 사진 복원, 리깅, Blender drift 수정은 범위 밖이다.

## 실행 증거

outputs/element-source-load-20261007: 변경전 파일, diff, targeted/full-test/check/build/benchmark/quality 로그, 현재 코드 SHA를 연결한 manifest. Impeccable detector는 정적 검사이며 UI screenshot/키보드 조작/실제 다운로드·재열기 성공으로 해석하지 않는다.

실제 브라우저: localhost4179 응답 없음(curl exit7 / HTTP000). 이전 file:// 보안 거부·서버 권한 차단을 우회하지 않았다. 이번에는 실행하지 못한 사용자 흐름을 완료로 승격하지 않는다. 신규GLB 및 Blender first import/reexport/중립render는 이번기하변경이 없어 not-run이다. 기존 GLB 영수증을 이번 browser 증거로 재사용하지 않는다.

판정: source-session 코드 검증과 실제 사용자 흐름 전체 완료는 분리한다. 다음 한 작업은 정상 Sceliph localhost에서 파일 선택→지연/실패/교체→명시적 복구→저장·재열기·추가편집·GLB 다운로드를 실제 조작 확인하는 것이다.

## 최종 실행

- targeted 2파일 8테스트 PASS. 전체 151파일 976테스트 PASS (129.31s). 기존 UV/translated-source 검사를 포함하며 skip·시간제한·5% 기준 변경 없음.
- npm run check / build / benchmark: exit 0.
- Impeccable 정적 detector: exit 0, []. 실제 화면·키보드 검증은 아니다.
- quality:gate / quality:production: exit 1. 변경 전과 현재 electronics-production-evidence 및 electronics-evidence 실패는 동일한 52/90이다. production 이후 dominance는 not-run.
- 신규 GLB·browser 다운로드/재열기·Blender import/reexport: 이번 단계 not-run. native IR을 사용하는 코드 테스트가 실제 화면 검증을 대체하지 않는다.

사용자 경로는 viewer-main.tsx의 ?editor=elements → ElementEditor → Load JSON/save/export다. 실제 화면 수용 판정은 INCOMPLETE. manifest.json이 현재 코드·테스트·로그 SHA와 package-lock을 연결한다.
