# 60% 재개 요청 — 소스 결합 수정, 점수55 유지

대상 `/private/tmp/sceliph-publish-20261007`, branch `engine/lathe-connectivity-20261007`, HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 기존 변경/45·50·55 기록/실패 자료를 보존했다. Raptor를 수정하지 않았다. 현재 Goal 도구는paused이고 resume/objective 변경 API가 없어 도구 상태를 변경했다고 보고하지 않는다. 사용자 재개 요청에 따라 가능한 로컬 작업은 계속 수행했다. checkpoint예산30분/동일결함 수정가설최대2회 유지.

## 재현·원인·수정

`visual-plan-provider-adapter`의 신규3검사가 수정 전 모두FAIL했다(원래4검사는PASS).

- null/숫자 fingerprint 소스: 타입 확인 전에 ID/set/hash 정규화를 실행해TypeError.
- front/rear ID의SHA를 서로 교환: 모든SHA가 존재한다는 검사만 통과해 의미상 잘못된사진 결합도PASS.
- null feature/숫자label/null observedCounts: `auditVisualPlan` 내부의 타입 연산TypeError로 중단.

최소수정: 소스레코드/문자열을 먼저 검사한 뒤 중복 검사. 이미 선언된 authoritative source ID는 동일SHA에만 연결하도록 거부. 기존 provider alias는 유지한다. JSONparse후semantic audit의TypeError는fail receipt로 반환하며 부분plan을 게시하지 않는다. 비TypeError 운영 실패는 그대로전파한다. sourcekind는 기존처럼불변SHA근거가 있는 경우에만수정하며 geometry/count/editability/추정플래그는 올리지 않는다. schema0.1/기존API를 유지한다.

수정 후 adapter8+audit8=16 targeted검사PASS. 이전실패 요약과수정전소스는 `outputs/goal60-resume-20261007/baseline-failures.json`, `adapter-before.ts`에 보존했다. 실제 기록된ChatGPT응답에서도 원본PASS/사진ID-SHA교환FAIL/feature손상FAIL을 별도파일로 저장해재확인했다. UI생성경로를 추가하거나기하생성을완료한변경은아니다. 기존사용경로는응답adapter/CLI다.

## 실제 자료 조사와 현재 재검사

과거3개모델응답원문을 `/Users/danny/Documents/Codex/2026-08-30/g/work/llm-web-comparison/provider-responses.json`에서찾았다. 세응답 모두pinned metadata의responseSHA와같다. 실제front/right/rear/left 사진도원본SHA를확인해별도보존했다. 이는새모델호출이아니고기록된입력을현재엔진으로replay한것이다. 출처SHA일치는기록일관성증거이며암호학적provider인증이아니다.

현재replay: chatgpt의visual-plan PASS,claude/gemini는반복요소독립편집선언부족으로FAIL. 계약을느슨하게하지않았다. 중요한한계: 모두visual-plan0.1이고AssemblyIR/native기하IR/GLB가없다. 계획의통과를3D생성성공·반복프롬프트성공률로확대하지않는다. 당시응답이름은providerlabel이며현재정확한모델버전은재인증하지않았다.

실제ABO사진/기준GLB18개를현재corpus검사로다시읽어무결성/형식/근거검사PASS(45,574,263bytes). 현metric scale pilot도실행했다. 결과의PASS는목록치수보다오차가개선됨만뜻한다. 기준GLB대비최대축오차램프157.323mm/팬34.127mm가남았다. 정확한사진복원PASS로표시하지않는다. 절대카메라자세·독립landmark/투영근거부족이남아있다. 예전hull실패를새성공으로재사용하거나새가설없이반복생성하지않았다.

## 현재검증

| 명령 | 결과 |
| --- | --- |
| npm test |153파일/995테스트PASS,105.80s |
| npm run check |PASS |
| npm run benchmark |PASS |
| npm run build |PASS |
| npm run quality:gate |FAIL(exit1) |
| npm run quality:production |FAIL(exit1);dominance not-run |

quality/competitive결과JSON은HEAD와생성시각만다르고나머지내용은동일. 기존Blender cross-domain/edit benchmarkAccepted=false와electronics production evidence52/90이남는다. 현재회귀검사에서새실패를발견하지못했지만전체납품/production-ready는아니다. 브라우저및Blender첫import/reexport/중립렌더는이번not-run. 기존localhost EPERM/Metal초기화crash를다른포트·권한우회로재시도하지않았다.

macOS26.4.1arm64/Node24.13.1. 추가UNI_AI/Claude/API호출0,새의존성0,push0. heavy검증은순차실행. 테스트tail에작은기록응답probe만실행해일반성능향상비교로쓰지않았다. 모델원문/자료를외부로전송하지않았다.

## 점수·증거와 재개 조건

동결된55점조건을유지한다. 이번고도화는잘못된입력수락과예외중단을해결했지만,새로운B/C/D합격조건의기하·실사용증거는확보하지못했다. 따라서55→55,60목표는INCOMPLETE. 실제LLM기하IR/현재UI·DCC/실제사진정확도중추가4단계×1.25점이필요하며계획JSON만으로채우지않는다.

현재snapshot: `benchmarks/engine-goal-progress-20261007-55-resume.json`.
Manifest: `outputs/goal60-resume-20261007/manifest.json`.
ManifestSHA256: `3fad1aac7d53f59f88f77788055a4d40309d50d7faae3f9f3065e4a16f10ba13`.
Source-fingerprintSHA256: `0c12f184f6f283d41f25c01825f74245c0a0ac7be4f2728711edb008b9f4ab8c`.
전체current source/scripts/tests/schema/config/inputSHA,실행로그,원문·사진SHA,변조검사파일은manifest와source-fingerprints를따른다. 코드수정파일은`src/engine/visual-plan-provider-adapter.ts`, `tests/visual-plan-provider-adapter.test.ts`다. 문서·현재점수snapshot·gate실행시각은별도변경이다.

재현: `./node_modules/.bin/vitest run tests/visual-plan-provider-adapter.test.ts tests/visual-plan-audit.test.ts`, `./node_modules/.bin/vite-node scripts/audit-visual-plan-provider-responses.ts outputs/goal60-resume-20261007/recorded-provider-responses.json`. corpus/scale/full명령은execution.json의정확한argv로재현하며새출력디렉터리를쓴다.

다음한작업은출처와원래요청이있는실제LLM생성기하IR을고정task0.2로검증·GLB재생성하는것이다. 사용자에게기록된폴더경로를질문했고답변은아직없다. 새모델호출금지는유지하며응답계획을임의기하로완성해모델이작성했다고표시하지않는다. 검증할기하IR/기대계약또는허용된호출환경이필요하다. 다른재개경로는실제browser/Blender검증이가능한허용환경이나독립landmark가있는사진자료다. 없는근거를추정해60달성으로보고하지않는다.
