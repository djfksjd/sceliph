#70% 검증 마일스톤 — 전체 납품 완료와 분리

## 산정

기존 고정20항목×4gates=80, 각gate1.25점.65%의52gates에 **L6 새 요청/다중 seed/다분야 자동 검사와 실제 파일(B/C)**, **L3 원자료 비율/실루엣 자동 검사와 실제 파일(B/C)**를 추가했다.56/80=70%. 최신 표 `benchmarks/engine-goal-progress-20261008-70.json`. 가중치·분모·통과 조건은 변경하지 않았다. 이는 명시적인 엔지니어링 검증 진척 평가이며, 생성 정확도70%나 독립 전문가 평가가 아니다. 모든D 실제 UI/대상 앱/독립 목적 검수gate는false다.

**L6 범위:** 새로 고정한 요청 표현3개(plate/gear/bearing)×실제 모델 sampling seed11/23/47, temperature0.7.9/9critical casesPASS. 파라미터는 기존 알려진 계열이며, 신규 수치 조합의 일반화/자유 생성 확률/새로운 분야의 보장은 아니다. IR seed만 변경하거나 greedy replay한 것이 아니다.

**L3 범위:** 사용자가 제공했고 저장소에 보존된 원본 로고의 워드마크 crop. 엔진이 관측한2D 이진 윤곽을 계산하고 LLM이 제한된 선언 후보의 두께/스케일/구멍 보존 연산을 선택했다. 모델의 이미지 이해나 단일 사진에서의 입체 복원으로 주장하지 않는다. 원본2D 윤곽과 독립 재열기한 실제 GLB의 동일 정면투영이 일치한다. 전체 로고/후면/내부/실측깊이는 검증되지 않았다.

G4 실제 물체 사진의 깊이·카메라 정렬과 D2 현재 Blender 납품의B/C는 여전히 미충족이다. 플랫폼전체 production-ready가 아니다.

## 실제 구현

- `src/engine/planar-mask-relief.ts`: 이진 source mask→4-connected 편집 부품→외곽/실제 hole→기존 선언 extrude IR.2,097,152pixels/64부품/8,192경계edges/기존256점 및32hole 한도를 유지한다. 모호한 점접촉·빈 mask·비이진값·한도 초과·잘못된 치수/해시를 거부한다. 부품을 누락하거나 hole을 채워 통과시키지 않는다. 원본 기존 IR/compiler/검사 threshold는 변경하지 않는다.
- 새 연산 revision `sceliph.planar-mask-relief/0.1`, 기존 native schema0.6 결과. 신규IR필드/이전schema변경 없음. 내부 점은 기존mm coordinates, dimensionless uniform scale로 지정한 최종 치수를 만든다. source변경은 새 프로젝트로 취급해야 하며 componentID는 같은mask의 결정론적 scan-order에 대해서만 안정적이다.
- `scripts/offline-qwen-ir.py`: 명시적 experimental `choiceSeed`가 있을 때 실제 모델의 단일 선택 토큰을 temperature0.7로 sample한다. 기존 greedy 및 mean-log-probability ranking 경로는 그대로다. 불명확한 기존ranking을 통과시키는gap0.01완화가 아니다. stochastic mode는 별도계약이며 제품 기본 경로에 연결하지 않았다.
- `scripts/domain-invocation-evidence.ts`: sampledmode일 때 실제 strategy/seed/provenance를 검사한 뒤 기존 validation/export 경로로 생성·원본/재열기 전체 GLB 바이트 비교. 각중요조건을 개별 검사하며 전체평균으로 가리지 않는다.
- `scripts/planar-relief-evidence.ts`: 원본PNG SHA→명시적crop/threshold→bounded trace→실제 모델 응답 SHA→native sourceJSON→GLB→디스크 source재열기→정확한 GLB bytes→Khronos/WebIO→실제 정점의 정면 projection→기존 compareReferenceFrames의 global/각outline검사. 실제 파일world 두께도 검사한다.
- `tests/planar-mask-relief.test.ts`:4tests. 복수 부품/관통/topology, 무효입력/점접촉거부, 한도초과시전체거부, 실제 워드마크의 소수mm worldscale에서의 퇴화 방지와 치수보존.

## 시도와 원인

1.9sampled선택 입력·기대값·seed·temperature·전건criticalPASS 조건을 실행 전에 lock했다. 실제9건 모두 선택/재질/부품/치수/저장재열기/실제GLB 검사를 통과했다. model peakRSS2,930,376,704bytes, inference23.21초, CPU4threads,외부호출0.
2. 원본 로고 전체: 이진화된 얇은부분의 경계 점접촉이 모호해서trace가거부했다. `outputs/goal70-reference-20261008/prepare-failure.json` 보존. 임계값을 낮추거나 픽셀/부품을 버리지 않았다.
3. 동일원본의 워드마크만별도crop[300,720,950,100]으로 고정.7개윤곽/1개P hole. LLM1선택은 지정된240mm canvas/2mm두께/구멍보존 선언을 선택했다. 전체 로고 성공으로 합산하지 않는다. 모델peakRSS2,625,224,704bytes,inference23.39초.
4. 처음 실제 extrude는 **degenerateTriangles36** 때문에기존topologyFAIL. 경계/nonmanifold/winding/selfIntersection 문제는0이었다. 진단 actual Float32 capvertices는 세점이정확히공선이 되어면적0을보였다. 픽셀좌표를240/950의소수mm로 변환할 때 Earcut의 공선 판정이 반올림에 흔들렸다. polygon 내 연속공선점도1개확인.
5. 최소 수정: 연속공선점만기하변화없이제거하고, pixel grid를binary-exact meter격자(mm=1000/1024)에 놓은뒤uniformscale로최종240mm canvas/2mm두께를복원했다. 모델답이나검사tolerance를변경하지 않았다. 기존전역compiler를바꾸거나실패면을삭제하지않았다. 수정 후퇴화0/닫힘/일관된winding/selfIntersection0. 독립실제GLB의overall IoU1.0/7개feature 각각1.0. sourceJSON disk재열기후전체GLB바이트동일. 원본실패자료는 `diagnostic/topology.json`, `degenerate-vertices-v2.log`에남았다.

같은실패에대한새가설없는재생성없음. 이번모델호출은9sampled+1ranked, UNI_AI/Claude/외부3D/유료/API호출0. 추가패키지설치없음. optional offlinePython은기존설치환경이며기본npm의존성으로추가하지않았다.

## 현재 검증

현재 수정본 `outputs/goal70-final-20261008/execution.json`:

|명령|실제 결과|
|---|---|
|npm test|156files/1007testsPASS,90.81초|
|npm run check|PASS,2.84초|
|npm run benchmark|PASS,4.35초|
|npm run build|PASS,4.11초|
|npm run quality:gate|FAIL,11.37초|
|npm run quality:production|FAIL,11.55초;dominance는앞gate실패로not-run|

quality는로컬runner/fixture이며외부서비스/비용호출없음. 기존Blendercross-domain근거미달과electronics52/90이남는다. 이번기능의확인된topology결함은수정됐고현재회귀검사에서새회귀는관측되지않았다. 기존scope밖전자/Blender실패를이단계에서해결했다고하지않는다. source-boundUV5%와strictnormal/accessor/GLBbytes 검사는변경하지않았다.

실제브라우저는기존localhost/filesecuritydenial,Blender는기존Metalstartupcrash로이번실행not-run. firstimport와reexport모두새증거없음. UI클릭·다운로드·신규sessionimport/추가편집·중립3Dclayrender·독립실무자검수는여전히미검증이다.

## 파일·환경·해시

체크아웃 `/private/tmp/sceliph-publish-20261007`, branch `engine/lathe-connectivity-20261007`,HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. macOS/Darwinarm64,Node24. 기존사용자/다른단계변경은보존했다. 원격GitHub최신화/commit/push하지않았다.

현재소스·모든입출력·모델기록·검증log SHA: `outputs/goal70-final-20261008/manifest.json`.

- 원본로고PNG SHA `2b92a73a7628ddb2a7d2e4c570ec24b8f6618cf9d1b73ade11dc3c17cbc27c7d`.
- relief.source.json SHA `c96498824146b5f44ce1a2c4896900efcd0c973453e98eba9732aab1f0fcaf12`.
- relief.glb 및relief-reopened.glb SHA `719ba3bab704d68e096d5ca2f02d40973050ce34249a5f68b8fc5cba49e45d6f`.

실제sampled9사례는`outputs/goal70-stability-20261008/artifacts`에source/GLB원본9+재열기9, 워드마크는`outputs/goal70-wordmark-20261008/final-artifacts`에2GLB. 동일성검사를추가하기위한중간중복파일은별도성공사례로세지않는다.

동일정면의실제geometry대조: `outputs/goal70-wordmark-20261008/final-artifacts/same-view-difference.png`. 이는CPUbinaryraster이며beautyrender나재질/베벨검수이미지가아니다. 검은부분은source와GLBprojection의일치,red/green은차이를표시하도록생성했다. 해당crop의차이pixel은0이다.

재현(NEW 출력폴더는존재하지않아야함):

```sh
python3 scripts/offline-qwen-ir.py /private/tmp/sceliph-offline-qwen3-20261007/model-f32.gguf outputs/goal70-stability-20261008/tasks.json /private/tmp/sceliph-new-stability
./node_modules/.bin/vite-node scripts/domain-invocation-evidence.ts outputs/goal70-stability-20261008 /private/tmp/sceliph-new-stability /private/tmp/sceliph-new-stability-proof
./node_modules/.bin/vite-node scripts/planar-relief-evidence.ts verify outputs/goal70-wordmark-20261008 /private/tmp/sceliph-new-wordmark-proof
```

마지막명령은저장된현재실제모델응답을검증한다. 새모델실행은wordmark/tasks.json과NEW디렉터리로위Pythonrunner를사용하며base/model-run을덮어쓰지말고독립base를준비한다. sourceJSON은기존native sourceimport에사용가능한format이며CLI가실제parse→추가geometry생성→export를검증했다. 실제UI재열기가검증된것으로보고하지않는다.

## 남은 한 우선순위

입력숫자조합까지새롭게고정한held-out 요청에서자유/제약생성과실제criticalfailure/refusal/성공률을검사한다. 이번9건의알려진파라미터+새표현성공을그증거로재사용하지않는다. 이후실제UI/Blender환경차단해소와전건납품검증이필요하다.

이번70%마일스톤은달성했지만기존플랫폼전체연속Goal을완료처리하지않는다. 도구의broadGoal은기존blocked상태이며resume/본문수정API가없다. 도구재개나전체완료를했다고보고하지않는다. 이전65%/실패/시간기록은그대로보존한다.
