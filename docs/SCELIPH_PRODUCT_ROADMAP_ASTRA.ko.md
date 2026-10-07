# SCELIPH 제품 고도화 계획 — Astra 검토, 2026-10-04

상태: 계획만 작성. Goal paused 유지. 제품 구현·모델 설치·모델 추론·push는 하지 않았다. GPT-6 Astra가 코드·문서·실제 새 렌더를 읽기 검토했고 로컬 에이전트가 실제 상태와 대조했다. AI 협업 검토이며 독립 인간 전문가 평가가 아니다. UNI_AI/Claude CLI 추가 호출0.

## 기준과 실행 환경

- authoritative checkout: /var/folders/z4/_txy7z5d7hb83mc592z_cq540000gn/T/morphloom-publish-w4nfo7ko/repo
- HEAD: 3d26188af5951e7be77ffd0d5c3c9bdf15348fea, GitHub djfksjd/sceliph.
- 실제 장치: Apple M5 / 통합 메모리24GB. M5 Pro라고 확인된 것이 아니다.
- Node24.13.1 / Blender5.2.1LTS, compiler0.41.0 / element renderer0.12.
- 기존 사용자 변경·benchmark latest2개·node_modules·원본 checkout iCloud git index를 보존.
- 이 문서는 새 계획이다. 과거 상태 문서의 active/next 문구를 현재 Goal 재개로 취급하지 않는다.

## 실제 진행 내용과 제한

| 영역 | 실제 자산 | 남은 제한 |
|---|---|---|
| 원본·편집 | 안정ID, mm/right-handed Y-up, part/element patch, undo/redo, JSON 재열기, workspace | 지원되는 선언형 표현에 한정. 임의 메시/CAD 전체 편집기 아님 |
| 기계 생성 | 인벌류트 스퍼기어, 관통 bore, 회전체/chamfer, 11부품 개념 베어링 | 치근 근사, 간극 authored. 제조CAD·강도·수명·운동학 승인 없음 |
| 국부 수정의 원본화 | 검증된 단일 native 소스의 선언 평행이동→별도 sourceJSON→재생성 | identity 부모·정적 무텍스처 등 기존 제한 유지 |
| 신뢰성 | 빈 숫자 입력, stale export, source ordering, normal/gear arithmetic 결정성 개선 | 지원 범위의 버그 수정이며 외관 품질 성과와 다름 |
| 현재 좁은 검증 | 4기어 Node/browser whole GLB exact, optional normal kit4개 import/reopen·8mesh normal비교, 863tests126files/check/benchmark/build PASS | general Blender normal drift 및 전체 quality/production FAIL 유지 |
| 새 | 13기본 부품+86깃털; 실제 현재 GLB99meshes, skins0/animations0 | 실제 렌더의 방사형 가시깃·접합·비율 불량. 실사/종별 해부학 미달 |
| 사진 | 평균색/밝기/입력적합성/참고자료, authored IR에 사진 투영 | 일반 이미지→3D 자동 생성 아님 |
| 깊이/다중시점 | 상대깊이 worker·명시보정 가시표면, 정사영 visual hull 실험 | 숨은면·일반사진의 metric 복원 미검증. depth releaseAllowed:false |

현재 새 리뷰: ../outputs/product-review-20261004/bird/bird-full-iso.png 및 bird-full.glb/sourceJSON. 현재 생성/export와 실제 Blender 중립 렌더를 실행했다. 규격 검사 errors0/warnings0/INFO99 및 독립 WebIO 재열기 PASS이며 INFO 삭제 없음. 형상 합격과 별개다.

새 문제의 원인을 잘못 단순화하지 않는다. element-project.resolveElements에는 이미 ellipsoid 표면 normal 계산·정렬이 있다. 부족한 것은 부위별 접선 feather-flow, 층·겹침, 해부학과 연결이다. 기존 normal/frame/override를 재사용한다.

기어 기본 UV2258/1490/0개 작은 면적 진단과 명시10mm타일 편집 효과는 GEAR_PROJECTION_TILE_STATUS에 이미 있다. 같은 원인 조사를 새 성과로 반복하지 않는다. 해결되지 않은 기본 작업 흐름/atlas/실제 표면 표현은 별도 목표다.

## 제품의 두 목표

A. 시각 자산: 사진/텍스트에서 외형 후보를 얻어 장면에 사용. 외관·숨은면 추정·재질·속도·후수정 시간을 검증한다.
B. 치수 편집 자산: 측정·도면·선언 파라미터로 구조를 생성/수정. 치수·연결·원본 재생성·비대상 보존을 검증한다.

공통 IR/검수/저장/export는 유지한다. A의 보기좋은 메시를 B의 정확한 부품으로 인증하지 않는다. B의 테스트 통과를 A의 외관 완성으로 대체하지 않는다. LLM은 요구·구성·파라미터·수정안을 제안하고 기하·피팅·검사는 엔진이 수행한다.

이 계획은 전체 전분야 목표의 첫 제품 구간이다. CAD/BREP, 전문 캐릭터, GIS/volume, 범용 조립 구속·물리 시뮬레이션을 완료했다고 표시하거나 원래 장기 목표를 삭제하지 않는다.

## 단계1 — 고정 비교 기준선 (4~6 작업시간 상한 제안)

처음3범주 개발입력: 새1, 보유 제품1, 기계1. 검증입력은 각 범주에서 다른 형상/크기1씩 추가해 총6개를 고정한다. 새 사진의 사용권·동일개체/자세·출처가 없으면 해당 정확도 검증은 blocked다. 브랜드 벌 이미지를 실측자료로 사용하지 않는다. 기존 ABO 제품 자료는 현재 실제 파일·해시·권리와 다시 연결한다.

산출: 입력/권리/SHA manifest, 원본IR/GLB, 같은camera/light/resolution의 front/side/rear/iso+clay/material, 중요특징 실패표. 없는 후면자료는 구조검수다. 치수·실루엣·접합·관통·표면과 준비/후수정/실행시간·메모리·파일크기를 따로 측정한다. 관측/실측/추정/authored를 구분하고 결과를 본 뒤 기준을 바꾸지 않는다. 기존5% critical tooth/strictbytes/releaseAllowed 불변.

새 성공은 단순 feather-count나 닫힘이 아니라 부위별 실루엣·날개배치·발접합·깃털방향/겹침이다. 기계 성공은 치수·구멍·선택볼의 수정/추출/재열기/보존이다. 중요특징 실패를 평균으로 숨기지 않는다. 6시간 후 기준선이 부족하면 부족자료와 범위를 기록하고 다음 구현을 무작정 늘리지 않는다.

## 단계2 — 생성 경로의 실제 선택 (첫10시간은 기준선+제한 실험)

두 경로를 동시에 대형 구현하지 않는다.

- Native 새 품질 실험: 6~10시간 상한, 몸/머리/날개/다리 연결과 지역별 feather-flow/겹침. 기존 연산·ID·override·seed 재사용. 고정시점에서2번 후보 수정 후 뚜렷한 개선이 없으면 같은 방식의 부품/노이즈 증가를 중단하고 표현·자료를 재진단. 목표는 우선 일관된 정적 스타일 새이며 비행/실사 리그 아님.
- 선택형 로컬 neural 평가: 후보최대2개(SF3D/TripoSR). 설치·장치 확인2~4시간 상한. 1이미지로 실제메모리/시간/출력/실패부터 확인, 환경실패2회 후 새 가설없는 재시도 금지. 기본유료외부3D/API 의존성 추가 없음. 모델/의존성/입출력 해시·license·seed/config/version을 기록하고 원본사진 외부업로드 없음.

현재 AGENTS는 전용3D neural model을 금지한다. 사용자의 최신 선택형로컬모델 검토 방향을 실제 구현 범위로 선택할 때 그 예외의 모델·실행·원본보존·비용을 명시해 계약에 연결한다. 현재는 계획만이며 설치·실행을 승인된 완료처럼 표시하지 않는다.

SF3D: MPS experimental/공식32GB미만CPU고려, 현재M5 24GB에서CUDA광고속도를약속하지않는다. CommunityLicense(사용/배포/표시조건)이며 MIT아님. 여러사진CLI는별도모델batch, multiviewfusion아님.
TripoSR: 공식코드/가중치MIT, 현재Mac 설치·CPU/MPS속도/품질은not-run.
TRELLIS.2: 공식Linux/NVIDIA24GB이상, 현재Mac 첫후보아님. 외부GPU구매/클라우드/유료작업은별도범위.
공식근거: https://github.com/Stability-AI/stable-fast-3d ; 해당LICENSE.md/run.py ; https://github.com/VAST-AI-Research/TripoSR ; https://github.com/microsoft/TRELLIS.2

동일입력/seed/weights/config로3회 추론 파일을 실제 비교한다. 불일치가 있으면 기존 native 결정성 계약의 PASS로 승격하지 않는다. 생성출력은 SHA로고정된 독립candidate 원본으로 남기고 import후편집replay는 별도의strict계약으로검증한다. 비결정성/후면추정/실제자료오차를 명시한다.

선택 gate: 개발입력뿐 아니라 고정검증입력에서 외형·재질·후수정비용이 유용한지 비교. 못실행한모델은blocked/not-run. 보고서/메타데이터만 늘면 다음 통합으로 넘어가지 않는다.

## 단계3 — 원본 메시 보존과 좁은 편집 (12~20 작업시간 제안, 선택결과 의존)

현재 WorkspaceAsset.source는ElementProject뿐이다. 모델worker만붙여도편집가능해지는것이아니다. 기존GLTFLoader/export/검사 재사용 여부를 먼저 확인하고 native와다른 imported-mesh source를버전계약으로추가한다. 원본파일·텍스처·출처·입력SHA·알려진단위/좌표·손실을보존한다. 구버전native/workspace의명시마이그레이션·거부조건·실패rollback제공.

처음지원: 실제node/primitive선택·isolate, 전체asset또는실제분리node의명시이동/재질수정과별도편집layer. 원본불변. 한덩어리meshtooth를분리부품으로인증하지않는다. 임의mesh→parametricIR역변환·스컬프팅·리그범위확대없음. UV/normal/index/PBR/texture/hierarchy/extensions중무엇이보존/변경/미지원인지파일로검사. unsupported는부분적용없이거부.

성공2사례: 생성새위치/재질수정저장재열기, 실제분리제품node이동및비대상보존. 원본과수정파일별도반환·source패키지재열기·undo. 지원불가속성을조용히버리면실패.

## 단계4 — 기존 UI의 끝까지 이어지는 사용자 흐름 (8~16 작업시간 제안)

입력추가→후보생성→고정시점비교→채택→지원편집→저장/새세션재열기→Blender사용. 기존Element/Workspace/검수뷰를재사용하며새DCC전체재작성없음. 소스표현에따라파라미터편집/메시참고의가능범위가분명해야한다. 모델미설치여도native편집은동작.

worker단일작업·진행/취소/timeout/error/한정retry. 입력교체·늦은읽기·실패·unmount의현재intent소유권정책재사용. 실제브라우저파일선택·다운로드·재열기·추가편집검증. CLI한번성공을UI완료로표시하지않는다.

## 단계5 — 좁은 납품과 독립 검수 (8~16 작업시간 제안, 전문가 일정별도)

첫대상: 정적시각GLB+편집원본, 별도치수기계결과. normal/UV/PBR/텍스처/명명/계층실제파일과Blender첫import·재export·재import를분리한다. 지원형식의손실·수정가능범위를기록.

일반Blendernormaldrift≠선택형normalkit성공. 현재kit는texture/rig/animation/morph를지원하지않아일반neural출력의만능해법이아님. crossdomain final strictcompetitive 실패는정책·교환계약원인으로해결하고UV삭제/dummytexture/정보숨기기/임계완화금지. 현재src수정후 check/test/benchmark/build/두quality및관련검사를실행. 이전성공자료재사용금지. 전체gate실패면전체production미완료.

모델러의새형태/깃털/표면검수, 제품모델러의실루엣/부품/편집검수를별도진행. unavailable는not-run. 제조를주장하려면CAD/기계전문가·실측자료추가필요. AI평균점수로대체하지않는다.

## 진행 표시와 중단 규칙

기존40%는측정된제품완성률이아니다. 현재새로운완성률부여없음. 아래12개를제안된첫alpha분모로하고 각상태/현재증거를판정한뒤관리한다: 입력고정,기준선,후보판정,새외관,제품외관,기계치수편집,원본보존import,지원편집,새세션재열기,Blender왕복,기존strict납품gate,독립검수. 문서작성/테스트수/커밋수를외관성과로세지않는다. N/12는이alpha이정표수이며전분야전체완성률이아니다. CAD/전문캐릭터/다중시점자동복원등장기요구는별도지원매트릭스에남긴다.

각시도: 가설→현재실패→최소수정→실제파일/화면결과→다음판단. 동일실패2회후재진단. 검증된코드변경이없으면전체검사반복하지않음. 자원/설치실패·자료부족·앱미사용은차단이유를명시. 사용자변경/원본보존. 의미있는제품구간단위batch기록,이번계획문서push없음.

시간은확약이아니라검토용작업예산이다. 현재모델실행성과와독립평가일정이없어전체완료일예측불가. 첫4~6시간기준선·첫10시간후방향재판정,후속30~50시간은초기탐색상한이며범위/실패에따라재산정한다. 예산소진을목표완료로표시하지않는다.

가장가까운두작업: (1) 대표입력과현재실제결과의고정비교/실패표 (2) 그자료에서native새품질실험또는선택형로컬모델제한평가를하나선택. 현재는시작하지않았고Goal paused다.
