# 60% 요청 체크포인트 — 실제 달성 55%

기준 작업 트리 `/private/tmp/sceliph-publish-20261007`, branch `engine/lathe-connectivity-20261007`, HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 로컬 미커밋 작업이며 GitHub main의 완료 상태가 아니다. 기존 사용자 변경/45점/50점 자료와 실패 산출물은 보존했다. 이번 요청 목표60점은 미달성이다. Goal 도구의 paused 상태를 resume/완료로 변경한 것은 아니다.

## 이번 구현과 가설 기록

1. 가설: 외경 검사만으로 톱니 수·모듈이 다른 기어를 구분하지 못한다. 재현: 24×1.5와32×39/34가 동일 외경39mm·폭8mm·bore4mm를 갖고 task0.1 모두PASS. 수정: task0.2의 필수 explicit geometry를 기존 validator로 검증하고 critical part별 정확한 선언 비교를 추가했다. 결과: 실제 메시 치수는 같아도 잘못된 기하 선언FAIL; correct CLIexit0/wrongCLIexit1. 다음 판단:0.1 계약은 보존하되 새로운 정확한 과제에는0.2를 사용한다. fixture는 실제 LLM 응답이 아니므로 LLM 품질 점수는 올리지 않았다.
2. 가설: 혼합 분야 편집의 undo/redo/실패 격리가 저장 파일에서도 유지된다. 검증: gear+fur의6GLB를 생성하고 재읽기. undo/base,redo/edited,reopened/edited,provider-failure/edited 전체 바이트 동일. 타 분야의 모든 메시 속성·대상 geometry/normal/UV/index 보존,2mm 이동,선택 context 재열기 확인. cm/z-up/BREP 요청과 제어된 provider 예외를 거부하고 기존 파일 보존. 전체 사용자 UI가 아니라 기존 엔진/세션의 실제 파일 경로다.
3. 가설: 평균5%이하인 톱니 UV 손상도 실제 파일에서 차단된다. clean/damaged 각각 원본·이동4GLB를 디스크로 저장한 후 strict binding+UV검사를 재실행. clean PASS,damaged tooth_0003 FAIL,전체평균은5%이하. 손상GLB 자체는 Khronos형식PASS이지만 UV 의미검사는FAIL이다. 원본 참고metadata의 editable=false를 바꾸지 않았다.
4. 가설: toy triangle fixture 외에 실제 캐릭터의 스킨/클립도 파일 재생성에서 보존된다. 실제 OHPK+FIELD_HUMAN_SPEC을 저장·재읽고2GLB생성. whole bytes 동일,Khronos/WebIO PASS,2skinned nodes/22clips/185channels 보존,위치/UV/weight/time/value drift0. 독립 parser audit의 수치검사 외에 whole-byte equality도 별도로 필수 적용했다. 인체 해부학·극단 포즈의 체적/관통·외관 품질은 미검증이다.

## 현재 코드 검증

| 명령 | 실제 결과 |
| --- | --- |
| npm test |153파일/991테스트 PASS,95.88s |
| npm run check |PASS |
| npm run benchmark |PASS |
| npm run build |PASS |
| npm run quality:gate |FAIL(exit1) |
| npm run quality:production |FAIL(exit1),dominance는 short-circuit로not-run |

현재quality/competitive JSON은 HEAD 기록과 generatedAt만 다르고 나머지 내용은 동일하다. 비교 증거는 `outputs/goal60-verification-20261007/gate-classification.json`이다. 기존 Blender cross-domain/edit benchmarkAccepted=false,전자조립 production evidence52/90이 남아 있다. 이번 기능/991테스트에서 회귀를 발견하지 못했으며, 기존 범위 밖 evidence 실패를 제품합격으로 바꾸지 않았다. target app import 검사를 성공했다고 보고하지 않는다.

macOS26.4.1 arm64/AppleM5/Node24.13.1,renderer0.12. 추가 의존성·외부 모델/UNI_AI/Claude호출0. 순차 heavy 검증이며 작은 synthetic replay CLI만 test tail에 실행했다. 실행 시간은 일반 성능 보장으로 사용하지 않는다. checkpoint예산30분/같은 결함 가설최대2회를 유지했다.

## 점수와 증거

동결된20조건×5점,각조건4단계×1.25점을 그대로 적용했다. G3/E2/U1/X1의 C 실제파일 조건만 각각+1.25:50+5=55. 20A+12B+12C+0D=44단계/80단계다. 테스트 개수·GLB개수 자체를 점수로 쓰지 않는다. 실제 model prompt 성공률이나 외관 정확도55%라는 의미가 아니다.

점수: `benchmarks/engine-goal-progress-20261007-55.json`. 현재 모든 소스/scripts/tests/schema/config/OHPK 입력 fingerprint목록과 실제 실행/출력 파일SHA는 `outputs/goal60-verification-20261007/manifest.json` 및 `source-fingerprints.json`에 있다.

ManifestSHA256: `5c6293ed439e8ac79466117d58ba72c02befc6ddb2a7cbf1ed2557de94973d52`.
Code-fingerprintSHA256: `a617a733772163e65b8a9404bcef7157425eb1ddd1ef3dc63884d74b7ae8322e`.

현재12GLB + source/session/task/response/audit 파일:
- `outputs/goal60-history-complete-20261007`
- `outputs/goal60-uv-complete-20261007`
- `outputs/goal60-character-complete-20261007`
- `outputs/goal60-evaluation-correct` / `outputs/goal60-evaluation-wrong`

재현: `./node_modules/.bin/vite-node scripts/extended-artifact-evidence.ts NEW_DIRECTORY history`(또는uv/character). 기존 디렉터리 덮어쓰기 금지. 평가 계약/마이그레이션/CLI는 `MODEL_RESPONSE_TASK_V2.ko.md`를 따른다. 신규 변경 파일은 evaluator/test,extended-artifact-evidence runner,이 문서와v2계약,55점snapshot,현재plan/checkpoint 및 실행으로 갱신된quality timestamp다. 기존 UI/engine 변경은 앞 단계 작업으로 보존했다. 현재check 명령은 src/vite설정의 TypeScript를 검사하며 증거 runner는 실제 실행으로 확인했다.

## 60%에 못 미친 이유와 다음 작업

추가5점은 현재 미검증인 실제 모델 의미 정확도·실제 사진 정렬 또는 실제 사용자/대상앱 검수에서 확보해야 한다. 임의 fixture에 실측/LLM provenance를 붙이거나 D단계를 엔진 파일 검사로 대체하지 않는다. neutral render/closeup와 실제 브라우저 저장·다운로드·새 세션 UI는이번not-run. 앞선 localhost EPERM과 Blender Metal 초기화 crash는 남아 있으며 동일 실패를 재시도/다른 포트로 우회하지 않았다. Blender첫import/reexport 모두이번not-run이고 기존normal drift해결로 보고하지 않는다. 제조용BREP·물리승인·전분야완성을 주장하지 않는다.

다음 한 작업: 고정task0.2를 사용해 출처가 확인된 실제 LLM 응답의 critical-part/parameter 실패율을 검증한다. 재개 최소조건은 실제 응답 원문과 생성 provenance/사전에 고정된 기대 계약 또는 명시적으로 허용된 모델 호출 환경이다. 현재추가UNI_AI/Claude호출금지는 유지한다. 이후 실제browser/DCC가 동작하는 허용환경에서 D단계를 확인한다. GitHub쓰기 차단을 우회하지 않았고push하지 않았다. 전체production/60점목표는INCOMPLETE다.
