# LLM 선언형 네이티브 모델링 — 표면 방향 편집

기준 HEAD: 3d26188af5951e7be77ffd0d5c3c9bdf15348fea, main. 이 단계는 별도 3D 학습 모델·UNI_AI·Claude 호출 없이 진행한다. 기존 benchmark latest와 node_modules 변경은 사용자/선행 실행 상태로 보존한다. 원본 Documents 저장소의 iCloud git index는 수정하지 않는다.

## 고정한 범위

기존 ellipsoid-surface 그룹의 생성 요소에 owner-local 방향과 표면으로부터의 elevation(0–85도)을 지정하고 회전 override에 굽는다. 길이·폭·두께는 mm, 방향은 무차원, 저장 회전은 rad. 사용자는 그룹을 선택해 방향 XYZ와 각도를 입력하고 Apply surface flow, Undo/Redo, Save project JSON, Load JSON, Export project를 사용할 수 있다. 이 연산은 LLM이 호출 가능한 로컬 함수이며 현재 자연어 프롬프트 자동 연결을 추가한 것은 아니다.

IR 0.1–0.8의 기존 rotation override와 검증기를 재사용한다. 기존 파일이나 기본 새 생성의 출력은 자동 변경하지 않는다. 연산은 선택 그룹의 생성 요소 회전만 명시적으로 교체한다. 파라미터·위치·삭제·분리된 요소·비대상 그룹은 보존한다. 회전한 부모와 다른 크기의 타원체에서 수학 검증은 했지만 그 사실을 기존 GLB 이동 binding 계약의 부모 지원 확대로 취급하지 않는다.

접선은 타원체 gradient normal에 원하는 방향을 직교 투영해 계산한다. 접선과 normal의 혼합으로 길이 축을 만들고, 폭/두께 축을 직교 프레임으로 만든다. 기존 resolver의 프레임을 역변환해 local delta로 저장한다. 이전 delta를 제거한 기준을 사용해 재적용 시 누적 회전을 막는다.

잠긴 부모/요소, 비타원체, volume 배치, 생성 요소가 없는 그룹, 영벡터/비유한 방향, normal과 평행한 방향, 중심 root, 범위 밖 각도는 전체 적용 전에 거부하며 원본은 불변이다. 조류 해부학·층별 뿌리 배치·깃털 겹침·사진 복원·리그·제조 정확도는 이번 연산이 제공하지 않는다.

## 시도 기록

1. 가설: 깃털이 돌출하는 일부 원인은 normal 정렬에 더해 접선 흐름이 없는 데 있다. 기존 normal 정렬은 이미 존재한다. 변경 전 sourceJSON/GLB를 보존하고 방향·보존·저장·잠금 사례를 테스트로 정의했다. 최초 red는 신규 연산 모듈 부재이며 원래 결함의 시각 증거는 before 렌더다.
2. 변경: generic applyEllipsoidSurfaceFlow와 기존 inspector/History를 연결했다. 단일 새 ID의 예외나 새 스키마·의존성은 없다. 최초 타입 검사 실패는 기존 numberField 인수 수를 넘긴 UI 연결 실수였고 수정 후 통과했다.
3. 검증: 몸통 50개 깃털만 -Z/15도 적용. 동일 1024² clay/isometric/조명과 원본 bounds에서 계산한 고정 공간으로 before/after를 Blender에서 렌더했다. 몸통 돌출은 줄지만 날개·꼬리와 발 결함은 남는다. 전체 조류 품질 성공으로 판단하지 않는다.
4. 브라우저: 실제 Apply, 저장, Undo 저장, 새 브라우저 세션 Load, 재저장, 재적용 저장을 수행했다. 선택 메타데이터를 제외한 fresh reload/reapply/undo source 일치를 확인했다. Node와 Chrome 새 회전 계산은 마지막 double 자리에 차이가 있어 cross-runtime 바이트 일치를 주장하지 않는다. 같은 런타임 재생성의 엄격한 바이트 검사는 별도다.
5. 다운로드 자동화의 다중 파일에서 sourceJSON을 .glb 경로에 잘못 포착했다. 실제 GLB validator가 INVALID_MAGIC으로 차단했다. 실패 파일/로그는 보존하고 전용 다운로드 디렉터리에서 실제 파일명·magic을 확인해 재검증한다. 제품의 검사 기준을 낮추지 않는다.

## 다음 방향

별도 로컬 3D 생성 모델 후보 실험은 사용자 목표에서 제외한다. LLM의 역할은 검증 가능한 모델링 연산/파라미터 선언과 제한된 수정 제안이다. 이후에는 몸통·목·날개 연결과 지역별 반복 뿌리/층별 겹침을 실제 기하로 개선한다. 랜덤 노이즈나 부품 수 증가로 품질을 대체하지 않는다. 대표 개발 사례와 다른 크기/형상의 검증 사례를 분리한다.

증거: outputs/surface-flow-20261004. 전체 production 상태는 이전 gate 실패와 분리해 기록한다. 이번 표면 흐름 연산의 개선을 플랫폼 완성이나 사진 정확도 측정으로 확대하지 않는다. Goal 도구는 paused이며 현재 사용자 재개 지시는 유효하나 도구에 resume API가 없어 상태 변경을 했다고 주장하지 않는다.

## 현재 수정본 결과

npm test: 127 files / 867 tests PASS, npm run check/benchmark/build: exit0. npm run quality:gate 및 quality:production: exit1. local scripts를 확인했으며 이번 실행에서 유료/API 호출 없음. quality의 required rates는 모두1이며 actual rates도 모두1. competitive의 기존 electronicsAssembly 두 check와 Blender cross-domain/edit acceptance 등이 남아 production이 차단된다. 현재 core snapshot과 baseline diff에서 표면 흐름 모듈은 기존 cross-domain compiler를 변경하지 않았으므로 이를 이번 기능의 회귀로 분류하지 않는다. production의 dominance 단계는 앞 gate 실패로 not-run이다. 전체 플랫폼 완료를 주장하지 않는다.

실제 after.GL B(파일명 after.glb)는 topology99/99 watertight, boundary/non-manifold/degenerate/self-intersection0. 이 검사는 개별 메시의 상태이며 서로 다른 메시의 관통을 보증하지 않는다. 모든 mesh의 실제 position/normal/UV/index 배열과 material 선언 및 비대상 node 행렬을 원본과 정확히 비교했다. 같은 Node sourceJSON 재생성 바이트 일치. 브라우저 새 세션 재열기·Undo·재적용·실패 원본 보존, 실제 GLB 반복 바이트 일치. 두 현재 GLB의 Khronos errors0/warnings0, 독립 WebIO 재열기 성공. Blender5.2.1 첫 import99mesh 성공; 재export와 독립 인간 검수는 not-run.

전체 그룹 방향 후보 all-flow는 방향이 정돈되지만 랜덤 뿌리 배치와 해부학 결함이 남는다. 기본 새 생성에 자동 적용하지 않았다. 다음 한 작업은 지역별 뿌리/층별 배치 연산의 실패 사례와 품질 계약을 고정하는 것이다. 이번 기능은 방향 편집 경로만 검증했으며 자연어 LLM 자동 생성·전체 조류 납품은 미완료다.

증거의 results.json/manifest.json은 코드 SHA와 actual input/output SHA를 담는다. 잘못 포착한 JSON-as-GLB 실패와 로그도 보존한다. 시작한 날짜로 evidence directory가20261004이며 완료 기록은20261005다. push/commit은 하지 않았다.
