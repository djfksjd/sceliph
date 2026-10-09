# 선언 응답 평가 계약 0.2

현재 평가 엔진 revision은 `sceliph.model-response-evaluation/0.2`다. 제품 생성 IR/renderer/schema는 변경하지 않는다. 기존 task0.1은 기존 치수·관통·토폴로지 계약으로 계속 읽힌다. 새 task0.2는 각 critical part에 `geometry`를 필수로 받는다. `validatePartGeometry(..., true, true)`를 재사용하며 전체 선언의 모든 키/배열/값을 순서 독립 객체 비교로 확인한다. 허용 연산/범위는 기존 sphere/lathe/extrude/spur-gear 검증과 같다. 치수·관통·토폴로지는 실제 생성 메시에서 함께 검사한다. 자연어 request는 라벨이며 자동 요구 추출은 지원하지 않는다.

재현 결함: 24teeth × module1.5와 32teeth × module39/34는 외경39mm가 같다. 폭8mm와 bore4mm도 같으면 기존task0.1이 둘 다 통과했다. 이는 기존 검사 범위의 빈틈이다. 0.2에서 올바른 기하 선언을 고정하면 잘못된 톱니 수/모듈은 독립 critical check에서 FAIL한다. 기존 계약의 임계값과 fail 정책을 낮추지 않는다.

마이그레이션: `migrateModelResponseTask(oldTask, { [partId]: explicitGeometry })`. 모든 대상의 명시적 유효 기하가 필요하며 누락/추가 ID, 잘못된 연산·범위, future version,0.2의geometry 누락을 거부한다. 입력과 출력은 JSON 복사로 분리된다. 자연어에서 기하를 추측하거나 실패한 응답에 맞춰 기대치를 생성하지 않는다. optional tessellation 값의 생략과 명시도 다른 계약이며, 정확한 선언 비교를 임의 오차 비교로 바꾸지 않는다.0.1은0.2로 자동 승격되지 않는다.

재현:

```sh
npm run evaluate:model-response -- outputs/goal60-evaluation-inputs/task.json outputs/goal60-evaluation-inputs/correct.json NEW_CORRECT_DIRECTORY
npm run evaluate:model-response -- outputs/goal60-evaluation-inputs/task.json outputs/goal60-evaluation-inputs/wrong.json NEW_WRONG_DIRECTORY
```

첫 명령exit0, 두 번째exit1이 기대 결과다. 실제 task/response/evaluation을 별도 저장하고 SHA를 기록한다. 새 디렉터리만 쓰며 기존 실패 자료는 덮어쓰지 않는다. fixture는 synthetic conformance이며 `modelRunVerified:false`, `eligibleForLLMQualityClaim:false`를 유지한다. LLM 자체의 생성 품질이나 실측·제조 정확도를 검증했다고 주장하지 않는다. 이번 평가 확장은 CLI 경로이며 브라우저 평가 패널을 추가한 것이 아니다.
