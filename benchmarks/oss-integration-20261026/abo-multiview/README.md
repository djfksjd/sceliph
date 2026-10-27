# ABO 사진 2장 평가 (9차)

Amazon Berkeley Objects 턴테이블 사진으로 한 실험이다. 사진 1장(a1, 프레임 0)과 2장(a2, 프레임 0과 18 = 90°)으로 LLM이 쓴 AssemblyIR을 짝지어 비교한다. 상품명의 치수는 지우고, 리스팅 높이만 준다. 피팅은 쓰지 않는다.

기준선은 LLM 없이 만든다.
- b0: 상자
- b1: 정면 실루엣 돌출
- b2: 두 실루엣 시각 헐

## 파일
- `selection.json`: `abo-photo/selection.json`의 같은 시드 순서를 이어 뽑았다. test는 thin 24건과 other 12건, reserve는 6건과 3건이다.
- `protocol-dev.json`, `dev-sonnet/`: 8차 dev 10건(이미 노출됨)으로 프롬프트가 동작하는지만 확인했다.
- `protocol-test.json`: preregistration 블록에 항목, 교체 4건, 기준, 개발용 관찰을 담았다.
- `preregistration-hashes.txt`: 실행 전 해시와 시각이다.
- `test-sonnet-r{1,2,3}/`: 반복 3회 결과다.
- `test-summary.json`: `scripts/abo-multiview-summary.ts`의 출력이다.

다음에 선정할 때는 `--continue-from abo-multiview/selection.json`을 쓴다. 그러면 지금까지 쓴 100건을 건너뛴다.

## 출처
ABO data, images and 3D models © Amazon.com. Dataset: M. Guillaumin, T. Dideriksen, K. Deng, H. Arora, J. Collins, J. Malik. CC-BY-4.0.
