# ABO 겉모습 평가 (10차)

- 비교 대상: ABO 정답 GLB(텍스처 포함)와 후보(LLM IR 또는 통제 조건).
- 렌더링: 같은 위치·회전에 놓고, 같은 합성 카메라 8개(고도 20°, 256 px)로 렌더한다.
  - 알베도 패스: 조명 없이 기본색만
  - 조명 패스: 고정 중립 조명
- 지표:
  - 공통 마스크 위 CIEDE2000 중앙값
  - Lab 히스토그램 교집합
  - 질감 비율(Sobel L*)
  - SSIM
  - 마스크 IoU
- 코드: `src/eval/appearance-render.ts`, `src/eval/appearance-metrics.ts`, `scripts/abo-appearance-eval.ts`, `scripts/abo-appearance-summary.ts`.
- 사전 등록: `protocol.json`, `preregistration-hashes.txt`.

## 파일
- `phaseA-dev-controls.json`: 8차 dev 10건, 통제 조건 self/flat/hue/grey
- `phaseB-test-a1.json`, `phaseB-test-a2.json`: 9b test 33건의 LLM IR(사진 1장/2장)과 같은 IR을 회색으로 칠한 버전
- `phaseB-test-controls.json`: 같은 33건의 통제 조건
- `summary.json`: 사전 등록 판정

ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
