# 기어 런타임 수학 기반 — 2026-10-04

**계산 기반을 구현·검증했다. 기존 native 기어 생성기에 적용하는 작업은 아직 미완료다.** 기준fa5e2c2, compiler0.41.0/renderer0.12/기존 IR0.1..0.7 유지. 새 API 호출·Claude 호출·의존성0. 예산20분/진단된 후보 수정2회/증거15MiB.

## 최초 차이와 실제 구현

같은 입력 네 기어(모듈0.5/1/2 및36톱니)를 Node24.13.1와 HeadlessChrome154에서 계산했다. 치수는 같지만 feature/extract 좌표가 다르다. 128개 표본에서 native sin3/cos4/tan3/atan4 값이 다르고 sqrt는 조사 표본에서 차이가 없었다. 기존 deterministicHalfSinCos는128표본 모두 정확히 같았다. 이 결과는 현재 두 런타임의 관측이며 모든 브라우저의 보장이 아니다.

새 `src/engine/gear-deterministic-math.ts`는 버전 `morphloom.gear-ieee-series/0.1`의 제한된 계산 기반이다. 기존 명시적 IEEE sincos 다항식을 재사용하고 atan을 reciprocal/pi4 범위 축소 후 odd series로 계산한다. atan2 사분면/signed zero, acos의 단위원 관계, 좌표 범위가 제한된 hypot을 제공한다. 원본 메시를 반올림하지 않는다. 임의 정밀도/CAD 정확도/모든 큰 좌표용 API는 아니다. native 초월함수 미사용·유효 범위·signed zero·수치 오차를 테스트했다.

**현재 제품 생성기에서는 이 모듈을 호출하지 않는다.** 원본 IR의 기존 계산 결과를 조용히 바꾸지 않기 위해 실제 기어 적용 후보는 work 및 증거 폴더에 격리했다. 후보 코드가 있다는 이유로 지원 완료/편집 완료로 표시하지 않는다.

## 검증 결과와 범위

- 네 사례의 후보 전체 profile·feature extract·bore/extrude 좌표와 chord error 객체가 Node/Chrome 사이 정확히 일치.
- 8193표본 diagnostic scalar 최대 오차: atan 2.220446049250313e-16rad, atan2 8.881784197001252e-16rad, acos 4.440892098500626e-16rad. 네 기어에서 기존 native profile과 최대 좌표 거리3.056159864571351e-14mm. **이 수치 비교를 바이트 PASS로 대체하지 않았다.**
- 기존 extrude IR은 전체 기어의 많은 점을256점 제한으로 거부했다. 실패 로그 candidate-files-unsupported-ir.log 보존. 제한 완화 없음.
- 전체 기어4개는 원본 native gear IR을 보존한 **읽기 전용 후보 reference mesh**, 톱니4개는 검증 가능한 sector source로 격리해 실제 GLB를 생성했다. reference에는 currentEditableIRAvailable:false/original-reference-only 상태를 명시했다. native 원본의 대체 편집 IR이나 실제 분리 부품으로 주장하지 않는다.
- 이8개 GLB는 Node와 Chrome에서 **실제 전체 바이트를 직접 비교해 일치**, 기존 토폴로지 검사 모두pass. 현재 소스 모듈로 다시 생성한8개와 fresh browser 실행도 정확히 같은 바이트. SHA만 비교해 바이트 요구를 대신한 것이 아니다.
- GLB8개 Khronos 오류·경고0 및 검사에 포함된 독립 재열기. INFO는 기록 그대로 유지했다.
- npm run check PASS / npm test **855tests·125files PASS** / npm run benchmark PASS / npm run build PASS.
- npm run quality:gate 및 quality:production은 기존 전체 납품 미충족으로 **exit1**. 앞선 실패로 후속 dominance not-run.
- 이번 foundation 단계의 Blender first import/reexport **not-run**. 이전 성공 영수증을 현재 실행으로 재사용하지 않는다. 기존 일반 Blender normal drift와 플랫폼 production 실패는 미해결이다.

원본/native 기어에서 동일 런타임 저장·재열기는 이전 단계가 해결했지만 **현재 기본 native 기어의 Node↔Chrome 전체 GLB 일치 결함은 아직 미해결**이다. 후보/reference 성공은 native 편집·수정·납품 경로 성공의 대체 증거가 아니다.

## 다음 실제 작업

새 수학 정책을 선언하는 버전 있는 native IR과 명시적 마이그레이션/opt-in 편집 경로를 구현한다. 정책 없는 기존 IR은 기존 native 수학으로 그대로 재생성하고, 새 정책은 같은 매개변수를 새 입력 계약으로 생성한다. 알 수 없는 정책·이전 스키마의 새 필드는 거부해야 한다. 실제 원본 대응·UV/normal·국부 편집/undo·저장/재열기·엄격한 GLB·DCC 검증 후에만 제품 경로에 활성화한다. 현재 이 작업은 계획만 있으며 구현 완료로 표시하지 않는다.

증거: benchmarks/modeling-slices-20261004/gear-runtime-math. 입력/출력 및 소스 SHA는 file-manifest.json, 비교는 boundary-result.json/candidate-runtime-result.json/foundation-browser-result.json, 실행은 command-results.json, 시도와 실패는 attempts.json. raw work/gear-runtime-math-20261004 및 Documents/morphloom/outputs/gear-runtime-math-20261004를 보존한다. STORAGE.json은15MiB 한도와 무손실 압축/raw SHA를 연결한다. 사용자 원본 git index/별도 수정은 보존한다. 연속 Goal은 완료 처리하지 않는다.
