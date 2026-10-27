# LLM 선언형 판 생성의 전체 파일 결정성 · 2026-10-10

**완료 범위: 새 선택형 팩의 Node24/Chrome154 원본 JSON·GLB 전체 파일 일치, native 재열기와 두 부품 계획 적용. 혼합 코드·실행 근거로 PASS.** 전체 엔진/모든 OS/production 완료는 아니다. 기준 로컬 커밋 `aa44f80`, 브랜치 `engine/practical-workflow-20261010`, 작업 폴더 `/Users/danny/sceliph-engine-20261010`이다. 원격 main은 `78bec7e`, 원본 Documents 폴더의 index timeout은 유지돼 원본에 reset/checkout/수정하지 않았다. push·배포·외부 모델 호출은 하지 않았다.

## 원인과 호환성

32×14×5mm, bore4mm, bevel0.6mm의 기존 `product.quality-beveled-plate`를 양쪽에서 새로 생성해 source SHA 불일치를 재현했다.

| 생성 | 원본 SHA-256 |
|---|---|
| Node | `b99f95474f8401067e25848b743e6b4718570833b95b2c787a039038cd599ebf` |
| Chrome | `7916d5a5a5969da473b4c5dc207a7466a0ce41232f0aa3ae881f69d83fafa46f` |

보어의128개 좌표와 bevel secant를 native `Math.sin/cos`로 계산하면 host별 마지막 double 자릿값이 다를 수 있다. 이전 GLB는 BIN이 같아도 embedded sourceSpec이 달라 전체 파일과 원본 SHA가 달랐다. 자료는 [before-browser.log](../benchmarks/plate-determinism-20261010/before-browser.log)와 baseline에 보존한다.

새 `product.deterministic-beveled-plate`는 `sceliph.plate-ieee-series/0.1`로 명시적인 bounded IEEE series를 사용한다. 기존 검증된 deterministic rotation 연산을 재사용하며 descriptor 생성에 native sin/cos를 호출하지 않는다. 좌표를 반올림하거나 양자화하지 않는다. cap `quality-diagonal-v1`과 기존 기하·UV 검사 경로를 그대로 사용한다.

기존 `product.centered-plate`, `product.beveled-plate`, `product.quality-beveled-plate`와 저장된 IR/선언은 변경하지 않는다. 변경 전 수집한18입력×3생성기의 **54 source SHA**를 그대로 확인했다. 기존 cap 퇴화2의 실패 oracle, 옵션 없는 geometry byte preservation, 모든 원래 테스트와 임계값을 유지했다. 새 pack ID가 계산 정책을 구분하며 기존 파일을 자동 migration하지 않는다. 미래에 준비하는 편집기 replacement template만 새 팩과 `deterministic-descriptor` capability를 지정한다.

## 독립 수치 검증

[plate-arithmetic-reference.py](../scripts/plate-arithmetic-reference.py)는 Python 표준 Decimal과 Machin pi·직접 Taylor recurrence를 사용한다. 엔진의 범위 축소/Horner 코드나 native trig를 쓰지 않는 별도 oracle이다.90자리와140자리 결과의 수렴을 확인하고 고정 fixture를 생성했다. 재생성한 fixture도 바이트 일치했다.

전체128개 보어 좌표에서 반지름0/0.1/50/150/200mm를 검사해 descriptor 절대 오차가 **1e-10mm 미만**, secant 차이가1e-14 미만이었다. 잘못된 반지름·index는 거부한다. 이 값은 명시적 수치 좌표의 계산 오차다.128각형 메시의 원호 근사, Float32 정밀도, 참고 사진 복원이나 제조 공차의 증거가 아니다.

## 실제 전체 파일 검증

[공개 증거](../benchmarks/plate-determinism-20261010/)는 실제 Node 파일과 browser declaration import/save/export 파일을 함께 보관한다. 비교는 원래 save/export 경로를 거친 **완전한 원본 파일의 Buffer.equals**다. 비교 뒤 필드를 삭제하거나 숫자를 수정하지 않으며 BIN만 비교하지 않는다.

| 항목 | 확인된 결과 |
|---|---|
| 6개 등록된 생성 입력 | 세 크기, no-bore, zero-bevel, 다른 종횡비 |
| Node | 원본6·GLB6·재열기 GLB6, topology/Khronos/WebIO/UV PASS |
| 실제 Chrome | declaration import→원본 저장→GLB/companion source export→새 세션 원본 reload→GLB export |
| 환경 간 | 6사례 모두 source JSON 전체·GLB 전체 byte exact; companion JSON exact |
| browser 재열기 | 6사례 모두 GLB 전체 byte exact; pageerror0 |
| 두 부품 계획 | 원래3부품 source의 ID·transform·PBR·비대상 보존; Node와 실제 browser Apply/save/reopen GLB·source 전체 byte exact |
| 브라우저 상태 전이 | stale 차단·계획 수정 후 승인 취소·preview 무변경·한 번 Undo/Redo·후속6mm 편집 PASS |
| 최대 steps 관측 | warm Node process, 8개2112-triangle replacement 약385ms; 최악100k/target latency/SLA 아님 |
| Blender5.2.1 | 단일 생성 파일 import/export/reimport PASS; 실제 계획 파일의 selected part3mm 이동과2회 roundtrip PASS |
| 마지막 DCC 파일 검사 | roundtrip·edited·stability 3 GLB, Khronos/독립 read PASS |

`node-report.json`, `cross-runtime-report.json`, `plan-cross-runtime-report.json`과 [verification.json](../benchmarks/plate-determinism-20261010/verification.json)에 source/file/code SHA와 개별 검사 결과가 있다. 여섯 생성 사례는 errors0/warnings0, 유지한 미사용 authored UV의 `UNUSED_OBJECT` info1이 있다.3부품 계획은 같은 info3이다. 앱의 standard/parser/UV 검사 PASS를 strict competitive의 infos0 PASS로 승격하지 않았다. UV를 지우거나 임계값을 완화하지 않았다.

## 명령과 현재 전체 상태

| 명령 | 결과 |
|---|---|
| `npm test` | **165파일·1044테스트**, exit0 |
| focused constraint | plate arithmetic/legacy/cap/plan **5파일·19테스트**, PASS |
| `npm run check` | PASS |
| `npm run benchmark` | PASS |
| `npm run build` | PASS; main 약804kB의800kB 경고 한계 초과는 남음 |
| `npm run quality:production` | exit1; prerequisite competitive 실패로 dominance not-run |

전체 quality9사례의 기존 결과와 competitive payload는 timestamp 외에 그대로다. cross-domain Blender native/edit 엄격 승인과 Unity current-revision report 부재, 독립 same-reference blind 평가 미충족 등은 유지한다. 이 새 팩의 정적 파일 검증을 모든 도메인·rig·animation·CAD/BREP·전문가 실무 승인으로 재사용하지 않는다. Node24와Chrome154를 같은 현재 macOS host에서 검사했으며 Safari·다른 OS는 미검증이다.

기존 화면 배치를 유지하고 새 팩을 generator 선택 목록과 JSON plan template에 연결했다. desktop1440×1000·mobile390×844의 실제 체크 완료 화면을 캡처해 한·영 README에 반영했다. horizontal overflow0을 확인했다. 이전 캡처·proof·원래 pack 결과는 보존했다.

다음 우선순위는 textureless UV 보존과 엄격한 납품 기준의 관계를 실제 파일로 해결하는 것, 그리고 현재 source/hash에 결합된 도메인별 대상 앱 증거를 채우는 것이다. 지원 generator 밖의 임의 형상/사진에 대한 LLM 정확도는 별도 평가가 필요하다.

## 재실행

```bash
npm test
npm run benchmark
npm run build
npx vitest run tests/plate-arithmetic.test.ts tests/plate-bevel.test.ts tests/centered-plate-pack.test.ts tests/extrude-cap-diagonals.test.ts tests/part-regeneration-plan.test.ts
mkdir -p outputs
npx vite-node scripts/plate-determinism-evidence.ts generate outputs/plate-determinism-current
npm run dev
# playwright-cli run-code --filename=scripts/plate-determinism-browser.js
# playwright-cli run-code --filename=scripts/part-regeneration-plan-browser.js
npx vite-node scripts/plate-determinism-evidence.ts compare outputs/plate-determinism-current output/playwright/plate-determinism/current
npx vite-node scripts/plate-determinism-evidence.ts plan outputs/plate-determinism-current output/playwright
python3 scripts/plate-arithmetic-reference.py outputs/new-decimal-reference.json
```

generator와 oracle은 기존 출력을 거부합니다. 새로운 출력 디렉터리를 선택했다면 browser harness의 fixture path도 맞추세요. 저장된 원본과 이전 proof를 덮어쓰지 않습니다.
