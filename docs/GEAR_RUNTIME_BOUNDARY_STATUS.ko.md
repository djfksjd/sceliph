# 기어 런타임 계산 경계 — 2026-10-05

## 범위와 실제 결과

원격 CI legacy diagnostic tooth 바이트 실패의 원인을 추가 분리했다. 제품 기본 계산·기준 GLB·기존 테스트·임계값은 바꾸지 않았다. Raptor 라이선스나 저장소는 수정하지 않았다. 코드 push와 외부 모델 API 호출 없음.

같은 Node20.19.0/Linux, 컨테이너2CPU/4GB에서 arm64와 amd64를 비교했다. amd64는 Apple M5의 에뮬레이션이며 GitHub 러너를 직접 실행한 증거가 아니다. 각 Docker 실행240초 제한, 컨테이너는 --rm 및 timeout 시 이름으로 삭제한다. 진단 source copy는 현재 authoritative checkout의 src이며 원격HEAD archive와 구분한다.

가설1: Math 함수에서 플랫폼 차이가 발생한다. 19,117개 호출을 계측했고 최초 차이는 동일 입력 Math.sin(0.456643833478302): ARM0.4409383109363499, x640.44093831093634994였다. 전체130개 호출 차이는 입력 전파 차이도 포함하며130개 독립 오차라고 해석하지 않는다. 이후 동일 입력 atan의 차이도 존재했다. 최종 추출 points/23/1 및25/1만 달랐다.

가설2: 최종 두 지점 차이가 sin 경계로 설명된다. ARM trace의 동일 입력 결과를 진단 환경에서 함수별로 대입했다. sin만 대입하면 추출 geometry JSON이 완전히 같아졌다. atan/cos/tan/atan2/acos/hypot만 대입하면 두 지점 차이가 남았다. 이는 단일 fixture 원인 분리 실험이며 제품의 lookup table이나 ID 예외가 아니다. 진단용 Math 변경은 finally에서 원복하며 활성 제품 경로에 연결하지 않았다.

Math.sin/atan은 ECMAScript의 implementation-approximated 연산이다: https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.sin . 임의 Math 런타임과 과거 특정 플랫폼의 Float64 바이트를 동시에 동일하다고 보장하지 않는다. legacy를 기존 explicit 정책으로 조용히 바꾸거나 source 좌표를 반올림하면 과거 파일 계약을 바꾸므로 그런 수정을 하지 않았다. 기존 strict fixture의 x64 실패는 해결 미완료다. Blender 첫 import normal drift와 다른 원인이다.

## 추가한 실제 재현 도구

scripts/gear-runtime-evidence.ts: 네 기어 크기/잇수, legacy 및 기존 explicit IEEE 정책, 전체 기어/diagnostic tooth의 실제 source JSON·GLB16개와 SHA를 새 디렉터리에 생성한다. source migration과 정책 변경은 비교용 별도 복사본에만 적용한다. 출력 디렉터리가 존재하면 거부하며 기존 증거를 덮어쓰지 않는다. 메시와 임시 FileReader는 finally에서 정리한다.

scripts/compare-gear-runtime-evidence.ts: 두 디렉터리의 고정16쌍 실제 파일을 읽어 전체 GLB 및 source JSON bytes를 비교한다. manifest PASS/hash는 신뢰하지 않으며 파일당32MiB 읽기 상한이다. 한 파일 차이도 전체 exit1이다. tolerance 비교/평균/기준 덮어쓰기는 없다. 동일 디렉터리 비교 exit0, ARM/x64 비교 exit1, 기존 생성 디렉터리 덮어쓰기 요청 exit1을 확인했다.

실제파일: 네 legacy 전체 기어 GLB/source는 플랫폼 간 동일, 네 legacy diagnostic tooth는 불일치. 기존 explicit IEEE 정책의 전체 기어4·diagnostic tooth4 GLB/source는 모두 byte-exact다. 동일 입력 정책의 프로필·추출 좌표도 네 사례 모두 exact였다. 새 정책이나 생성 기능을 구현한 것으로 주장하지 않고 기존 정책의 검증 범위를 늘렸다고 기록한다. implicit normal, UV, material 등 플랫폼 전체의 결정성으로 일반화하지 않는다.

양 플랫폼 GLB32개에서 기존 Khronos validator와 독립 WebIO 재열기 exit0. 이번 Blender 첫 import/reexport와 실제 브라우저 신규 검증은not-run이다. 이번 단계는 런타임 진단/검증 도구이며 시각 품질 개선이나50% 달성이 아니다.

## 재현

npx vite-node scripts/gear-runtime-evidence.ts <존재하지-않는-디렉터리>
npx vite-node scripts/compare-gear-runtime-evidence.ts <ARM-디렉터리> <x64-디렉터리>
npm run gltf:validate -- <실제-glb-파일>

현재 입력·출력SHA, 명령 결과, trace 및 개입 비교는 outputs/gear-math-boundary-20261005/manifest.json에 보존한다. npm run check는 src와vite.config만 포함한다. 신규 Node CLI의 별도 tsc 시도는 기존 @types/node 부재(TS2688)로blocked이며 dependency를 추가해 숨기지 않았다. CLI 자체는 양 플랫폼 vite-node 실제 실행으로 검증했다.

원격CI timeout3개 및 필수status check 연결은 미완료다. 다음 한 작업은 legacy의 원본 Float64 좌표를 보존하면서 추출을 재생성하는 명시적 입력 계약을 검토하는 것이다. 런타임 특정 출력과 새 결정론 정책을 자동 혼합하지 않는다. 전체 납품/production-ready를 주장하지 않는다.
