# Sceliph 부품 편집 사전 검사 · 2026-10-06

## 범위와 구현

기어 편집 중 잘못된 치수 조합이 chamfer 상한 계산에서 예외를 발생시키는 결함을 수정했다. 새 `gearEditPreflight`는 기존 `validateSpurGear`, `gearChamferMaximum`, `validateGearChamferAmount`를 재사용하며 원본을 변경하지 않는다. 최종 Apply는 기존 `editPart`와 실제 기하/토폴로지 검사를 계속 실행한다. 사전 검사 통과는 납품 승인이나 토폴로지 PASS가 아니다.

숫자 입력은 빈 값, 비유한 값, 표시 범위 초과, 소수 잇수를 별도 입력 상태로 보존하고 적용을 막는다. 모듈 0.2..5 mm, 치폭 0.1..100 mm를 기존 엔진 계약에 맞춰 표시했다. 치수 조합 오류는 화면에 이유와 복구 안내를 보여준다. ID·좌표계·단위 표시, 숫자 정렬, 오류·focus·잠금 상태, 적용/취소 영역과 좁은 화면 줄바꿈을 정리했다. 기존 Sceliph 시각 체계와 기능은 유지한다. 새 기하 연산 또는 시각 품질 향상 검증으로 간주하지 않는다.

## 기준 상태와 환경

이전 체크아웃 `/private/var/folders/z4/_txy7z5d7hb83mc592z_cq540000gn/T/morphloom-publish-w4nfo7ko/repo`는 소스가 남았으나 `.git/HEAD`, AGENTS 및 구성 파일 일부가 사라져 git status/HEAD 확인 불가다. Git 메타데이터를 복구하거나 변경하지 않았다. `/Users/danny/Documents/morphloom`의 기존 파일을 읽어 `/private/tmp/sceliph-refine-20261006`에 검증 사본을 만들었고 남아 있는 이전 체크아웃 파일을 우선했다. 충돌 10개(대부분 과거 benchmark 영수증)는 `snapshot-origin.json`에 기록했다. GitHub 최신 상태와의 동등성은 미확인이다.

macOS arm64, Node24.13.1, Vitest3.2.7, Vite7.3.6. 의존성 추가 없이 설치된 node_modules를 작업 사본 안에 복사했다. 사용자 원본 사본/공용 의존성 캐시는 수정하지 않았다. 변경 5개 파일은 이전 체크아웃의 원본 바이트를 확인한 뒤 그 경로에만 통합했다. Documents 사본 및 Raptor는 수정하지 않았다. commit/push 없음.

## 시도와 결과

1. 가설: 잘못된 기어 중간 치수가 `gearChamferMaximum` 예외로 화면을 깨뜨린다. 기존 함수에 잘못된 보어를 전달하면 throw, 수정된 실제 React component의 정적 렌더는 오류 메시지와 Apply 차단을 유지함을 테스트했다.
2. 변경: 비파괴 사전 검사 + 유효 범위 입력 차단 + 편집 화면 정리. 기어/UV 관련 12개 테스트 통과, 추가 실제 React 정적 렌더 테스트 2개.
3. 초기 전체 실행: 작업 사본에서 `sim/tds_safety.py`, `sim/pcb_params_v2.json`을 누락해 951통과/2실패. 원래 파일을 변경 없이 보완해 관련6개 통과. 실패 로그 유지. 보완 후 최종 `npm test`: 144 files /953 tests PASS, 103.34초. 테스트 삭제/skip/임계값 변경 없음.
4. 현재 `npm run check`, `npm run build`, `npm run benchmark` 통과. Impeccable detector는 빈 결과지만 시각 승인 증거는 아니다.
5. `quality:gate`, `quality:production` exit1. 기존 전자 조립 근거52/90 및 Blender acceptance 부족 등 전체 납품 미충족을 유지한다. production 후속 dominance는 gate 실패로 not-run. 게이트는 로컬 코드/파일 실행이며 모델 API 호출을 하지 않는다. 기존 외부 앱 영수증을 새 앱 실행 증거로 취급하지 않는다.
6. 브라우저: 기존4179 화면은 읽었다. 수정 사본 Vite 서버는 listen EPERM, 오프라인 proof 파일 열기는 브라우저 보안 정책이 거부했다. 우회하지 않았다. 수정본의 desktop/mobile 시각·키보드·다운로드·재열기는 blocked/not-run. 실제 GLB/Blender 재열기도 이번 단계 not-run. 기존 legacy ARM/x64 기어 바이트 실패와 Blender normal drift를 해결했다고 주장하지 않는다.

## 증거·재현

검증 사본 `outputs/inspector-refine/`의 source-manifest.json에 5개 현재 소스 SHA256, before 원본, changes.patch, 최초 실패 로그, 테스트·빌드·benchmark·gate 로그를 보존한다. 오프라인 browser-proof.html은 실제 수정 ElementEditor 코드로 번들한 검증용 산출물이며 브라우저 실행 성공 자료가 아니다.

```sh
cd /private/tmp/sceliph-refine-20261006
npm test
npm run check
npm run benchmark
npm run build
npm run quality:gate
npm run quality:production
npm run dev -- --port 5184
```

실제 브라우저 검증 재개 조건: 정상 Git 체크아웃 경로 및 그 소스의 로컬 서버에 접근 가능한 실행 환경. 다음 한 단계는 기어 편집에서 잘못된 보어/소수 잇수 입력 → 복구 → 적용/취소 → 저장/재열기를 desktop/mobile에서 확인하는 것이다. 이번 단계는 편집 안정성 구현이며 플랫폼 전체 완성도/50% 달성 선언은 하지 않는다.
