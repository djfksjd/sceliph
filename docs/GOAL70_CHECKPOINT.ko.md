#70% 목표의 현재 체크포인트:65%, 미달

## 실제 변경

`src/engine/centered-plate-pack.ts`: 새 제품 시각화 Domain Pack. 선언한 mm 폭/높이/두께와 실제128분할 관통을 기존 extrude로 생성한다. XYZ 중심은 기존 렌더러 정책이다. 치수·벽 간격·입력/frame을 거부하며 기존 IR 버전을 변경하지 않는다. 새 임의 기하 코드 실행이나 외부 의존성이 없다.

`src/engine/domain-invocation.ts`: 별도 선언 계약 `sceliph.domain-invocation/0.1`. 등록 generator, 기존 input/capability validation과 editPart 재질 경로를 사용한다. 잘못된 버전·단위·좌표·capability·중복/없는 재질 대상을 거부하고 부분 프로젝트를 반환하지 않는다. 기존 sourceJSON은 변경하지 않는다. 이 신규 호출 계약에 과거 버전은 없으며 미래 버전은 거부한다. surface 편집은 해당 기존 source schema가 지원할 때만 가능하다.

`src/ElementEditor.tsx`, `src/WorkspaceEditor.tsx`: 기존 generic registry에 pack 등록. 새 생성기 선택→mm 수치→생성→기존 부품 편집/history/sourceJSON 저장·불러오기·내보내기 경로를 사용한다. TSX 검토: 추가 hook/effect/비동기 수명 없음, 기존 레이블·범위·오류 표시 사용. 실제 브라우저 조작은 not-run이다.

`tests/centered-plate-pack.test.ts`: 실제3크기 bbox/XYZ 중심/관통/topology, 계약 오류와 재질 실패의 원자성, 직접 입력 경계. `scripts/domain-invocation-evidence.ts`: 현재 실제 로컬 모델 응답 SHA→호출→native IR 파일→GLB→독립 Khronos/WebIO→디스크 IR 재열기→정확한 전체 GLB 바이트 동일성.

## 가설·시도·판단

1. 이전 자유 생성 plate가20mm를10mm로 계산한 결함: LLM에 꼭짓점 계산을 맡기지 않고 치수를 받는 등록 generator 추가. 실제3크기 테스트PASS.
2. 입력 계약과 기대 값은 추론 전에 `outputs/goal70-20261008/contract.json`에 고정. 기존 캐시 Qwen3/0.6B CPU4threads, 외부 호출0. 후보 순서를 바꾸고 잘못된 폭·관통·재질도 포함했다. 실제6선택 중5PASS/1FAIL. 무광 비금속 요청에 금속 scalar를 선택했다. 첫 실험 전체는FAIL로 보존.
3. 숫자만으로 재질 의미가 부족하다는 가설: 모든 후보에 실제 scalar에 따른 appearance 설명을 보강. 별도 retry 계약 고정, 추가1선택. 기대 값·score gap0.01·치수0.01mm 동일. 무광 platePASS. 성능/일반 프롬프트 정확도로 확대하지 않는다.
4. 실제 메시 확인 중 기존 extrude가Z도 중심에 맞추는 점 발견. 새 pack 설명을 실제 좌표 정책으로 수정하고Z 중심·실제 bore 정점 지름을 추가 확인. 초기/강화 실패 기록은 삭제하지 않았다.

추론 예산: 최초6선택+명시적 재진단1선택. 동일 실패의 추가 생성은 하지 않았다. 모델은 유한한 엔진 후보를 평가/선택하며 자유 생성으로 주장하지 않는다. seed42..47은 IR seed이며 stochastic LLM 다중 seed 안정성 증거로 세지 않는다.

## 현재 실행 결과

`outputs/goal70-20261008/verification/execution.json` 및 해당 log:

- npm test:155files/1003tests PASS,93.14초.
- npm run check:PASS,2.86초.
- npm run benchmark:PASS,4.16초.
- npm run build:PASS,4.36초.
- npm run quality:gate:FAIL,11.41초.
- npm run quality:production:FAIL,11.26초. gate 실패로 dominance 단계 not-run.

게이트는 로컬 runner/저장 fixture 기반이다. UNI_AI/Claude/유료 호출 없음. 기존 Blender cross-domain 증거 미달 및 electronics52/90 실패는 이번 plate/model 기능 범위 밖이며 해결했다고 보고하지 않는다. 기존 per-tooth UV5% 및 엄격한 normal/GLB 바이트 비교를 변경하지 않았다. 새로운 기능의 회귀는 현재 검사에서 관측되지 않았다.

작은/큰 기어, 기본 베어링,3개 plate/material 사례에서 실제 성공 파일12개(원본 생성6+재열기6). 첫 실험 성공5건과 별도 재검사1건을 합산한 수이며 첫 실험6/6PASS가 아니다. 추가 강화 검사의 중복 파일은 신규 성공 사례로 세지 않는다. GLB bbox/관통/PBR scalar/embedded PNG pixels/UV repeat 및 topology/triangle budget을 검사했다. 재질 값은 창작 appearance이며 실측 물성은 아니다. 부드러운 bevel·제조 trochoid·CAD/BREP·새/인체 실사 품질이 추가 검증된 것은 아니다.

## 현재 파일·해시·환경

실제 체크아웃 `/private/tmp/sceliph-publish-20261007`, branch `engine/lathe-connectivity-20261007`, HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 기존 사용자/앞 단계 미커밋 변경을 보존했다. GitHub main이 이번 로컬 코드라고 주장하지 않는다. push하지 않았다.

`outputs/goal70-20261008/manifest.json`: source files SHA, 모든 실제 입력/출력/모델 로그 SHA, 환경, 현재 검증 logs. 원본 cached model SHA `7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa`.

대표 source `retry-artifacts/plate-polymer.source.json`: SHA `6fb327a44f70ef8ecbea179bc6f37d28c29fafec1a713bf6053ad8d4dde52b1a`.
대표 GLB `retry-artifacts/plate-polymer.glb` 및 reopened: SHA `960ae2447cb3ebe0f6b4846387c4074f12c18905b638af08938aad95f13cbce3`.

재현(마지막 출력 디렉터리는 존재하지 않아야 함):

```sh
python3 scripts/offline-qwen-ir.py /private/tmp/sceliph-offline-qwen3-20261007/model-f32.gguf outputs/goal70-20261008/tasks.json /private/tmp/sceliph-goal70-new-model
./node_modules/.bin/vite-node scripts/domain-invocation-evidence.ts outputs/goal70-20261008 /private/tmp/sceliph-goal70-new-model /private/tmp/sceliph-goal70-new-proof
```

예상 첫 실험은 무광 재질 선택FAIL을 포함하며 verifier exit1이다. 성공 기록으로 치환하지 않는다. retry 재현은 `retry-contract`/`retry-model`을 사용한다. optional offline Python 환경은 기본 npm 설치 의존성이 아니다.

## 평가 및 재개 지점

고정20항목×4gates=80. 기존48gates(60%)에 L2 구조 선언B/C, L4 재질 선택B/C만 추가:52/80=65%. 최신 표 `benchmarks/engine-goal-progress-20261008-65.json`. 임계값·가중치·분모는 변경하지 않았다. 시간 비율/모델 정확도/독립 전문가 점수가 아니다.70%는 미달이며 전체 제품 납품은 미완료다.

다음 한 작업: 공개/잠금한 새로운 요청을 대상으로 실제 stochastic 다중 seed·다분야 선택 안정성 검사. 현재 greedy 및 IR seed 증거를 대신 사용하지 않는다. L3 원자료 실루엣/G4 실제 사진 정렬도 별도 증거가 필요하다.

실제 UI는 기존 localhost EPERM/file security block, Blender는 Python/import 전 Metal startup crash 때문에 not-run. 첫 import와 reexport 모두 이번 실행 증거 없음. 중립 전후 이미지/독립 실무자 평가 없음. 우회하거나PASS로 승격하지 않았다.

플랫폼 Goal 도구는 이전 broad objective의 blocked 상태이며 resume/본문 수정 API가 없다. 이번 새 Goal 생성도 unfinished Goal 때문에 거부됐다. 목표를 완료하거나 도구가 재개됐다고 보고하지 않는다. 이번 문서는 작업 체크포인트이며 사용자 일시정지나 목표 달성 처리가 아니다.
