# 사용자 필수 수치 반영 — 전체 완료와 구분

## 실제 변경

남은 모델 실패는 스키마가 아닌 요청 숫자의 잘못된 선택이었다. 같은 입력/seed를 무작정 다시 생성하지 않았다. 사용자가 독립적으로 제공한 필수 숫자를 명시적으로 반영하는 선언형 연산 `sceliph.parameter-binding/0.1`을 구현했다. 모델 정확도 향상이 아니라 엔진의 수치 확정 작업이다.

`src/engine/parameter-binding.ts`:

- 원래 선언 text와 requirements text 각각의SHA256을 검증한다. 잘못된/오래된 fingerprint는 거부한다. caller의 fingerprint object도 await 전에 복사한다.
- 같은 지원 Pack/mm/right-handed-y-up과 등록 input 계약만 지원한다. Pack/좌표계/capability/재질/source를 수리하거나 다른 분야로 대체하지 않는다.
- 독립 요구사항에 적힌 숫자만 새 선언의input에 반영한다. seed 등 비대상값,capabilities,materials를 유지한다. 원본text/현재native IR을 덮어쓰지 않는다.
- 최종 독립 requirements→기존 generator/validation 경로를 다시 실행한다. geometry가 불가능하면 결과를 반환하지 않는다.
- before/after 변경 목록과 original/requirements/outputSHA를 영수증으로 제공한다. 재반영은changes0과 동일 선언으로 끝난다.

`src/engine/domain-requirements.ts`의 기존 requirements parser를 재사용 가능한 함수로 분리했다. strict 요구사항 검사 의미는 그대로다. 기존IR/job/patch schema 변경 없음. 별도operation의0.1이며 미래/미지원 요구사항은 기존처럼 거부한다.

`src/ElementEditor.tsx`: 적격 requirements 불일치 실패 화면에 `Download declaration with required numbers`를 추가했다. 현재프로젝트와원본파일은보존하고 새선언+영수증을저장한다. 사용자가 새파일을검토/불러와생성한다. 기본자동반영/모델호출이아니다. 파일·요구사항·선택·화면상태가바뀌면 늦은hash/생성완료의다운로드와메시지를버린다. 무관한UI재작성없음.

## 실행 증거

현재 `correction-holdout-20261008`의 실제6응답을 그대로사용했다. 사용자요구값으로명시적반영한6사례는 actualsourceJSON/GLB12개에서 topology/Khronos/WebIO/strictUV/native재열기전체bytes/반영재실행동일성PASS. `strict-files/report.json`이현재엄격한검수 결과다. 초기files도보존한다.

**원래 모델의 최초2/6PASS·한번수정후5/6PASS/전체FAIL은 그대로다.** 이엔진연산을 modelinference나모델수정성공으로합산하지않는다. 새추론/외부API/UNI_AI/Claude 호출0. 새로운후보를추가하거나잘못된후보를삭제하지않았다. sourcegeometry/변경기록/파일bytes를검사했으며 metadata성공flag만추가한것이아니다.

테스트3개: 대상수치만변경/비대상선언보존/원본불변/반복동일성,stale·다른pack/frame/capability/material거부,불가능한최종geometry와await중caller object변경을검사한다.

현재코드 전건검사:

- npm test:161files/1027testsPASS.
- npm run check, npm run benchmark, npm run build:PASS.
- npm run quality:gate, npm run quality:production:FAIL. 기존Blendercross-domain proof `benchmarkAccepted:false`와electronics52/90이남는다. dominance는앞gate실패로not-run.
- git diff --check:PASS.

기존UV5%/normal/accessor/GLBexactbytes검사를완화하지않았다. 현재검사에서새회귀는관측되지않았다. 전체품질게이트를끄거나실패를기존성공자료로대체하지않았다.

## 사용·재현

Editor에서 독립요구사항을지정하고 불일치선언을선택한다. 실패화면의 새버튼으로필수숫자를반영한JSON과receipt를받는다. 변경값과원본SHA를검토한뒤 새선언을같은요구사항으로불러온다. 생성후의native저장파일은요구사항입력을비운기존native경로로재열기/추가편집한다.

```sh
./node_modules/.bin/vite-node scripts/parameter-binding-evidence.ts /private/tmp/sceliph-new-binding-proof
npm test
npm run check
npm run benchmark
npm run build
```

출력dir은새폴더여야한다. 이runner는현재저장된실제모델응답/독립요구사항을사용한다. 새로운LLM실행이아니다. 무관한사용자데이터는보내지않는다.

경로 `/private/tmp/sceliph-publish-20261007`,branch `engine/lathe-connectivity-20261007`,HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 기존사용자변경을보존했다. commit/push/추가dependency설치없음.

현재source SHA·모든입출력 SHA·명령/환경: `outputs/parameter-binding-20261008/manifest.json`,SHA256 `b7a46bfb8d4927da8ec466a28e1707abc5cf1f11fd0110376c3d0881ab14a01e`.

## 전체 목표의 차단과 다음 조건

전체엔진100%완료/새완성도퍼센트/production-ready를보고하지않는다. 필수숫자반영은새·인체·복잡한기계의부품구조/유기적곡면/사진깊이/리깅/물리물성의정확도를대신하지않는다. 요구사항이나원자료에없는숨은정보를정확히복원하지않는다.

실제UI·Blender는기존localhost/filesecuritydenial과Metalstartupcrash로이번에도not-run. 첫import/재export/normal/shading/사용자다운로드·재열기와독립전문가평가는새증거가없다. 전체gate의electronics52/90은원자료근거부족이며추정정보를observed로바꿔통과시킬수없다. 해당검수환경·원자료·독립검수자료를요청한질문은미응답이다.

다음으로전체완료를판단하려면 정상실행검수환경에서현재hash의asset로실제UI/Blender/독립목적검수를수행해야한다. 지금의자동테스트·수치반영을해당증거로대체하지않는다. 이전검수ZIP `outputs/continuous-engine-20261008/independent-review.zip`은실행지침+파일이며PASS영수증이아니다.

기존broadGoal도구는blocked상태이고resume/목표본문수정API가없다. 이번실제코드작업은현재지시에따라수행했으나자동재시작설정/전체목표완료로표시하지않는다.
