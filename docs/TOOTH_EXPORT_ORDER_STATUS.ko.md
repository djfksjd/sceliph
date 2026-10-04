# 톱니 진단 추출 저장·재열기 — 2026-10-04

기준25bc2fa, compiler0.41.0/renderer0.12 유지. UI/IR 사본 준비만 변경하며 원본과 사용자 수정·스키마·기하 커널·기존 UV5% 임계값을 유지했다. API/Claude 호출0, 새 의존성0. 예산20분/진단된 제품 수정2회/증거15MiB.

## 결함과 구현

기존 exportTooth는 raw IR을 복제했기 때문에 저장 JSON에서 다시 만든 원본 기어로 같은 tooth_0003을 추출하면 GLB 전체 바이트가 달랐다. 원본 기어는 변경되지 않고 BIN은 정확히 같았다. 작은·기본·큰 기어(모듈0.5/1/2)와36톱니의 실제 GLB red 테스트4실패로 확인했다.

prepareDiagnosticToothExportSource가 기존 prepareElementExportSource를 재사용한다. 검증된 저장 IR 표현의 독립 사본에서 기존 extractToothGeometry를 적용하고 조립/home 참조를 제거한 진단 sector를 만든다. UI는 이 함수를 호출한다. GLB에는 connectedSourceFeatureId, diagnostic-sector-cut, detachable:false를 그대로 둔다. 동반 JSON은 **원본 전체 기어 IR**이다. 진단 사본을 실제 분리 가능한 톱니나 원본 IR을 역변환한 납품으로 취급하지 않는다.

없는 부품·없는 feature와 챔퍼 톱니는 실패한다. 첫 negative fixture가0.3에 챔퍼를 넣어 unknown 오류로 거부됐고, 이후0.5로 옮긴0.1mm도 기존0.05mm 상한 때문에 거부됐다. 같은 실패 두 번 후 범위를 다시 조사해 기존 migrateElementProjectToV5→editPart 경로의 유효0.01mm fixture로 수정했다. **검증 임계값 완화 없음**. 두 실패 로그와 초기 전체 test 실패를 모두 보존했다.

## 현재 검증

| 명령/경로 | 결과 |
|---|---|
| npm run check 최종 | PASS |
| npm test 최종 | PASS 852tests /124files |
| npm run benchmark | PASS |
| npm run build | PASS |
| npm run quality:gate | FAIL exit1 |
| npm run quality:production | FAIL exit1; 후속 dominance not-run |
| 현재 GLB4개 gltf:validate | PASS 오류·경고0, INFO 보존 |
| 신규5개 targeted | PASS |

command-results.json은 fixture가 잘못된 최초 full test의 exit1도 기록한다. **최종** 타입·전체 테스트 성공은 final-check-results.json/check-final.log/test-final.log에 별도로 기록했다. 제품 코드가 이후 바뀌지 않아 통과한 benchmark/build/gate를 근거 없이 반복하지 않았다.

브라우저 실제 조작: gear4mm 생성→spur_gear 선택→tooth_0003 선택→진단 GLB·원본 IR 다운로드→다른 세션에서 그 실제 IR Load JSON→같은 feature 추출. **GLB와 원본 sourceJSON 각각 전체 바이트 일치**. 원본 source는 spur-gear/24톱니이며 sector로 대체되지 않았다. 브라우저 파일 SHA256 `313faf662e433b5035f84263d594d183c6d0ed12d2422db47251346846b5f98a`.

원래 CLI GLB와 현재 CLI GLB의 BIN과 파싱된 전체 JSON 값은 정확히 같다. 즉 이 수정은 실제 POSITION/NORMAL/UV/index·재질·계층 값을 바꾸지 않았다. current CLI first/reopened는 전체 바이트 일치한다. CLI 파일 SHA256 `7908f0922130455be03d17456680815e2ebf820e631920b8e959b592c09d2ea7`.

Blender5.2.1LTS에서 현재 브라우저 GLB first import: mesh1, 이름spur_gear/tooth_0003, vertices1188/polygons396/UV layer1. 저장한 diagnostic.blend를 실제로 다시 열어 정점·면·UV·corner normal·재질 이름·계층 변환 구조가 저장 전과 정확히 같았다. **입력 GLB normal과 첫 import normal의 비교 not-run**, GLB 재export not-run. 기존 Blender normal drift 해결이나 납품 승인으로 주장하지 않는다.

## 미해결과 다음 한 가지

동일 런타임의 IR 저장·재열기 결정성은 확인했지만 **Node↔브라우저 전체 GLB 일치는 FAIL**이다. Float32 BIN은 정확히 같으나 파생 extrude 윤곽점 double 메타데이터가 약10^-15 다르다. 차이 위치·값은 cli-browser-input-difference.json에 보존했다. 수치 차이가 작다는 이유로 전체 바이트 요구를 완화하지 않았다. 다음 작업은 이 파생 윤곽점 계산의 런타임 차이를 재현하고 기존 결정론적 수학 경로를 적용할 수 있는지 검토하는 것이다.

기본 기어 UV 실패는 화면에도 FAIL로 남고 diagnostic만 허용했다. 전체 quality의 기존 cross-domain 납품 실패와 production 실패는 그대로다. 이번 기능 확인과 전체 플랫폼 납품 완료는 별개이며 Goal은 active다.

증거는 benchmarks/modeling-slices-20261004/tooth-export-order. 파일·코드 SHA는 file-manifest.json, 시도 기록은 attempts.json, 압축/raw SHA와15MiB 예산은 STORAGE.json. macOS AppleM5/Node24.13.1/브라우저 runtime 기록/Blender5.2.1LTS. raw work/tooth-export-order-20261004와 Documents/morphloom/outputs/tooth-export-order-20261004 별도 보존. 원본 iCloud git index를 건드리지 않고 기준 바이트와 일치하는 코드만 mirror한다.
