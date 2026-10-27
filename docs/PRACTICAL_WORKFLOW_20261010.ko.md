# Sceliph 실무 편집 흐름 · 2026-10-10

이번 구현 범위는 **원본 SHA에 결합된 여러 창작 부품의 교체 → 검사·검토 → 단일 Undo 적용 → 저장·재열기·후속 편집 → 실제 GLB·Blender 확인**이다. 실행과 코드 검토를 결합한 이 범위는 PASS다. 전체 엔진의 범용 생성·사진 복원·production 완료는 CHANGES NEEDED다. 새로운 외부 3D 모델·MCP·유료 모델 호출은 사용하지 않았다.

## 작업 기준의 실제 대조

| 대상 | 조회 결과 |
|---|---|
| 사용자 지정 원본 폴더 | `/Users/danny/Documents/morphloom`, origin `https://github.com/djfksjd/sceliph.git` |
| 원본 로컬 HEAD | `a200aa4593aa14a9f0348b014962d144d119c741` |
| GitHub main / HEAD | `78bec7e0ff31a0e5f602dbc43fbfc3e14b33dba5`; 작업 종료 전 ls-remote 재확인 동일 |
| 사용자가 제시한 `9f0d700` | 로컬·완전한 새 clone의 객체에 없음. GitHub commits API도 `No commit found for SHA: 9f0d700` 반환 |
| 커밋 관계 | 원본 HEAD는 현재 원격 main의 70커밋 전 조상 |
| 원본 working tree | `.git/index: unable to map index file: Operation timed out` 때문에 전체 staged/unstaged/untracked 판정 불가. 일부 파일 읽기도 시간 초과 |
| 작업 위치 | 정상 clone `/Users/danny/sceliph-engine-20261010`, `engine/practical-workflow-20261010` 브랜치 |

원본 index를 재작성하거나 원본 폴더를 checkout/reset하지 않았다. 원본의 고유 입력·outputs·로컬 수정은 그대로 두었다. 새 clone은 최초 status가 clean임을 확인한 뒤 편집했다. GitHub main의 최근 변경은 native 재생성·최종 UV 차단, 실제 이전 UI 캡처, viewport 중심 작업 화면이다. 기존 README의 최신 UI 브라우저 미검증 상태를 이번 실행 증거로 보충한다. 원격 push·게시·배포는 하지 않았다.

## 엔진과 사용자 흐름

`sceliph.part-regeneration-plan/0.1`은 최대 64 KiB, 1–8개 고유 ASCII target ID, 정확한 source SHA와 등록된 Domain invocation을 요구한다. static native0.6의 unlocked authored extrusion만 지원한다. assembly/group/region/element 종속 대상과 material 변경은 거부한다. geometry만 교체하며 사용자 ID·이름·transform·PBR와 다른 부품은 보존한다.

검토는 private clone에서 수행한다. 각 대상의 실제 최종 topology·100k triangle budget·기존 editable-mesh UV 기준을 검사하고 하나라도 실패하면 결과를 반환하지 않는다. caller는 검토 결과 전체를 한 history entry로 적용한다. 계획 text·source·import 상태가 바뀌거나 화면이 해제되면 오래된 async 결과를 적용하지 않는다. receipt의 source/plan/output SHA는 검토 입력에 결합되며 IR에 production PASS를 삽입하지 않는다.

원본·최종 source와 실제 파일, 실행 로그는 [공개 증거 폴더](../benchmarks/practical-workflow-20261010/)에 보관한다. [verification.json](../benchmarks/practical-workflow-20261010/verification.json)은 현재 src/schema의 파일 SHA, 명령 결과와 브라우저·배치 검수를 기록한다.

### 재현된 기하 결함과 선택형 수정

기존 `product.beveled-plate`의 24×14×5mm, bore4mm, bevel0.6mm에서 Earcut 캡의 거의 일직선인 두 삼각형이 기존 relative degeneracy 기준을 위반했다. Node와 Chrome 양쪽에서 퇴화2, boundary0, non-manifold0을 재현했다. 실패 때 원본 적용 차단은 유지했다.

선택형 `product.quality-beveled-plate`는 IR에 `capTriangulation: quality-diagonal-v1`을 선언한다. 평면 캡의 인접 삼각형 쌍에서 convexity·winding·표면적 보존을 확인하고 대각선을 바꾼다. 기존 정점/UV/normal을 재사용하며 경계·벽면은 이동하지 않는다. 최대64 flips로 제한하고 남은 결함은 정상 gate가 거부한다. native에서는 기존 crease normal을 계산한 뒤 cap을 바꿔 벽면 normal도 보존한다. AssemblyIR 직접 컴파일 경로도 검사했다.

세 크기에서 퇴화2→0, boundary/non-manifold/self-intersection0, topology PASS와 UV PASS를 확인했다. 정점 집합·표면적·벽면의 position/UV/normal을 보존했다. 이미 passing인 legacy 메시의 모든 geometry attributes는 바이트 일치했다. legacy 팩과 옵션 없는 출력, 기존 UV5%·double-area1e-10·relative degeneracy1e-12 기준은 변경하지 않았다. native0.5 이하 import/edit는 새 필드를 거부한다.

### 화면

원본 작업 화면을 유지하며 desktop viewport 높이를 실제 header에 맞췄다. 모바일 상세 성능 수치는 접이식으로 정리했다. 금속 표면 검수용 RoomEnvironment/128px PMREM은 authored 로컬 studio lighting이며 환경/GPU 자원은 cleanup에서 해제한다. 외부 HDR 파일이나 서버 요청이 없다. 실제 browser GLB는 조명 추가 전후 SHA 동일이다.

[최신 desktop·mobile·계획 캡처](../assets/screenshots/README.md)를 한국어·영어 README에 연결했다. 1440×1000과390×844에서 horizontal overflow가 없었다. 모바일은 viewport·tree·Inspector가 순서대로 이어지는 스크롤 화면이다. 두 번의 배치 화면 검수 후 추가 시각 반복은 하지 않았다. 캡처는 실측 물성·참고 사진과의 충실도 증거가 아니다.

## 실행 증거

| 검사 | 관측 결과 |
|---|---|
| 변경 전 `npm test` | 162파일 / 1033테스트 PASS |
| 최종 `npm test` | 164파일 / 1040테스트 PASS, exit0 |
| 별도 focused constraint 검사 | cap·plan·single-regeneration 3파일 / 13테스트 PASS |
| `npm run benchmark` | PASS; 새 계획 proof와 전체 production은 별도 |
| `npm run build` | PASS; main 약803.6kB의 기존800kB 경고 한계 초과는 남음 |
| 파일 proof | 3크기·2대상씩·9 GLB, topology/Khronos/WebIO/실제 UV PASS; non-target와 target pose/PBR 보존, native 재열기 GLB byte exact |
| 최대 steps workload | 8개2112-triangle 부품, host 약360ms; 100k/target 최악 latency나 SLA 증거 아님 |
| 실제 Chrome154 | stale 차단·계획 수정 후 승인 해제·preview 무변경·2부품 Apply·한 번 Undo/Redo·새 세션 재열기·추가6mm 편집·실제 GLB download PASS, pageerror0 |
| Blender5.2.1 | 현재 Node GLB import/export/reimport parity PASS; 실제 browser GLB의 `panel_user` 3mm 이동·두 번 roundtrip과 비대상 보존 PASS |
| 마지막 실제 파일 검사 | browser·Blender roundtrip·edited·stability 4 GLB Khronos/독립 read PASS |
| `npm run quality:production` | exit1. prerequisite competitive 실패로 dominance는 이번 명령에서 not-run |

중간 full run 도중 source/version gate와 새 테스트가 바뀐 mixed-revision 실행은 1FAIL로 보존하고 최종 증거에서 제외했다. standalone focused 검사와 이후 변경 없는 전체 실행으로 확인했다. 실패 oracle을 삭제하거나 합격 기준을 낮추지 않았다.

## 남은 실무·100% 목표의 조건

전체 quality의 고정9사례 technical/decision rates는 통과하지만 competitive에는 strict cross-domain Blender acceptance와 Unity current-revision 보고서 부재, 독립 same-reference blind 비교 부재 등이 남아 있다. 이번 한정된 Blender 사례를 전체 도메인 증거로 승격하지 않았다. 기존 raw Blender normal drift·CAD/BREP·rig/animation·임의 사진의 숨은 형상 복원·전문가 납품 승인은 해결했다고 주장하지 않는다.

Node와 Chrome의 해당 after-1 GLB는 **BIN payload SHA가 동일**하지만 embedded sourceSpec의 보어 좌표 일부가 standard Math의 마지막 double precision 자리에서 다르다. 따라서 전체 GLB/생성 source의 cross-runtime byte equality는 미충족이다. 정확히 저장된 native source를 같은 host에서 재열기·재생성하는 증거와 구분한다.

다음 우선순위는 이 선택형 팩의 descriptor 수학 결정성과 현재 revision/hash에 결합된 전체 도메인 납품 증거다. 범용 생성기의 실제 새로운 요구·참고사진에 대한 LLM 정확도와 독립 실무 검토도 필요하다. 이번 구현·검증 완료를 전체 엔진100% 완료로 표시하지 않는다.

## 재실행

```bash
npm ci
npm test
npm run benchmark
npm run build
npx vitest run tests/extrude-cap-diagonals.test.ts tests/part-regeneration-plan.test.ts tests/part-regeneration.test.ts
mkdir -p outputs
npx vite-node scripts/part-regeneration-plan-evidence.ts outputs/new-part-plan-run
npm run dev
```

실제 브라우저 harness는 `scripts/part-regeneration-plan-browser.js`를 playwright-cli `run-code --filename=...`로 실행한다. fixture는 공개된 `benchmarks/practical-workflow-20261010/before-1.source.json`을 직접 읽는다. runtime code·임의 외부 모델을 source 파일로 실행하지 않는다. 원본/기존 proof 디렉터리의 덮어쓰기를 거부하며 새 디렉터리를 사용한다.
