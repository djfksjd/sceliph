# 뷰포트 중심 편집기 정리 · 2026-10-09

사용자가 선택한 방향은 뷰포트 중심의 정돈된 작업 화면이다. Impeccable의 Operate/layout 기준으로 기존 어두운 작업 화면, 원래 기능·입력 계약·검사 한계를 유지했다. 새 UI 라이브러리나 외부 모델은 추가하지 않았다.

## 실제 변경

- 상단에 프로젝트 저장·Undo/Redo와 접이식 Load/export를 배치한다. 파일 읽기 실패·복구와 불완전 숫자 경고는 접이식 메뉴 밖에서 보인다.
- 뷰포트 도구와 부품 트리·캔버스·Inspector를 먼저 표시한다. 생성 설정·선언 요구사항·UV 검사·recipe·schema 옵션은 아래 Creation & inspection에 모았다.
- 선택 부품 재생성은 Inspector에 배치했다. 기존 source/declaration fingerprint와 async intent guard는 그대로 유지한다.
- 부품 선택은 강조색과 aria-pressed로 노출한다. mm·rad·PBR 입력과 기존 Apply/Cancel은 유지한다.
- editor 자체에 높이와 스크롤을 주어 전역 body overflow:hidden 때문에 아래 작업 영역이 잘리는 문제를 해결한다. Workspace 부모에도 스크롤 영역을 제공한다.
- 800px 이하에서는 뷰포트→높이가 제한된 부품 트리→Inspector 순서로 배치한다. 긴 ID·SHA·JSON 입력을 줄바꿈하고 좁은 화면의 컨트롤 크기를 보완했다.

변경 파일은 ElementEditor.tsx, WorkspaceEditor.tsx, element-editor.css와 문서다. 엔진·스키마·job·patch·검사 임계값은 변경하지 않았다. 편집기의 root capture, 파일 읽기 실패 차단, 수치 검증과 Undo/Redo 핸들러를 보존했다.

## 확인 범위

- 현재 npm test:162files/1033tests PASS.
- npm run check, npm run benchmark, npm run build PASS.
- 실제 React 서버 렌더에서 ball_0000의 선택 상태, 위치 입력과 변경 없는 Apply의 disabled 상태를 확인했다. 이는 브라우저/WebGL 조작 검수가 아니다.
- Impeccable 기계 검사 결과는 빈 배열이었다. 독립 소스 검토에서 위 가드와 모바일 규칙을 확인했으며 사람의 실무자 평가로 표시하지 않는다.
- 기존 정상 저장·내보내기/실패 차단 관련 회귀 테스트를 제거하거나 skip하지 않았다.

현재 npm run quality:gate는 exit1이며 두 quality 보고서는 기준선과 generatedAt을 제외하면 동일하다. 기존 Blender 증거와 electronics 근거 부족이 남는다. quality:production은 이번 UI 변경에서 not-run이고 성공으로 표시하지 않는다.

현재 서버 시작은 `listen EPERM: operation not permitted 127.0.0.1:4173`으로 실패했다. 최신 UI의 desktop/mobile 렌더·포커스·클릭·저장/재열기는 **not-run**이다. 다른 포트나 브라우저 경로로 이를 우회하지 않았다. 기존 README 사진은 이전 로컬 빌드이고 새 레이아웃의 검증 사진이 아니다.

현재 실행 자료와 코드 SHA는 로컬 `output/ui-refinement`에 기록한다. 전체 quality/production 승인과 Blender 검증은 별도이며 이 UI 변경으로 성공 처리하지 않는다.

## 사용

`npm run dev` 후 `/?editor=elements`를 연다. 상단에서 저장·이력·파일 작업을 하고 중앙 뷰포트에서 선택한다. 오른쪽 Inspector에서 수정하며, 생성 및 상세 검사는 아래 Creation & inspection을 펼친다. Workspace 경로의 기존 프로젝트/자산 선택도 유지한다.

다음 확인은 정상 실행 환경에서 desktop/mobile을 한 번에 검사하고 발견된 문제를 한 배치로 수정하는 것이다. 현재 파일을 최신 화면으로 캡처하기 전까지 기존 사진의 버전 설명을 유지한다.
