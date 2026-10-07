# LLM Assembly primary recipe 체크포인트 — 2026-10-05

## 실제 변경

전용 3D 생성 모델 없이 LLM/사용자가 선언한 기존 implicit ellipsoid의 반축을 AssemblyIR에 적용한다. `sceliph.assembly-primary-recipe/0.1`은 원본 canonical fingerprint와 최대 4개 `ellipsoid-radii` 연산만 받는다. 로컬 반축 단위는 mm이며 component/primitive의 실제 ID를 검사한다. 16,384자 입력 제한, 중복 대상·임의 코드·알 수 없는 필드/버전·출처 불일치·비지원 geometry/material/고정 계약은 거부한다. 기존 AssemblyIR 0.1을 변경하지 않는다. 별도 recipe 신규 버전이므로 기존 IR 마이그레이션은 없고 미래 recipe 버전은 실패한다.

기존 ellipsoid 편집·AssemblyIR validation·컴파일·기하 검사·history·SAVE IR·OPEN RESULT를 재사용했다. 전체 recipe가 성공해야 한 번 commit하며 실패 시 원본을 부분 수정하지 않는다. 무변경은 history를 추가하지 않는다. 원본 snapshot을 첫 await 전에 고정한다. 외부 API/UNI_AI/Claude 호출과 추가 의존성은 없다.

`print-thickness.ts`의 기존 제한된 edge-connected 분석을 재사용해 편집 전후 연결 shell 수를 검사한다. 닫힌 manifold만으로는 두 개의 분리된 솔리드를 통과시킬 수 있었으므로 ellipsoid 편집에 shell 보존 검사를 추가했다. 기존 topology/UV/납품 임계값 및 releaseAllowed는 완화하지 않았다. 다른 부품 사이의 접합 관계까지 검사하는 기능은 아니다.

## 재현과 판단

- 기계형 두 lobe fixture: 원본은 폐쇄 topology PASS·1 shell. 오른쪽 반축을 [8,15,15] mm로 줄이면 topology 자체는 PASS지만 2 shell로 갈라졌다. 수정 전 실패 테스트는 기대한 거부가 없어서 실패했다(`connectivity-before.log`). 수정 후 split/merge를 거부하며 [24,16,15] 연결 편집은 통과한다. 새와 기계형 입력 모두 같은 연산 경로를 쓴다.
- 출력 accessor 검사 스크립트는 처음 byteStride가 있으면 무조건 거부했다. 실제 glTF 계약대로 stride/type/count/normalization/min/max와 원소별 실제 bytes를 비교하도록 진단기를 수정했다. 제품 exporter나 바이트 동일성 요구는 바꾸지 않았다. 최초 실패 로그도 보존했다.
- 첫 시각 후보는 머리를 과도하게 줄여 눈 돌출이 악화됐다. `candidate-1/`에 보존하고 채택하지 않았다. 최종 후보는 머리 [20.5,21,25], 몸통 [26,33,50], 양 날개 root [4.5,17,29] mm다. 이는 창작된 비율 제안이며 실측이나 종별 해부학 복원이 아니다. 기본 예제 자체를 이 후보로 교체하지 않았다.
- source 전환 시 성공 영수증 state를 폐기하도록 수정했다. 초기 빠른 select 자동화는 전환이 완료되지 않은 상태를 검증해 잘못된 관측이 섞였다. 실제 select 값을 확인한 후 전환·복귀하여 `receipt-return-confirmed.json`에서 bird 원본 복귀와 receipt=false를 확인했다. 잘못된 원본에서 적용을 시도한 기록은 `transition-failure-*`에 보존했다. 이는 성공 증거가 아니다.

## 사용자 흐름과 실제 브라우저 결과

로컬 viewer에서 Bird Primary Form Study를 선택 → Assembly component editor의 Primary form recipe 펼침 → Prepare primary recipe template → 현재 ID/반축 수치 수정 → Apply primary recipe → SAVE IR → 별도 세션 OPEN RESULT로 저장 IR 열기 → GLB 내보내기. 변경 recipe 전체를 기존 Undo/Redo 한 단계로 되돌린다. 새 세션에서 template를 다시 준비해 torso를 [26.2,33,50]으로 추가 편집하는 것까지 확인했다.

`browser-final-source.json`과 `browser-final-receipt.json`은 현재 UI 결과를 Node 엔진 결과와 deep-equal 검사한 캡처다. `browser-source.json`은 실제 SAVE IR 내용이다. `browser-final.glb`, `browser.glb`, `browser-reopened.glb`는 2,489,044 bytes이며 서로 정확히 같다. non-target accessor 구성과 실제 position/normal/UV/index bytes, 재질, node 계층 보존은 `export.ts`·`receipt.json`에 기록했다. 파일 offset 이동을 원소 변경으로 오인하지 않는다.

이전 candidate1을 사용한 Undo/Redo·늦은 digest+텍스트 교체·파일 파싱 실패 검증도 보존했다. 읽기 실패는 File.text 거부 주입, 지연은 crypto.digest 지연 주입으로 통제한 테스트다. 실제 OS 장애라고 보고하지 않는다. 이전 source-read 결과를 적용하지 않고 receipt 폐기·Apply 비활성화를 확인했다. 해당 캡처를 최종 후보의 파일이라고 혼동하지 않는다.

## 현재 수정본 검증

환경: Apple M5 / 통합 메모리 24GB / arm64 / Node 24.13.1 / Blender 5.2.1 LTS. HEAD `3d26188af5951e7be77ffd0d5c3c9bdf15348fea`, main. 원격 main 동일 HEAD를 확인했다. 현재 변경은 미커밋 로컬 변경이며 이번 단계에서 push하지 않았다. 엔진 revision은 `morphloom-compiler/0.41.0`; 동일 revision의 코드 변경은 manifest code SHA로 구분한다.

| 명령 | 결과 | 현재 증거 |
|---|---|---|
| npm test | PASS, 133 files / 888 tests | test-final2.log |
| npm run check | exit 0 | check-final2.log |
| npm run benchmark | exit 0 | benchmark-final2.log |
| npm run build | exit 0 | build-final2.log |
| npm run quality:gate | exit 1 | quality-gate-final2.log |
| npm run quality:production | exit 1, dominance not-run | quality-production-final2.log |

전체 gate는 이전 체크포인트에도 남아 있던 electronics evidence 52/90 및 Blender cross-domain benchmarkAccepted=false 때문에 실패한다. 이번 recipe의 회귀 성공으로 전체 production 성공을 대신하지 않는다. 전체 gate가 읽는 기존 DCC 영수증을 이번 새 파일의 재검증으로 취급하지 않는다. 이번 실제 GLB는 별도로 Khronos 검사 error 0 / warning 0 및 독립 WebIO 재열기를 수행했다(`browser-validation.log`, `node-validation.log`). Blender 첫 import와 clay side 렌더는 성공했다(`browser-import.json`): 17 meshes. **이번 Blender 재export는 not-run**이며 기존 normal drift 해결이라고 주장하지 않는다. 독립 인간 전문가 평가와 anatomy/rig/제조 검증은 not-run이다.

## 파일·재현·한계

입출력·로그·이미지·실패 후보: `outputs/primary-recipe-20261005/`. 현재 code SHA 및 실제 artifact SHA는 `manifest.json`에 기록한다. recipe 원본 연결은 IR canonical fingerprint, 파일 동일성은 raw SHA-256으로 각각 구분한다. Node 재현: `npx vite-node outputs/primary-recipe-20261005/export.ts`. 전체 검증 명령은 위 표와 package.json을 따른다. Blender 렌더는 기존 `scripts/blender-neutral-render.py`와 `outputs/surface-flow-20261004/fixed-space.json`의 고정 camera/조명/좌표를 사용했다. before/after.png는 1024² clay 비교이며 사진 정확도 검증이 아니다.

이번 편집 흐름은 검증했지만 새의 시각 품질은 여전히 단순화된 모형이다. 큰 품질 향상, 자동 고품질 생성, 전체 플랫폼 납품 완료를 주장하지 않는다. 다음 한 가지 작업은 **명시된 부품 간 접합 관계를 치수 변경 후 검사·보존**하는 것이다. 눈·부리·날개가 몸체에서 뜨는 경우를 먼저 재현하고 source 계약에 있는 접합만 검사한다. 현재 connected-shell 검사만으로 이 문제를 해결했다고 간주하지 않는다.

원본 mirror는 이전 체크포인트 hash가 맞는 파일만 갱신하고 사용자 변경과 iCloud git index를 보존한다. Goal 도구는 paused 상태이며 재개 API가 없어 상태를 바꿨다고 보고하지 않는다. 사용자 재개 요청에 따라 로컬 구현은 진행했으나 넓은 연속 Goal을 완료 처리하지 않았다.
