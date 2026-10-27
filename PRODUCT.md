# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- 3D 아티스트와 엔지니어. 생성된 결과를 검수·부분 수정한 뒤 Blender, Unity, Unreal, Godot 같은 DCC/엔진으로 넘겨 계속 작업한다.
- Codex/Claude 같은 개발 에이전트를 CLI에서 쓰는 사용자. 에이전트가 자연어 요청을 선언형 IR(`morphloom.assembly/0.1`, `morphloom.character/0.2`)로 쓰고, 이 사람은 브라우저 뷰어에서 결과를 확인한다.
- 평가·연구 작업 중인 개발자. 벤치마크(예: ABO 사진→IR 비교 결과)를 여러 개 열어 나란히 비교한다.

## Product Purpose
Sceliph(구 Morphloom)는 사진, 도면, 실측값, 자연어 요구를 선언형 IR로 정리하고, 로컬 기하 엔진에서 메시와 PBR 재질을 만드는 오픈소스 로컬 3D 에셋 도구다(Apache-2.0, v0.4 alpha).

결과 뷰어는 CLI/에이전트가 만든 결과를 다음 순서로 다룬다.
1. 연다.
2. 부품 단위로 고르고 분리하고 측정하고 수정한다.
3. 납품 게이트(GLB 재열기 검증, 품질 점검)를 확인하고 내보낸다.

성공 기준: 사용자가 결과의 품질과 근거 수준을 정직하게 파악하고, 필요한 부품만 고쳐 DCC 툴로 넘긴다.

## Positioning
- 메시를 바로 뱉는 생성기가 아니다. 사람이 읽고 고칠 수 있는 IR이 원본이다.
- 모든 부품이 안정 ID, 근거 상태, 파라미터를 갖는다.
- 엔진이 형상을 결정적으로 계산한다. 같은 IR은 같은 GLB가 된다.
- 기본 경로에 유료/전용 3D 생성 API가 없다. LLM은 IR을 쓸 뿐이다.

## Operating Context
- 자연어 요청은 CLI(Codex/Claude Code)에서 하고, 결과는 브라우저에서 본다.
- 뷰어의 ⌘K 명령 바는 dev/preview 서버의 로컬 브리지(`vite-plugins/sceliph-assist.mjs`)를 거쳐 사용자의 Claude Code CLI(사용자 플랜)를 호출한다. 이때 현재 IR과 화면 스냅샷이 Claude로 전송되며, UI에 그렇게 표시한다. 정적 빌드에는 브리지가 없다. 수정은 부품 단위 변경 JSON으로만 받고, 범위 검사와 IR 검증을 거쳐 사용자가 승인해야 적용된다.
- 로컬 전용이며, 명령 바를 쓰지 않는 한 업로드가 없다. 가져온 IR은 브라우저 메모리에만 있고, 새로고침이나 명시적 제거, 30분 만료로 사라진다.
- 결과 종류: 제품 어셈블리(전자기기, 가구, 조명), 건축 셸(층, 주야 조명), 표면 재질 벤치마크, 인체 캐릭터(OHPK 팩).
- 내보내기: GLB, OBJ, STL(mm), PLY, USDZ, Figma SVG, PNG, 에셋 팩, IR JSON, Netlist, Blender 노멀 키트.
- 관련 화면: `/?editor=elements`, `/?editor=workspace`, `/?editor=evidence`, `/?editor=depth`. 이번 범위는 루트 결과 뷰어(`/`)다.

## Capabilities and Constraints
- 스택: React 19 + TypeScript + Vite + Three.js r179. 기존 엔진과 뷰포트 계약(`ResultViewport` handle)을 유지한다.
- 루트 결과 뷰어는 같은 URL에서 전면 교체한다(2026-10-27 결정). 기존 기능은 모두 유지한다: 표시 모드, 카메라 프리셋, 건축 층과 주야 조명, 두 점 실측과 주요 치수, 품질 점검, 충실도 계약, GLB 재열기 검증, 브라우저 왕복 증빙, 부품 편집과 Undo/Redo, 배치 편집, 내보내기 대기열, 가져온 세션 만료.
- 열어 본 결과 파일은 세션 라이브러리 목록에 남아야 한다. 여러 파일을 열 수 있어야 하고, 덮어쓰면 안 된다(2026-10-27 사용자 지적).
- UI 언어: 한국어, 영어, 일본어, 중국어 전환(2026-10-27 결정).
- 아직 없는 기능(예: 뷰어 내 자연어 명령)은 동작하는 척하지 않고 정직하게 표시한다.

## Brand Commitments
- 이름 SCELIPH, 슬로건 "Shape things into existence", 로고 컴포넌트 `src/SceliphIcon.tsx`, 브랜드 비주얼 `assets/brand/sceliph-hero.png`
- 기존 스키마와 명령 이름 `morphloom.*`는 호환성 때문에 유지한다.

## Evidence on Hand
- 예제 자산: Galaxy Z Fold8 외장, TEC 쿨러 어셈블리, 폰 어셈블리, 장식 칼날, Laurel Homes 건축, HABS 캐빈, ModernCat 콘셉트, Talon Ruby, 아스팔트 표면, 암묵 표면, 새 형태 연구, 인체 2종
- ABO 비교 결과: `benchmarks/oss-integration-20261026/abo-multiview/`(1장/2장 IR, 점수)
- 표시 자산은 창작 예제다. 사진 복원 정확도나 제조 정확도를 인증하지 않는다. 품질 수치를 부풀리거나 지어내지 않는다.

## Product Principles
1. 뷰포트가 주인공이다. 판단에 필요한 정보만 뷰포트 곁에 둔다.
2. 근거를 정직하게 표시한다. 실측·데이터시트·추정·추론을 구분하고, 막힌 게이트는 이유와 함께 보여준다.
3. IR이 원본이다. 편집은 IR에 반영되고 내보내기와 같아야 한다.
4. 로컬과 결정성: 업로드 없음, 같은 입력은 같은 결과.
5. 비교가 일상이다. 여러 결과를 쌓아 두고 빠르게 오간다.

## Accessibility & Inclusion
- 4개 언어(ko, en, ja, zh). 키보드 단축키와 aria 상태(aria-pressed 등)를 유지한다. `prefers-reduced-motion`을 지킨다.
