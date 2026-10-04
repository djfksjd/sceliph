# 일반 native GLB 저장·재열기 결정성 — 2026-10-04

기준1236eb1, compiler0.41.0/renderer0.12. 생성기·스키마·검사 임계값 변경 없음. UNI_AI/Claude 호출0. 예산20분/진단된 제품 수정2회/공개 증거15MiB.

## 실제 결함과 수정

기어4mm source를 첫 생성 후 GLB와 함께 저장하고 새 세션에서 JSON으로 다시 생성하면 첫400번째 바이트부터 차이가 났다. 다섯 sourceSpec 객체 키 순서만 다르고 GLB의 파싱된 JSON 값과 BIN은 일치했다. 생성 IR의 삽입 순서와 serializeProject의 기존 정렬 규칙이 달랐다. 이전 실패를 수치 비교로 PASS 처리하지 않았다.

새 prepareElementExportSource는 기존 serializeProject/parseProject로 검증된 별도 IR 사본을 준비하고 UI selection만 제거한다. ElementEditor의 일반 project/selection/UV·checker diagnostic 및 기존 normal kit 경로에서 이 사본을 사용한다. 현재 편집 IR·원본 파일을 다시 쓰지 않는다. 렌더러 exportSelectedScene과 엄격한 GLB 재생성 검사 자체는 변경하지 않았다. 저장 JSON은 기존 selection 정책대로 유지한다. legacy0.1은 기존 비정렬 serializer를 유지한다.

수정 전 actual GLB 테스트: 작은·기본·큰 베어링과 기어 모두 full byte mismatch4실패. 첫 테스트 작성의 문법 오류도 red-syntax.log에 보존했다. 수정 후5새 테스트는 전체 바이트 일치·이전 BIN 일치·IR 사본/원본 보존·legacy0.1 기존 JSON 순서 및 실제 GLB 보존을 검사한다. 단순 메타데이터 선언 검사가 아니다.

## 현재 실행 결과

- npm run check PASS
- npm test PASS **847tests /123files**
- npm run benchmark PASS
- npm run build PASS
- npm run quality:gate FAIL exit1
- npm run quality:production FAIL exit1; 앞선 gate 실패로 후속 dominance not-run
- native normal kit/translated source 포함 targeted15tests PASS. 기존 tampered normal/source/selection 및 혼합 source 거부 테스트 유지.
- 실제 브라우저 첫4mm 진단 GLB → 동반 source JSON 다운로드 → 독립 세션 Load JSON → 재생성: **전체 GLB 바이트 일치**.
- 명시적 기존 UV editing0.4 및 tile10mm 적용 후 선택 부품 editable GLB → source JSON → 다른 세션 → 선택 복원 및 선택 GLB 재생성: **전체 GLB 바이트 일치**.
- 기본 기어 UV 실패를 수정하지 않았고 diagnostic만 허용한다. editable 검수는 사용자가 명시적으로 tile을 바꾼 별도 사례다.
- 현행 GLB4개 Khronos 오류0·경고0, 표준 검사에 포함된 독립 재열기 결과 유지. INFO는 삭제하지 않았다.
- 첫 ordinary GLB SHA256 `60038942c144f3954e7c0d46d526db0466ad253b6963ce4a05f7cfd12fec41a8`; 이전 first GLB와 whole bytes는 다르지만 실제 BIN과 파싱된 전체 JSON 값은 정확히 같다. 새 first/reopened는 whole bytes exact다.
- optional native normal kit SHA256 `394744bba5f53ac722ec3def0e0931d442474af07ec9ed32e330cecb931555bb`: 이전 단계 출력과 현재 ZIP 전체 바이트 일치.
- 이번 파일을 Blender5.2.1LTS 선택형 FLOAT_VECTOR/CORNER importer로 실제 first import: mesh1/vertices25152, normal 입력 오차0°, 비normal payload와 계층 변환 exact. **재export not-run**. 일반 Blender importer의 기존 normal drift 해결을 주장하지 않는다.

browser.py는 같은 session close/open 뒤 heading 대기에서 timeout했다. 파일은 이미 저장된 상태였다. browser-followup.py는 별도 session에 그 실제 파일을 불러오고 새 session 이름으로 후속 재열기를 실행해 성공했다. 실패 로그는 보존했다. 같은 실패를 재생성 반복으로 덮지 않았다.

실행 환경 macOS AppleM5/Node24.13.1/Vite4179/Blender5.2.1LTS. 관련 UI 작업은 agent-browser로 실제 조작했다. full command-results.json, 입력·출력 SHA와 코드 SHA는 file-manifest.json, 세부 시도는 attempts.json에 있다. 전역 latest benchmark JSON과 node_modules는 이번 커밋에서 제외한다.

## 증거와 한계

`benchmarks/modeling-slices-20261004/ordinary-export-order`에 계약·red/green·브라우저 실제 파일·검사·Blender receipt를 보존한다. 모든 log/큰 JSON은 무손실 gzip이며 STORAGE.json에 raw SHA를 기록했다. raw work/ordinary-export-order-20261004와 Documents/morphloom/outputs/ordinary-export-order-20261004도 보존한다. 사용자 원본 git index를 수정하지 않고 바이트가 기준과 같은 코드만 안전하게 mirror한다.

이 단계는 **일반 native UI export 저장·재열기 결정성 수정**이다. 모든 export 방식의 완료를 뜻하지 않는다. 개별 tooth diagnostic export는 별도 copy/metadata 경로이며 이번 변경에 포함하지 않았다. 다음 작업은 해당 경로에도 같은 순서 문제가 실제로 있는지 feature ID와 실제 geometry/UV를 포함해 재현하는 것이다. 임의 DCC 메시→IR 역변환·사진 복원·제조 승인·전역 production-ready는 지원 주장하지 않는다. 전체 gate의 기존 cross-domain 납품 미충족은 실패로 유지하고 연속 Goal은 완료 처리하지 않는다.
