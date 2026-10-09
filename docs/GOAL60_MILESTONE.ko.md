# Sceliph 동결 평가표60점 체크포인트

2026-10-08 KST. 기준 `/private/tmp/sceliph-publish-20261007`, branch `engine/lathe-connectivity-20261007`, HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 기존사용자변경과45/50/55점기록,실패자료는보존한다. 점수는현재로컬미커밋트리의공학적완료조건증거이며정확도·프롬프트성공확률·전문가평가가아니다. Github main/push상태와분리한다.

## 실제 구현

- `assembly-action-catalogue.ts`: 기존AssemblyIR를clone/validate하고원본fingerprint에묶인최대32개평행이동후보를생성한다. 허용된거리/축/방향/대상을후보로표현하며실행은기존component-patch0.1에맡긴다. 선언반지름의min/max로작은/큰구체설명을계산한다. 이계산은엔진이수행하며LLM이수치비교를정확히했다고주장하지않는다. 동일반지름은equal로표시한다. ID별예외없음,미지원형상/scale·과도한후보·잘못된amount/operationId를거부한다. fingerprintawait전에원본snapshot을복제하고현재소스변경후실행은기존stale검사로차단한다.
- `offline-qwen-ir.py`: 이미캐시된Qwen3 0.6B가중치와설치된CPU Transformers로네트워크없이실제추론을실행한다. 자유JSON생성과모델의허용후보점수선택을구분해기록한다. 후보선택은각설명의token log probability평균을계산한argmax이며점수차0.01이하동률은거부한다. 점수는정답확률이아니다. 대상·축·방향·거리는모델선택,patch schema/operationId/sourcefingerprint는엔진이소유한다. 이과정에서선택된JSON은엔진후보이므로LLM이그문자열전체를자유생성했다고표시하지않는다.
- `verify-offline-model-artifacts.ts`: 실제모델생산자receipt와responseSHA를검사하고기존parse/validation/compiler/export를재사용한다. 중요기하/치수하나의실패도차단한다. 실제sourceJSON과GLB를저장·디스크재읽기·재생성하고전체바이트를비교한다. 이동은world mm에서검사하며비대상position/normal/UV/index/재질/계층과대상의이동외속성을실제독립WebIO accessor로비교한다. stalepatch재적용도차단한다.
- package명령 `evaluate:offline-artifacts` 추가. 기존IR/job/component-patch스키마와기본생성경로는변경하지않았다. catalogue0.1은새실험적계약이고저장IR마이그레이션이필요하지않다. 로컬모델을앱기본의존성/HTTP서비스로추가하지않았다. UI에미검증자유생성자동적용을노출하지않았다.

## 실제 결과와 제한

| 과제 | 실제 결과 | 증거 범위 |
| --- | --- | --- |
| 지름12mm 구체 |PASS |실제모델선언radius6/32×16,치수0.02mm·토폴로지·GLB·저장재열기전체바이트 |
| 지름18mm 구체 |PASS |실제모델선언radius9/32×16,동일검사 |
| 20×10×4mm 중심판 |FAIL |모델은10×10×4mm와비중심좌표를선언;기존중요특징검사가차단 |
| 작은구체+Y2mm 이동 |PASS(후보선택) |24개대상/방향/거리후보중모델이object_beta,Y+,2mm를선택;실제수정IR/GLB재열기·비대상보존 |
| 큰구체-X3mm 이동 |PASS(후보선택) |모델이object_alpha,X-,3mm를선택;동일검사 |
| 자유형식수정JSON |FAIL |잘못된schema/대상/축,누락fingerprint,잘못된prefix결합을보존;성공승격안함 |

구체원문은1문자opening-brace assistantprefix가있는실제생성이다. prefix와모델rawsuffix/token IDs를별도기록했다. JSONfence를제거하거나geometry/target/movement값을손으로고쳐통과시키지않았다. 수정성공은자유JSON생성이아니라엔진의구체반지름관계설명을제공한후보선택이다. 비교설명이없는첫순위선택은작은구체의대상을틀렸고실패를보존했다. 새로운등록함수는소스반지름에서설명을계산하며원래작은/큰대상·이동기대계약을그대로유지했다.

최종구체생성3과제의전체실험은FAIL로남고판형상은지원성공으로세지않았다. 서로다른요청자산의2개구체성공만L1기초능력B/C근거로연결했다. L2/L3/L4/L6의추가품질단계는승격하지않는다. 올바른sourceJSON저장후첫GLB를컴파일하는기존직렬화경계를재사용했으며,모델원문순서로첫GLB를컴파일했을때메타데이터key순서로전체바이트가달랐던실험도보존했다. 기존바이트검사를오차검사로바꾸지않았다.

## 점수 산출

이전55점의가중치/조건/단계1.25점을고정한다.

| 조건 | 추가 단계 | 추가점수 | 현재 근거 |
| --- | --- | --- | --- |
| L1 요청→유효선언IR |B자동/C실제파일 |2.5 |실제로컬모델이만든2개native구체IR와GLB저장·재열기 |
| L5 수정의도→대상/연산 |B자동/C실제파일 |2.5 |모델의2개후보선택과실제patch/IR/GLB/비대상보존 |

55+5=60.20A+14B+14C+0D=48/80단계. 신규모델추론실행근거를연결했지만pure evaluator의`modelRunVerified:false/eligibleForLLMQualityClaim:false`값은바꾸지않았다. 생산자실행/가중치/입력/출력SHA근거와검증기가알수없는메타데이터를분리한다. 전반적모델품질인증·사용자/DCC/독립전문가D단계는모두미충족이다. 원래실패를평균으로감추지않고별도자산/전략의지원범위를명시했다.

평가표: `benchmarks/engine-goal-progress-20261008-60.json`. 전체생성실험FAIL과전체productionFAIL은점수표에도명시한다.100점목표를달성했다고표시하지않았다. 기존Goal도구는오래된연속플랫폼objective와blocked상태이며resume/objective-edit API가없다. 이번60점체크포인트달성을기존플랫폼Goal전체완료로설정하지않았다.

## 현재 코드 검증

| 명령 | 결과 |
| --- | --- |
| npm test |154파일/999테스트PASS,88.69s |
| npm run check |PASS |
| npm run benchmark |PASS |
| npm run build |PASS |
| npm run quality:gate |FAIL(exit1) |
| npm run quality:production |FAIL(exit1),dominance not-run |

마지막operationId유형/선두문자guard와asyncsnapshot검사를추가한후현재수정본에서전체검증을다시실행했다. 이전실행998PASS도별도보존한다. catalogue거부검사의첫fixture는기존계약에없는box,두번째는roundedBox segments2여서기존검증이먼저거부했다. 실제기존minSegments3계약을읽고유효roundedBox segments4fixture로고쳤으며제품검증을약화하지않았다. quality/competitive결과는HEAD와generatedAt만다르다. 기존Blender cross-domain/edit benchmarkAccepted=false와전자조립evidence52/90실패가남는다. sourcecurrent검사에서신규회귀를발견하지않았지만전체납품합격은아니다.

Python기본py_compile은허용밖캐시쓰기때문에환경실패했고,메모리내syntax검사는PASS다. 실제모델추론도성공실행했다. 브라우저다운로드/실제새UI세션/Blender첫import/reexport/중립렌더·클로즈업은이번not-run이며이전접속/Metal차단을우회하지않았다. 현재개선은출력형식/선택/보존의좁은경로이며보이는형태의실무수준향상을렌더로검증한것은아니다.

## 환경·자원·재현

macOS26.4.1arm64/AppleM5,Node24.13.1,torch2.8.0,Transformers4.57.6,CPU4threads. 모델은기존522.6MB GGUF를설치된llama-quantize로F32해제해3,006,529,536tensor bytes를엄격하게로드했다. 원본캐시SHA는manifest와일치하고수정하지않았다. 초기2.5GB파일예산추정은별도outputembedding복사분을누락해,추론전3.1GB/프로세스6GiB예산으로정정했다. 실제각run peakRSS는run.json에있고실측을다른기기에대한속도보장으로쓰지않는다. 원본모델/변환모델/도구로그SHA는model-provenance.json에있다. 변환파일은 `/private/tmp/sceliph-offline-qwen3-20261007/model-f32.gguf`에보존하며저장소에넣지않았다.

RoPE非persistent meta buffer오류를CPU초기화로해결하고모든파라미터/buffer의materialization을검사했다. GGUF의think/endthink user-defined토큰이기존Qwen2converter에서3개일반토큰으로분해되는것을실측한후모델declared type3/4토큰을등록하고ID일치를검사했다. 실제모델응답/프롬프트재시도는원기대계약을유지했고2회이후실패한자유생성의반복을멈췄다. 원인재진단후32후보상한의선택설계로이어갔다. 각modelrun은최대640tokens/2048inputtokens/12tasks,이번3개자유생성task와2개선택task만사용했다. 후속선택/검증은별도checkpoint로이어가며기존시간을새시도시간으로재표시하지않았다.

외부UNI_AI/Claude호출0,새모델다운로드0,새패키지기본의존성0,push0. 기존gguf설치실패뒤다른인덱스를우회하지않고,설치된오프라인파일변환도구/라이브러리만사용했다. 실제로컬자유생성응답15개,ranked선택4개(두전략),초기추론실패1개를보존했다. 사용자사진/원자료/키를외부로보내지않았다. 호스트에이전트과금이0이라고보장하지않는다.

재현명령:

```sh
python3 scripts/offline-qwen-ir.py /private/tmp/sceliph-offline-qwen3-20261007/model-f32.gguf outputs/goal60-local-20261007/creation-tasks-retry2.json NEW_MODEL_DIRECTORY
npm run evaluate:offline-artifacts -- creation outputs/goal60-local-20261007 outputs/goal60-local-20261007/creation-run4 NEW_CREATION_PROOF_DIRECTORY
python3 scripts/offline-qwen-ir.py /private/tmp/sceliph-offline-qwen3-20261007/model-f32.gguf outputs/goal60-local-20261007/edit-ranked-v2-tasks.json NEW_RANKED_DIRECTORY
npm run evaluate:offline-artifacts -- edit outputs/goal60-local-20261007 outputs/goal60-local-20261007/edit-ranked-v2-run NEW_EDIT_PROOF_DIRECTORY
```

기존디렉터리는덮어쓰지않는다. creation검증exit1은판형상실패가남아있는기대결과다. editionexit0이성공이다. 기존UI의elements원본불러오기에서`creation-proof3/*.source.json`,Assembly LOAD IR에서`edit-ranked-v2-proof/*.source.json`를사용할수있다. 이번실제브라우저조작검증은없으며CLI+독립parser확인범위만주장한다.

Manifest: `outputs/goal60-local-20261007/manifest.json`.
ManifestSHA256: `3c4069d0559e8c7c28a406c4a53f46bfb051bcdaedf5371b2c2b0cd4179512ff`.
Source-fingerprintSHA256: `9e1d657a7f2e088259c558438f80b035a86d25e3067cd3a0c0b9b1c2dc2091e3`.
개별입력/출력/source/GLB/normal·UV·index비교·실행로그SHA는manifest와보고서를따른다. 같은원본2sphere source,모델응답,선택rank scores까지보존한다.

다음우선순위는판/loft같은형태를원점·치수파라미터로선언하게하고기하좌표는엔진이계산하는경로를검증하는것이다. 자유JSON정확도,새분야/새요청holdout,실제UI/DCC납품과전문가품질은남아있다. 이번요청60점체크포인트에서정리하고실무납품/전분야완성을선언하지않는다.
