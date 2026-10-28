# Claude 견해 (Codex 1라운드 전에 고정, 2026-10-29)

## 남은 작업량
두 갈래다.
A. 사진→IR 품질(10~16차 연구 줄기)
- 측정된 강점: 치수(높이 0.4%, 가로·깊이 5~7%), 구조, 색(ΔE00 7).
- 병목: 텍스처(절차적 패턴뿐), 사진 기반 미세 보정(3회 실패), 작은 부품 배치.
- 측정 공백 1: ABO 평가는 TABLE/DESK/SHELF/CABINET/DRESSER/STOOL/LAMP/LIGHT_FIXTURE/ELECTRIC_FAN/STORAGE_BOX뿐이다. 의자·소파·침대처럼 유기적 곡면 제품은 측정한 적이 없다.
- 측정 공백 2: 사람 지각 평가가 없다(competitive "same-reference perceptual winner: not established").

B. 납품·운영 게이트(이전 연구 줄기)
- quality:gate exit 1: Blender 교차 도메인 2건 benchmarkAccepted=false, Unity not-run, 전자 실물 근거 52/90, dominance claim 없음.

## 권장 순서
1. 12차 재검증 마무리(약 $4). 결론을 닫는다.
2. ABO 평가를 유기적 범주(의자, 소파, 침대)로 넓혀 측정 공백을 메운다. 어휘가 필요한지는 그 결과로 정한다.
3. 사람 지각 평가 프로토콜: ABO 정답 렌더 대 LLM IR 렌더를 블라인드로 비교하고, '상품 에셋으로 쓸 수 있음' 비율을 잰다.
4. 텍스처: UV 기반 사진 투영(B3). 가장 눈에 띄는 격차다.
5. B 갈래: Blender 수락 영수증 갱신 같은 저비용 항목은 병행한다.

## 의심하는 점
- 60% 종합 수치는 가중치 의존적이다. 프로젝트 문서는 전체 % 주장을 피해 왔다.
- 기하 지표(IoU 등)와 정답 개선이 16차에서 어긋났다. 지표 자체를 검증해야 한다.
