# Sceliph 기어 제약 진단 개선 · 2026-10-06

## 실제 변경

`validateSpurGear`의 기존 허용 범위와 계산식을 유지하면서 실패한 항목을 구조화했다. `SpurGearValidationError.issue`에는 범위·정수 잇수·보어 여유·언더컷·산술 정책 오류 코드, 필드, 필요한 경계값만 제공한다. 입력 원본이나 임의 내부 데이터를 진단에 포함하지 않는다. `gearEditPreflight`는 이 진단을 복사해 반환하며 실제 화면이 이미 사용하는 reason에 구체적 복구 안내가 연결된다. 적용 실패 차단과 최종 editPart 검증은 유지한다.

예: 모듈1 mm, 잇수24에서는 기존 보어 제한 식 `module*(teeth-2.5)-module*0.1`의21.4 mm가 배타적 상한이다. 보어21.4는 계속 실패하고21.399는 허용한다. 이 기준은 기존 시각화 계약이며 제조 공차·강도·가공 승인 기준으로 주장하지 않는다. 허용 파라미터 범위에서 언더컷 계산은 기존 체크를 유지하며, 새 지원 범위를 추가하지 않는다. 알려지지 않은 산술 revision과 부품별 예외도 허용하지 않는다.

새 형상 연산이나 모델 외관 개선이 아니라 엔진의 실패 진단과 편집 복구 경로 개선이다. IR/직렬화 스키마, 기하 산술 정책, 생성 기본값, UV5% 임계값과 기존 GLB 바이트 계약은 변경하지 않았다.

## 원인·시도

기존 메시지는 범위·보어·잇수·출처 오류를 포괄적 오류 하나로 표시했다. 먼저 경계값·필드 진단·입력 보존 테스트3개를 작성해 실패를 보존했다. 최소 구현 후 첫 관련 검사에서 테스트가 issue 내부 필드를 오류 루트 필드로 잘못 기대해1개 실패했고, TypeScript unknown 좁히기2개도 실패했다. 테스트를 선언한 issue 구조에 맞추고 실패 분기의 명시적 never 반환으로 수정했다. 허용 범위나 기대 경계값을 수정하지 않았다. 중간 로그는 삭제하지 않았다.

수정 전 실제 validator 소스 사본과 수정 validator에557개 입력을 전달해 허용·거부가 전부 같은지 확인했다. legacy/명시적 IEEE 정책의12개 실제 기어 profile JSON은 정확 일치했다. 이 비교는 현재 macOS arm64 로컬 런타임의 범위이며 legacy ARM/x64 차이를 해결한 증거가 아니다.

## 현재 실행·파일

환경: `/private/tmp/sceliph-refine-20261006`, macOS arm64, Node24.13.1. 정상 Git HEAD/branch 확인은 기존 작업 경로의 Git 정보 누락 때문에 blocked. 과거 HEAD를 현재 상태로 보고하지 않는다. 이전 상태·구성은 snapshot-origin.json에 있다. source fingerprint와 현재 산출물 SHA는 이번 outputs manifest에 연결한다.

최종 관련19개 테스트·타입 검사·build·benchmark PASS. 첫 전체 실행은 테스트 구조 가정 오류1개로 실패했고 보존했다. 수정 후 전체146 files /960 tests PASS,102.01초. results.json 및 npm-test-final.log에 기록한다. 현재 quality:gate와quality:production은 모두exit1. 기존 전자 조립 근거52/90·Blender acceptance 부족 등 전체 납품 실패를 유지한다. production 후속 dominance는gate 실패로not-run이다. 외부 모델 서비스와 UNI_AI/Claude CLI를 호출하지 않았다. 전체 게이트 실행은 로컬 코드/파일 검사이며 기존 앱 영수증은 재실행한 앱 검증으로 취급하지 않는다.

네 기어 사례에서 현재 수정본으로 original/moved/reopened GLB12개와 source JSON4개를 새로 생성했다. moved와reopened GLB 전체 바이트 일치, 이전 수정 전12개 GLB와도 전체 바이트 일치. 새 파일에 Khronos 검사와 WebIO 독립 재열기를 실행했다. 원본 이동0과 수정 이동[0.012,-0.003,0.005]m을 확인했다. 원본 IR 단위는mm, 좌표계는right-handed Y-up이다. files/manifest.json에 실제 파일별 SHA256이 있다.

## 제한과 다음 단계

이전 로컬 서버 및 Git 작업 경로 문제에 변화가 확인되지 않아 같은 서버 실패를 재시도하지 않았다. 수정 화면의 desktop/mobile 실제 조작·다운로드·재열기는blocked/not-run, Blender 첫 import와재export는not-run이다. 정적 React 검사와 CLI 성공을 UI 흐름 완료로 승격하지 않는다. 기존 전체 production 실패, legacy 플랫폼별 산술 차이, 일반 Blender normal drift도 별도 미해결이다. push하지 않았다.

다음 한 가지 작업은 정상 로컬 서버에서 새 오류 안내 → 치수 복구 → Apply/Cancel → 저장·재열기를 실제로 확인하는 것이다. 정상 프로젝트 경로/localhost 주소에 대한 사용자 응답이 필요하다. 이번 기능의 코드 검증과 전체 제품 납품 상태를 구분한다.

```sh
cd /private/tmp/sceliph-refine-20261006
npx vitest run tests/gear-validation-diagnostics.test.ts tests/gear-edit-preflight-preservation.test.ts
npm test
npm run check
npm run build
npm run benchmark
npm run quality:gate
npm run quality:production
npm run gltf:validate -- outputs/gear-diagnostics-20261006/files/*.glb
```
