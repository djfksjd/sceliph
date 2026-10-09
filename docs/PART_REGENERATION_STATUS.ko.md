# 선택한 부품 형상 재생성 — 전체 엔진 완료와 구분

## 구현한 동작

기존 생성기는 새 프로젝트를 만들었다. 이제 기존 프로젝트의 선택한 authored extrusion 부품에 등록된 생성기의 **기하만 교체**할 수 있다. 대상의 ID·이름·위치·회전·스케일·재질과 비대상 부품을 보존하며 기존 편집 이력의 Undo/Redo를 사용한다. 사진에서 형상을 복원하거나 기존 치수를 자동 추정하는 기능은 아니다.

`src/engine/part-regeneration.ts`는 원본 native source와 선언의 SHA256을 검증하고, await 전에 입력과 fingerprint를 복사한다. 기존 DomainInvocation·editPart·validation·topology 경로를 재사용한다. 생성 결과가 단일 extrusion인지 확인하며 100,000삼각형 예산과 기존 topology 검사를 통과해야 적용한다. 지원하지 않는 입력은 부분 적용 없이 거부한다.

지원은 static `morphloom.elements/0.6`, authored extrusion, mm/right-handed-y-up이다. 잠긴 대상·assembly·home·surface attachment·다른 기하·재질 변경을 포함한 생성 선언은 거부한다. 기존 target transform은 그대로 유지하므로 입력 숫자는 **로컬 기하의 mm**이며 스케일 적용 후 월드 치수와 구분해야 한다. IR/job/patch 스키마 변경은 없고 연산은 `sceliph.part-regeneration/0.1`이다. SHA는 입력의 식별 기록이며 원본 파일의 영구 백업을 대신하지 않는다.

`src/PartRegenerationPanel.tsx`를 ElementEditor에 연결했다. 등록 capability로 생성기를 노출하되 등록 자체를 검증 성공으로 취급하지 않는다. 파일·프로젝트·선택·파라미터 변경과 unmount 후 늦은 결과는 폐기한다. 실패는 표시하고 적용하지 않는다. 실제 화면 조작 검수는 아래 차단 때문에 아직 실행하지 못했다.

## 재현한 결함과 수정

첫 테스트에서 JSON 직렬화/재파싱으로 입력을 복사하면 비대상 좌표의 `-0`가 `0`으로 바뀌었다. structuredClone+기존 validateProject로 복사하여 원래 비대상 값을 보존했다. 직접 API 보존의 deep equality를 완화하지 않았다. 디스크 JSON은 기존 canonical serialization 계약을 따르며 양쪽 모두 같은 export 경계로 실제 파일을 비교한다.

다른 초기 실패는 테스트 fixture가 지원하지 않는 home.scale을 넣은 계약 위반이었다. 제품 스키마를 확대하지 않고 지원되는 home.position/rotation fixture로 수정했다. 실패 원인 기록은 당시 tool 출력에 근거하며 별도의 이전 실패 로그가 보존됐다고 주장하지 않는다.

추가 회귀는 저장·파싱 후 위치를 다시 편집하고 재생성하는 사례다. 같은 기하를 반복 적용해도 target transform이 누적되지 않고 canonical source/output SHA가 같아야 하며 오래된 SHA는 거부해야 한다.

## 현재 실행 증거

`outputs/part-regeneration-20261009/final`이 최종 수정본의 실행이다. 앞의 files/verification 로그도 당시 실행 자료로 남겼다. 최종 execution.json과 manifest.json에 명령·종료 코드·환경·코드 및 실제 입출력 SHA를 연결한다.

0.5/1/2 크기의 임의 ID 판에서 before/after/reopened sourceJSON과 GLB를 각각 저장했다. 9 GLB의 topology·Khronos·WebIO 검사를 수행했고 비대상 position/normal/UV/index·변환·부모, 대상 transform과 scalar PBR의 일치를 확인한다. 수정 IR 재열기 후 GLB 전체 바이트가 일치한다. 수정 후 3파일은 기존 editable-mesh UV 검사도 실행한다. scalar PBR이며 텍스처가 없어 texel density는 not-run이다. UV overlap 검사는 예산 내 진단으로 complete:false가 있으므로 독점 atlas·무겹침 UV 납품을 검증했다고 주장하지 않는다.

최종 npm test는162files/1032tests PASS이며 npm run check/benchmark/build도 PASS다. quality:gate/quality:production은 exit1이다. 상세 명령·시간은 최종 execution.json을 참조한다. 앞의 현재 구현 실행과 최종 gate JSON은 generatedAt을 제외하면 일치한다. 기존 Blender cross-domain/edit의 benchmarkAccepted:false와 electronics 근거52/90은 남는다. production의 dominance는 앞 gate 실패로 not-run이다. 기존 톱니 UV5%·normal accessor·바이트 일치 검사를 느슨하게 하거나 제거하지 않았다. 기존 전체 게이트 실패를 이번 기능의 성공 자료로 덮어쓰지 않는다.

현재 코드 tree SHA256은 `438ed1f6ac1ad2ba7a9f32ce8201441abc108decf6d65da796637341074bfb9d`, manifest SHA256은 `d729e010452320bec43edf60629556f69ea0b859cacadf1a14f88053dad15a1a`이다. tree는 src/tests/scripts/schemas와 package/lock/AGENTS 파일별 SHA의 정렬된 JSON으로 계산한다. 보고 문서의 후속 편집은 이 코드 tree에 포함하지 않는다.

## 사용과 재현

1. ElementEditor에서 지원되는 authored extrusion 부품을 선택한다.
2. `Replace selected authored shape`에서 생성기를 선택하고 로컬 mm 치수를 입력한다. 표시되는 기본값은 기존 부품에서 복원한 값이 아니다.
3. `Replace geometry · keep other properties`를 적용한다. 필요하면 기존 Undo/Redo로 되돌린다.
4. 기존 native source 저장으로 별도 JSON을 저장하고, 새 세션의 Load source로 다시 불러와 추가 편집·GLB 내보내기를 한다. 이는 구현된 경로의 사용 방법이며 실제 브라우저 다운로드 검증 완료 보고는 아니다.

```sh
./node_modules/.bin/vite-node scripts/part-regeneration-evidence.ts /private/tmp/sceliph-new-part-proof
npm test
npm run check
npm run benchmark
npm run build
npm run quality:gate
npm run quality:production
```

출력 경로는 새 폴더여야 한다. 외부 서비스·추론 API·UNI_AI·Claude 호출, 새 의존성 설치, commit/push는 하지 않았다. 저장소는 `/private/tmp/sceliph-publish-20261007`, branch `engine/lathe-connectivity-20261007`, base HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`이며 기존 변경을 보존했다. 현재 수정본은 HEAD만으로 식별되지 않으므로 manifest의 코드 SHA도 함께 확인한다.

## 완료하지 못한 검수와 다음 작업

실제 브라우저 저장·재열기, 중립 렌더, Blender 첫 import·재export·normal drift·편집 가능성과 독립 실무자 평가는 **not-run**이다. 기존 localhost 권한 차단 및 file URL 보안 거부를 우회하지 않았다. 이번 native 앱 확인은 Orca runtime_unavailable, open timeout 뒤 CUA의 `Computer Use was not approved to use Blender`로 차단됐다. 이 거부 후 다른 도구로 Blender 접근을 우회하지 않았다. 자세한 관측은 gui-status.json에 기록한다.

자동 파일 검사가 통과한 좁은 기능과 전체 제품 납품 승인 상태는 별개다. 전체 엔진100%·production-ready·새 완성도 퍼센트를 보고하지 않는다. 기존 로컬 모델의 새로운 수치 요청5/6 성공 후 전체FAIL도 이 기능으로 성공 처리하지 않는다. 다음 한 작업은 승인된 정상 검수 환경에서 **현재 manifest의 sourceJSON을 실제 UI에서 저장·재열기하고 Blender 첫 import를 검사**하는 것이다. 검수환경과 원자료/독립 검수 요청에 대한 답은 아직 없다.

플랫폼의 기존 broad Goal 상태는 blocked이고 도구에는 resume/목표 본문 편집 API가 없다. 실제 구현을 이어갔지만 Goal 도구 재개나 자동 백그라운드 재시작을 설정했다고 보고하지 않는다.
