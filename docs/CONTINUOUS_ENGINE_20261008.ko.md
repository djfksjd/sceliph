# 연속 엔진 고도화 — 수정 경로와 실제 bevel

전체 엔진 완료는 아직 아니다. 이번에는 한 작업 뒤 멈추는 대신 선언 수정 경로 구현→실제 이전 실패 검사→새 수치 holdout→실제 기하 bevel→UI 연결→현재 전건검사로 이어갔다. 완성도 퍼센트를 추가하지 않는다. 이전 내부70% 검증표는 전체 품질 수치가 아니다.

##1. 선언 수정 경로

`src/engine/declaration-correction.ts`의 `correctRequiredDeclaration`은 올바른 최초 선언에 추가 추론을 쓰지 않는다. 독립 요구사항과의 불일치만 최대1회 수정 대상으로 삼는다. malformed source/잘못된 요구사항/지원하지 않는 geometry에는 자동 수정을 호출하지 않는다. 같은 요구사항으로 최종 답을 다시 검사하며, 재실패는 예외로 반환하고 부분 프로젝트를 적용하지 않는다. callback은 호출자가 제공한다. 기본 외부 모델/API 의존성 없음. 취소된 늦은 답과 generator 내부 취소 모두 적용을 거부한다. 네트워크 요청 취소/timeout은 inference callback 소유자 책임이며 이 helper의 active predicate가 물리적 요청 중단이라고 주장하지 않는다.

`DomainRequestMismatch`에는 선언·요구사항·원인·maximumAttempts1의 `sceliph.declaration-correction/0.1` data-only 피드백을 담는다. source import는 최신 실패의 피드백만 제공하고, 새 선택/복원 시 제거한다. Element Editor에 `Save correction feedback JSON`을 연결했다. 실패한 프로젝트 내보내기는 계속 차단한다. 사용자에게서 얻은 요구사항을 모델 답으로 바꾸지 않는다. 파일 저장 기능이며 외부 메시지/API 전송이 아니다.

수정/요구사항 계약은 별도0.1이며 기존IR/job/patch schema는 변경하지 않았다. 사용자는 피드백을 자신이 허용한 모델에 전달하고 새 선언을 동일 요구사항으로 다시 불러올 수 있다. helper의 inference 협업은 선택적인 API이며 자동 서비스가 시작된 것은 아니다.

##2. 실제 모델 결과

기존 `novel-parameters-20261008`의 최초2/6PASS·4/6FAIL은 보존했다. 같은4실패에 피드백을 넣고 후보 전체·seed·temperature0.7을 유지한 실제 모델 수정은4/4PASS. 실제 IR 저장/재열기·GLB 바이트 일치·독립 validator를 통과했다. 현재4수정 답을 SDK에 적용한 native source도 실제 파일 proof와 같다.

새 값(plate72×21×6.2mm/9.5mmbore;gear module2.25/36teeth/25deg/7mmface/12.5mmbore)을 **실행 전** 고정해 seed11/23/47로 검사했다. 최초2/6PASS. 해당4실패에1회만 수정:3/4PASS, **plate47은 다시 실패**. 최종5/6이며 전체 holdoutFAIL이다. 추가 재생성/후보 제거/seed 선택/score 변경 없음. 초기와 수정 데이터를 분리한다. 원래 실패4건 수정 성공을 신규 요청 전반의 정확도 향상으로 세지 않는다.

이번 실제 model choices: 이전 오류 수정4+새 최초6+새 수정4=14. 기존 설치된 Qwen3/0.6B CPU4threads, 외부UNI_AI/Claude/API0, 추가설치0. 가중치/LLM-generated shape 모델을 추가하지 않았다.

##3. 실제 기하 bevel

`src/engine/plate-bevel.ts`의 `product.beveled-plate` Pack을 기존 extrude/bevel·editPart·validateProject 위에 구현했다. Component ID는 기존 `plate_body`, native schema0.6. 운영revision `sceliph.centered-plate-bevel/0.1`. 기존 centered-plate Pack과 출력은 그대로다. 새로운 ID로 등록해 기본 동작을 덮지 않는다.

cap 사각형을 요청 bevel만큼 안으로 보정하고 base extrusion 깊이를2×bevel만큼 줄인다. 기존 Three extrusion bevel이 외형과 끝깊이를 다시 확장해 최종 요청 폭·높이·두께를 유지한다.128각형hole의 bevel 오프셋은 sec(pi/128)로 보정해 straight bore land의 꼭짓점 지름을 유지한다. Bevel은3segments mesh 표현이며 제조용 CAD fillet/BREP/공차승인으로 주장하지 않는다. wall/cap/thickness 여유가 부족하면 전체 생성을 거부한다.

크기0.5/1/2에서 actual vertex bbox·bore·strict topologyPASS. 세 경우 각각2112triangles,100k budget 이하. 또 다른35×12×3mm/hole0/r0.5 경우와 registered default도 topologyPASS. 전체기하에 ID별 예외를 넣지 않았다.

실제12GLB(각 scale baseline/zero/bevel/reopened). zero bevel은 이전에 보존한 source와 GLB 전체bytes가 정확히 같다. bevel native source 재열기도 전체 GLB bytes가 같다. 기존 `inspectMeshExport`의 strictstandard/UV 검사를 통과했다. 외형 치수와 bore land는 유지하지만 corner/cap silhouette는 의도된 bevel만큼 바뀐다. 실측 원자료/beautyrender 성공으로 주장하지 않는다.

첫 구현은 editPart에 허용되지 않은 evidence patch를 넣어 실패했다. 검증 계약을 약화하지 않고, 실제 geometry patch 이후 새 생성물의 evidence를 작성한 뒤 validateProject했다. 시도 로그 보존. 통합 과정에서 선택적parameterNotes 타입 처리도 type/buildFAIL을 냈으며 `??[]` 처리 후 현재전건검사를 다시 통과했다. 실패 로그를 삭제하지 않았다.

기준선은 `tests/fixtures/plate-bevel`에 고정해 CI가 ignored outputs에 의존하지 않는다. `src/ElementEditor.tsx`, `src/WorkspaceEditor.tsx`는 기존 registry에 이 Pack을 등록한다. generic 수치 입력에서 edgeBevelMm을 사용한다. 새 UI 복제/새 dependency/기존compiler 변경 없음. React 검사: 새 hook 없음, existing parameter labels/error semantics 활용, correction button은 최신failedstate에만 표시된다. 실제 browser 조작은 not-run이다.

##4. 현재 검증

`outputs/continuous-engine-20261008/final-verification`:

- npm test:160files/1024testsPASS.
- npm run check, npm run benchmark, npm run build:PASS.
- npm run quality:gate, npm run quality:production:FAIL. 기존 Blender cross-domain evidence와electronics52/90은 남는다. dominance는 앞gate 실패로 not-run.
- git diff --check:PASS.

기존source-boundUV/per-tooth5%·normal/accessor·엄격한GLB bytes 계약은 변경하지 않았다. 이번 type/build 회귀는 수정했으며 최종검사에서 새 회귀는 관측되지 않았다.

브라우저는 기존localhost/filesecuritydenial,Blender는 기존Metalstartupcrash로 not-run. source geometry 수치/UV 검증과 실제 target app/가까운 거리 shading 품질/독립실무자 검수는 별개다. 과거 앱 영수증을 현재 PASS로 사용하지 않았다.

##5. 경로·해시·재현

현재체크아웃 `/private/tmp/sceliph-publish-20261007`,branch `engine/lathe-connectivity-20261007`,HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 기존 사용자/앞단계 변경을 보존했다. commit/push하지 않았다.

모든 입력·출력·현재source SHA·명령결과: `outputs/continuous-engine-20261008/manifest.json`,SHA `27f8383c184000b2923efd5295770280e0e7cc11eb64c74c8cb5655369fa0865`.
대표 bevel1.glb SHA `a146e277dc7bccaff79441371b926b4974a7df5e4b17d27a08d3839db057a348`.
독립 검수 ZIP `outputs/continuous-engine-20261008/independent-review.zip`,SHA `cf3454ce2bb828e2b1d6e0712e016568520b316abeac19d65879eb21b342a739`. 실제현재3크기asset/source·기존Blender 검사/중립렌더/attributecompare script·LICENSE·파일별SHA 포함. ZIP내용을 다시 읽어각SHA를 확인했다. README는검수 지침이지실행 영수증이 아니다. Blender firstimport/재export/normal/visualappearance를 구분해야 한다. ZIP생성만으로독립납품검증을완료하지 않는다.

재현(NEW 출력폴더):

```sh
./node_modules/.bin/vite-node scripts/plate-bevel-evidence.ts /private/tmp/sceliph-new-bevel-proof
./node_modules/.bin/vite-node scripts/correction-flow-evidence.ts
npm test
npm run check
npm run benchmark
npm run build
```

첫 명령은 actual current geometry/GLB를 생성한다. 두 번째는 현재 저장된 실제 수정 모델답을 SDK에 재적용하며 새추론이 아니다. 새holdout재추론은 `scripts/offline-qwen-ir.py`와 `outputs/correction-holdout-20261008/tasks.json`을 사용하고 모든 기존결과를 보존한 새출력dir에서 실행해야 한다. plate47재실패를PASS로대체하지 않는다.

##6. 전체목표와 남은조건

전체 완료/새로운완성도퍼센트/production-ready를보고하지않는다. 새입력 하나의LLM수정도 실패하며 원자료기반범용형상·캐릭터변형품질·실제앱납품·독립목적별검수가남는다.

실제browser/Blender를실행할수있는환경과실무자/검수자료를질문했다. 해당검사는 current source/outputhash가연결된새실행증거로필요하다. sandbox/GUI차단을다른포트·터널로우회하거나미검증단계를승격하지않는다. API재시작이나backgroundworker를설정하지않았다. 기존broadGoal도구는blocked상태이며resume/본문변경API가없다. 전체목표를완료처리하지않는다.
