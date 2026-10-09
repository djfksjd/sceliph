# 부품 재생성의 최종 대상 UV 차단

## 이번 결함과 범위

선택 부품 재생성의 기본 생성기 topology 검사는 기존 target의 UV 설정을 반영하지 않았다. 기본 생성기에는 정상 UV가 있어도, 기존 uvScale을 보존한 실제 target에서 UV가 퇴화할 수 있었다. 내보내기의 기존 검사는 이를 차단하지만 재생성 자체는 성공을 반환해 실패하는 편집 상태를 적용했다.

최소 재현: 기존 1000×1000×1000mm, bore0 판에 uvScale0.001을 설정한다. 원본 UV12삼각형은 정상이다. 32×14×5mm, bore4mm, bevel0.6mm로 재생성하면 2112삼각형 중2100의 UV double-area가 기존1e-10 이하가 된다. 수정 전 연산이 이 상태를 반환하는 관측을 before.json에 보존했다. 이 값은 형상 정확도나 렌더 품질 점수가 아니라 기존 UV 실패 검사 측정값이다.

이번 변경은 이 재생성 적용 경계에 한정한다. 새 기하·리깅·좌표계·사진 복원·모델 호출을 추가하지 않는다. 최초 가설인 보존 transform과 topology 차이는 topology가 로컬 position을 검사하므로 실제 결함으로 입증되지 않았다. 두 번째 UV 가설은 재현됐고 하나의 수정으로 해결했다. 실패 테스트·재현 자료를 삭제하지 않았다.

## 실제 수정

`src/engine/part-regeneration.ts`는 기존 editPart/validation으로 대상 기하를 교체한 **후**, 아직 caller에게 반환하기 전에 최종 target을 기존 exportSelectedScene으로 생성한다. 원래 UV scale·normal policy·transform·material이 반영된 target에 기존 topology/budget와 inspectUvQuality→evaluateMeshUvExport(editable-mesh)를 수행한다. 실패하면 결과를 반환하지 않고 메시 자원을 finally에서 해제한다.

기존 editable-mesh 판정과5%/double-area1e-10 임계값을 그대로 재사용한다. 자동 UV scale 변경, diagnostic 목적의 우회 승인, atlas/production 승인은 하지 않는다. 원본 파일·IR·비대상 부품은 바꾸지 않는다. 스키마와 기존 정상 입력의 생성 바이트는 유지한다. GLB export 시 실제 바이트 UV 검사도 그대로 남는다.

`tests/part-regeneration.test.ts`에 원본 UV가 정상인 상태에서 잘못된 최종 UV를 차단하고 원본·Undo 상태를 보존하는 테스트를 추가했다. uvScale1로 사용자가 명시적으로 수정한 정상 경로도 검사한다. 먼저 이 테스트의1FAIL/5PASS를 확인하고 구현한 뒤 관련 UV·export 회귀를 함께 실행했다.

## 증거와 재현

현재 증거 폴더: `outputs/part-regeneration-final-uv-20261009`.

- before.json: 수정 전 성공 반환 및 최종 UV2100/2112FAIL.
- failing-test.log: 새 회귀 테스트가 수정 전 실패함.
- after.json: 같은 입력을 수정 후 적용 전 거부함.
- focused.log: 관련3files/17testsPASS. 기존 한 톱니 UV 손상 검사를 포함하며 전체 평균으로 대체하지 않았다.
- current/files: 현재 수정본에서 세 크기 before/after/reopened sourceJSON·실제 GLB9개와 strict 검사 결과.
- valid-byte-regression.json: 정상 sourceJSON9개와 GLB9개 모두 앞 수정본과 바이트가 일치함.
- current/execution.json: 현재 수정본의 전건 명령·실제 종료 코드·시간.
- manifest.json: 현재 코드·입출력 SHA와 실행환경. 이전 실행 자료를 현재 결과로 대체하지 않는다.

현재 npm test는162files/1033tests PASS이고 npm run check/benchmark/build도 PASS다. 기존 검사 임계값이나 timeout을 수정하지 않았다. 이번 전체 테스트 시간은116.86초이며 보편적인 성능 보장으로 사용하지 않는다.

현재 quality:gate/quality:production은 exit1이다. 두 gate의 실제 JSON은 지난 최종 실행과 generatedAt을 제외하면 모두 동일하다. 기존 Blender cross-domain/edit benchmarkAccepted:false와 electronics 근거52/90 실패가 남으며 production dominance는 앞 gate 실패로 not-run이다. 이 수정의 집중 테스트 및 정상 파일 바이트 회귀는 통과했지만 전체 납품 승인을 의미하지 않는다.

manifest SHA256: `8faaf14b9ea80bfdfc15fccf1a4b7e7ed743891bda3ef182c6f76d88523d85c1`. 현재 코드 tree SHA256: `1c68bef51dea7cf571e97a85dd01ad04942576b1ab6dc68a2a9e6b8eb87749e2`. tree는 src/tests/scripts/schemas와 package/lock/AGENTS의 파일별 SHA를 정렬한 JSON으로 계산한다. 문서의 후속 수정은 이 코드 tree에 포함하지 않는다.

```sh
./node_modules/.bin/vite-node outputs/part-regeneration-final-uv-20261009/probe.ts
./node_modules/.bin/vitest run tests/part-regeneration.test.ts tests/uv-quality.test.ts tests/mesh-export-policy.test.ts
./node_modules/.bin/vite-node scripts/part-regeneration-evidence.ts /private/tmp/sceliph-final-uv-new-proof
npm test
npm run check
npm run benchmark
npm run build
npm run quality:gate
npm run quality:production
```

출력 폴더는 새 경로여야 한다. probe는 저장한 재현 source를 현 엔진에 입력하는 진단이며 제품 기본 UI 경로가 아니다.

## 전체 목표와 차단

전체100% 완료 또는 새 완성도 퍼센트를 보고하지 않는다. 현재 재생성의 실패 차단을 개선했으며 자유로운 LLM 형상 품질·사진 후면 정확도·CAD/물리 승인과 구분한다. 이번 검사에는 외부 서비스나 비용 발생 호출이 없고 UNI_AI/Claude/새 모델 추론·의존성 설치·push도 없다.

실제 UI 저장·재열기와 Blender 첫 import/재export, 중립 렌더와 독립 실무자 평가는 여전히 not-run이다. 지난 실행의 CUA Blender 접근 거부를 다른 도구로 우회하지 않았고 이미 확인한 서버/file URL 권한 차단을 같은 가설로 반복하지 않았다. 전체 production 및 Blender normal drift 해결을 이번 UV 수정으로 보고하지 않는다.

다음 작업은 승인된 정상 실행 환경에서 현재 manifest의 파일로 실제 UI 적용 실패·정상 적용·저장·새 세션 재열기·Blender 첫 import를 확인하는 것이다. 기존 Goal 도구의 blocked 상태에는 resume/본문 수정 API가 없으며 재개 또는 목표 전체 달성으로 표시하지 않았다.
