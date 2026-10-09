# 2026-10-07 고정 평가표50점 체크포인트

기준은 `benchmarks/engine-goal-progress-20261007.json`의20조건×5점, 단계당1.25점이다. 가중치·조건·최종 사용 검수 요구를 변경하지 않았다. 현재 로컬 작업 트리 기준이며 GitHub main 상태와 구분한다. HEAD24b541f/branch engine/lathe-connectivity-20261007 위의 기존 변경을 보존했다. Goal 도구는 기존 paused 상태이며 이 문서 작성으로 resume/완료 처리하지 않았다. 이번 실행은30분 checkpoint/같은 결함2가설 한도, 추가 모델/API/새 의존성/원격 write 없음.

## 구현

`src/engine/model-response-evaluation.ts`와 `scripts/evaluate-model-response.ts`는 선언 응답을 현재 native parser/compiler로 실행하고 실제 메시를 검사하는 로컬 replay 경로다. 새 task schema0.1은 최초 도입이며 기존 IR/patch/job schema는 변경하지 않는다. 알려지지 않은 task version/field, 중복 ID, 범위 초과, 잘못된 source를 실패시킨다. 최대32개 중요 부품/100000삼각형, task64KiB/response2MB. 부품 로컬 축 치수에는 실제 part scale을 반영한다. 중요 부품 누락·치수 오차·실제 중심 관통·폐쇄 topology·orientation·자원 예산을 개별 검사하며 한 실패를 평균으로 숨기지 않는다.

request 문장은 task 라벨이며 이 도구가 자연어를 해석하거나 모든 요청 의미를 검증하는 것은 아니다. 초기 지원은 static native part projects다. AssemblyIR/CharacterIR, generated groups/elements, 완전한 의미·해부학·제조 검수는 이 evaluator의 지원 범위가 아니다. 모델 호출도 하지 않는다. 모든 결과의 modelRunVerified/eligibleForLLMQualityClaim은false다. 코드가 있다는 이유로 실제 LLM 성공률이나 holdout 일반화 점수를 부여하지 않는다. 기존 source import/UV/export와 별도 explicit CLI이며 제품 기본 생성 경로를 교체하지 않는다.

`scripts/native-delivery-slice.ts`는 기존 gear/bearing/part surface/분리·복원/native export를 연결한 재현 가능한 실제 납품 파일 검증이다. 데이터·파일·실제 accessor/PNG 픽셀을 검증하며 검사 라벨만 추가한 것이 아니다. 새 기하 생성기·신경 모델·제조 CAD 정확도는 추가하지 않았다.

## 실행 증거

현재 `npm test`:153파일/990테스트 전부 통과. check/benchmark/build exit0. quality:gate/production exit1은 기존 Blender cross-domain/edit 영수증 current acceptance 부족이며 electronic source/production52/90 차단을 유지한다. dominance는 선행 gate 실패로 not-run이다. 새 evaluator 회귀로 분류할 근거는 없고 기존 실패를 통과로 바꾸지 않았다.

작은/기본/큰 베어링: source 저장·실제 full GLB, ball_0000 분해, IR 재열기 후 복원, 독립 ball source/GLB, 독립 source 재열기 후1mm 추가 편집. 복원 GLB는 전체 bytes 원본과 같고 비대상 position/normal/UV/index/transform/parent 및 scalar PBR 보존을 확인했다. 볼 자체의 이동은 actual geometry/UV/index를 보존하며 world1mm를 적용했다. 실제 race 중심 관통도 확인했다. 부품은 창작 시각화 구조이며 제조사 공차/하중/운동학 승인 데이터가 아니다.

작은/기본/큰 기어: 실제 생성 flank 오차0.005×module 기준 유지, actual GLB 정점에서 bore/outside diameter/face width0.01mm 검사, brushed-metal material 변경, source 재열기 후 whole GLB bytes 동일. 재질 변경으로 position/normal/UV/index/transform이 바뀌지 않는다. GLB에 embedded된 roughness PNG를 독립 decode해 원래 RGBA와 정확히 비교하고 KHR_texture_transform repeat8×8 보존을 확인했다. UV repeat는 선언된 가공 시각화이며 실측 roughness/물리적 texel scale로 표기하지 않는다. 다른 finish/full micro-normal/decal/사진 bake 납품으로 확대하지 않는다.

총24개 실제 GLB는 Khronos0오류/0경고, WebIO재열기 통과했다. source/GLB/pixel SHA와 파일 규모는 `outputs/goal50-20261007/native/report.json`에 있다. browser/Blender는 이번 단계not-run이며 neutral render도not-run이다.

평가기의 첫 CLI replay는 요청한module1.5/직경39mm에 기본module1/직경26mm 응답을 넣어 실제 치수 실패로exit1이었다. 그 실패 report와 response는 보존한다. 계약을 바꾸지 않고 요청 파라미터에 맞는 명시적 synthetic 응답을 생성한 별도 replay-requested는exit0, 같은 파일의replay-repeat도exit0이며 evaluation 내용과 입력SHA가 동일하다. 이것은 controlled conformance이지 실제 LLM 출력의 안정성 평가가 아니다. 추가5테스트는 good/bad 응답, 중요 특징 하나의 실패, missing part, triangle budget, 잘못된 schema/range 및 wrong part scale을 확인한다. 반복 CLI는 전체 검사 tail과 일부 겹쳤으므로 wall-clock을 성능 비교로 사용하지 않는다.

## 점수 변경

| 조건 | 추가 단계 | 점수 | 근거 |
| --- | --- | --- | --- |
| L6 새 요청·반복·holdout 안정성 | A 작동하는 평가 기반만 | +1.25 | 실제 replay CLI/실제 메시 평가 코드. B/C/D 실제 모델 검증은false 유지 |
| G2 기계 부품 구조·파라미터 | C 실제 파일 | +1.25 | 서로 다른3기어/3베어링의 실제 메시·관통·치수·GLB 검증 |
| E4 하위 요소 분리·복원·독립 export | C 실제 파일 | +1.25 | 실제 bearing ball 분리/복원/재열기/추가 이동, 원본whole-byte 일치 |
| U2 PBR·표면 납품 보존 | C 실제 파일 | +1.25 |3크기 actual embedded PNG RGBA/반복/PBR geometry 보존 |

45+5=50. L1~L5 의미 해석 정확도 점수, 모든 D 실제 사용자/대상 도구/독립 용도 검수는 그대로다. 동일 report가 여러 조건에 쓰여도 G2의 실제 구조 치수, E4의 별도 분해·복원, U2의 별도 픽셀/texture assert를 구분한다. 테스트 개수 증가 자체는 점수 근거가 아니다.

## 사용과 남은 범위

`npm run evaluate:model-response -- task.json response.json NEW_DIRECTORY`, `./node_modules/.bin/vite-node scripts/native-delivery-slice.ts NEW_DIRECTORY`로 재현한다. 출력 디렉터리가 있으면 덮어쓰지 않는다. 실패 출력도 보존한다. 입력은 별도 선언형 JSON이며 임의 코드·shell·provider URL을 실행하지 않는다.

정해진 평가표의50점은 확보했지만 실무 납품/production-ready가 아니다. localhost EPERM, 현재 실제 UI 미검증, Blender normal drift 및 전체gate 실패는 남는다. GitHub push 조건은 실무 사용 증거와 쓰기 권한이 충족될 때까지 보류하며 기존 호스트 승인 거부를 우회하지 않는다. 다음 핵심 우선순위는 허용된 환경에서 실제 LLM 응답을 고정 과제에 수집하고 의미·중요 특징 실패율을 측정하는 것이다. 권한/크레딧 없이 새 provider를 호출하지 않는다.
