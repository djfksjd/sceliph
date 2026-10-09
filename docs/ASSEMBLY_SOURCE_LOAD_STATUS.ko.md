# 2026-10-07 AssemblyIR 파일 선택과 저장 안전성

castor · DEBUG → BUILD → GATE, 현재 작업 트리의 Viewer 소스 불러오기·저장·편집 경계. 실행 위치 `/private/tmp/sceliph-publish-20261007`, branch `engine/lathe-connectivity-20261007`, HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 기존 변경을 보존했다. 이번30분 체크포인트/같은 결함 가설2회, 모델/API/패키지 설치/원격 write 없음. 도구 Goal 상태 변경 없음.

## 발견과 구현

F1 IMPORTANT(수정): 새 파일 선택 → 기존 flag는 normal kit/편집만 차단 → 기존 GLB/IR 저장 버튼과 handler는 이전 데이터를 저장할 수 있었다. 잘못된 파일이나 읽기 실패 뒤에도 SAVE IR에 검사 guard가 없었다. 기존 코드를 읽어 확인한 reachable static path이며 실제 브라우저 재현은 환경 차단으로 not-run이다.

`AssemblySourceLoadSession`은 기존 latest-intent gate와 `validateAssemblyIR`를 재사용한다. Viewer의 다른 소스 선택/만료/편집 취소와 같은 gate를 공유한다. reading/failed 상태에서는 저장·내보내기·편집 commit을 동기적으로 차단한다. 새 선택은 모든 대기/실행 export job을 취소하고 기존 viewport의 export sequence를 무효화한다. 늦은 read 성공/실패는 새 선택·취소·해제 상태를 덮지 않는다. 파일은 기존2MB 한도로 검사하며 원본 IR·GLB를 덮어쓰지 않는다.

실패하면 이전 유효 모델을 유지하고 잠금을 유지한다. `DISCARD FILE SELECTION`은 pending intent를 취소하고 그 모델로 명시적으로 복귀한다. 유효 파일을 다시 읽거나 다른 정상 preset을 선택해도 복구된다. 동일 JSON도 새 객체로 parse해 이전 editor history와 별도 새 source로 인식된다. 일반 native elements/workspace/CharacterIR은 이 AssemblyIR import 경로에서 새로 지원하지 않는다.

`ViewerApp`의 SAVE IR/NETLIST, GLB/OBJ/STL/PLY/USDZ/SVG/PNG/asset pack, normal kit, receipt 저장에 ready guard를 연결했다. queue enqueue와 실제 action 시작에도 검사한다. component commit/layout edit에도 동기 guard를 둔다. child recipe/component의 optional `isSourceCurrent` callback은 React rerender 전에 소스가 막혔을 때 늦은 결과가 receipt/history를 변경하는 것을 방어한다. 이 타이밍은 실제 React/browser에서 재현한 것이 아니며 controller의 captured-guard 검사와 static trace를 근거로 한다. 기존 boolean sourceCurrent와 optional prop 기본값은 하위 호환이다.

수정 파일: `src/assembly-source-load.ts`, `src/ViewerApp.tsx`, `src/AssemblyComponentEditor.tsx`, `src/AssemblyPrimaryRecipePanel.tsx`, `tests/assembly-source-load.test.ts`. IR/recipe/patch schema, 기하 생성, UV/normal 기준, releaseAllowed 및5초 timeout은 변경하지 않았다. React Best Practices의 동기 guard/async ownership/기존 hooks·a11y를 점검했다. 스타일·범용 UI 구조 재작성 없음.

## 실제 검증

- 최신 `npm test`:152파일/985테스트 전부 통과(exit0,104.56초). 신규6테스트는 deferred 교체, read 실패, stale success/failure,2MB 사전 차단, 잘못된 schema/단위, restore/external cancel/unmount, 동일 JSON 새 parse, rerender 전 captured guard를 검사한다.
- `npm run check`, `npm run benchmark`, `npm run build`:exit0. `git diff --check` 통과.
- `quality:gate`, `quality:production`:exit1. 기존 Blender cross-domain/edit receipt의 current acceptance 부족을 그대로 차단하며 전자 조립의 production/source 근거52/90을 유지한다. 이번 source load 회귀로 분류하지 않는다. production dominance는 선행 gate 실패로 not-run이다. 과거 앱 성공 영수증은 현재 실행으로 승격하지 않았다.
- 실제 파일 경로(`file-flow.ts`): 창작 bird study의 원본 source JSON 보존 → session으로 실제 파일 읽기 → 선언형 양쪽 wing section 변경 → 수정 source 저장 → 새 session으로 실제 파일 재읽기 → 추가 wing_left radii 편집 → beauty GLB 재생성. 최초 수정/재열기 GLB의 전체 bytes 동일. 세 GLB 모두 Khronos0오류/0경고와 WebIO 재열기 통과. 추가 편집은 실제 target payload를 바꾸고 나머지 모든 mesh의 position/normal/UV/index/material/node/parent 정보를 보존했다. 바이트/원본/계층 증거는 `file-flow.json`, `non-target-payload.json`에 기록한다. 원자료 없는 조류의 해부학·정확도 평가가 아니다.

모든 로그·입출력·SHA는 `outputs/assembly-source-load-20261007/`에 있다. macOS arm64/Apple M5/Node24.13.1. 실제 파일/controller/engine 경로는 실제 브라우저 다운로드가 아니다.

## 차단과 판정

현재 기본 `npm run dev`는 `listen EPERM: operation not permitted 127.0.0.1:4173`으로 exit1이다. Playwright CLI는 설치되어 있지 않으며 wrapper가 npx로 패키지를 요청하므로 실행하지 않았다. 권한 차단을 다른 포트/GUI/외부 호스팅/file URL로 우회하지 않았다. 실제 브라우저 조작·다운로드·새 탭 재열기·스크린샷은 blocked/not-run이다. Blender first import/reexport/render도 이번 단계 not-run이며 normal drift 해결을 주장하지 않는다.

castor 판정: source load controller/현재 코드 회귀와 실제 로컬 파일 보존 범위 PASS. 전체 사용자 UI 흐름의 합격 판정은 INCOMPLETE다. 실무 납품/production-ready 선언과 GitHub 최신화 조건은 충족하지 않았다. 다음 한 단계는 localhost 리슨이 허용되고 브라우저 도구가 설치된 환경에서 같은 실제 입력으로 OPEN RESULT → recipe 적용 → SAVE IR → 새 세션 OPEN RESULT → GLB 다운로드와 추가 편집을 검증하는 것이다.
