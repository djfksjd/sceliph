# Domain Pack 숫자 입력 검수 — 2026-10-04

기준 HEAD `bcc493ceb604e5769e213d97f7a426d85aa4cd94`, compiler `0.41.0`, renderer `0.12`. 현재 변경은 `src/ElementEditor.tsx` 한 파일이며 아래 증거의 file-manifest.json에 코드 SHA를 연결했다. 원본 Documents/morphloom의 손상된 iCloud git index는 건드리지 않고 publish checkout main에서 검증했다. UNI_AI/Claude 호출0, 의존성/IR 버전/검사 임계값 변경0.

## 결함과 구현

기어의 boreDiameterMm6을 실제 Backspace로 비우면 기존 Number("")가0을 생성기에 전달해 실제 보어를 막았다. 원본/변경 GLB POSITION·index 삼각형의 중심 Z축 교차 검사로 재현했다. 기하 생성기 자체의0 보어는 의도된 정상 지원이다.

숫자 필드는 valueAsNumber와 기존 Domain Pack validateDomainPackInput 및 선언 bounds를 사용한다. 빈 값·비유한 값·범위 밖 입력은 오류와 입력 상태를 보존하고 Generate를 막는다. 생성된 IR은 유지된다. 값 수정 또는 Restore valid generation inputs로 마지막 유효 입력을 복구한다. 성공한 Pack 전환·JSON 불러오기는 오류를 초기화한다. 원래 생성/교차 파라미터 제약은 그대로 남는다. 저장/내보내기는 현재 생성된 기존 IR을 사용하며, 아직 적용하지 않은 생성기 입력을 적용한 것처럼 저장하지 않는다.

## 현재 실행 증거

`../benchmarks/modeling-slices-20261004/pack-numeric-input/`에 원본 실패와 재개 시도까지 보존했다. 모든 log와 큰 JSON은 gzip으로 무손실 저장한다. 전체 저장11,703,880bytes, 사전15MiB 예산 안이다. 원본 파일은 work/pack-numeric-input-20261004 및 Documents/morphloom/outputs/pack-numeric-input-20261004에 별도 보존한다.

- 실제 빈 입력: Generate 차단, 이전 GLB 전체 바이트 일치. Restore 후 재생성도 원본 GLB 전체 바이트 일치.
- 명시0mm: 허용, 기존0mm 기어 GLB와 전체 바이트 일치. 명시4mm: 실제 보어 열린 상태와 source JSON bore4 확인.
- module0 범위 오류 및 두 필드 오류: 하나만 고치면 나머지 오류가 Generate 차단을 유지한다. JSON import에서 오류 제거·생성기 연결 unknown 유지 확인.
- 베어링 ballDiameterMm 빈 값 차단·복구·5mm 생성 후 ball_0000 radius2.5mm 확인. 다음 Pack 전환 시 오류 제거 및 기어 기본보어6mm 복원. followup-commands.json에 실제 조작과 파일 기록.
- 일반 4mm GLB 저장/재열기는 전체 바이트 비교 **FAIL**. 원인은 JSON 키 순서이며 파싱된 전체 JSON 값과 BIN만 일치한다. 이 수치/구조 비교를 엄격한 바이트 PASS로 승격하지 않았다. after.log의 실패를 보존하며 일반 export 경로를 변경하지 않았다.
- 별도 선택형 native normal kit: 보어4mm source에 기존 UV editing0.4를 사용자가 켜고 projection tile10mm를 적용한 후 ZIP 생성. 새 브라우저 세션에서 ZIP의 실제 source.json을 불러와 다시 생성한 ZIP 전체 바이트 일치. SHA256 `394744bba5f53ac722ec3def0e0931d442474af07ec9ed32e330cecb931555bb`.
- 기본 기어 UV 실패는 editable export 차단 상태 그대로다. 위 UV tile 변경은 명시적 사용자 작업이며 기본값/임계값을 변경한 것이 아니다.
- GLB6개 Khronos 검사 오류0·경고0, INFO는 그대로 기록. WebIO 독립 파서로6개 재열기 성공.
- 현재 native kit GLB의 Blender5.2.1LTS 첫 import: source-normal FLOAT_VECTOR/CORNER 정책, mesh1, vertices25152, 입력 normal 오차0°, 비normal 데이터·계층 변환 exact. GLB SHA256 `4df8ac852b33ac0e47ac49aed7c228d18db1203bf27a7052065853d9f275b1df`. **재export not-run**, 일반 Blender 첫 import normal drift 해결 주장 없음.

## 명령과 상태

macOS Apple M5 / Node24.13.1 / Blender5.2.1LTS, 로컬 Vite4179.

| 명령 | 현재 결과 |
|---|---|
| npm run check | PASS |
| npm test | PASS 842tests /122files |
| npm run benchmark | PASS |
| npm run build | PASS |
| npm run quality:gate | FAIL exit1 |
| npm run quality:production | FAIL exit1; 앞선 gate 실패로 후속 dominance not-run |
| npm run gltf:validate -- 현재6파일 | PASS 오류·경고0 |
| node work/pack-numeric-input-20261004/independent-reopen.mjs | PASS |
| python3 work/pack-numeric-input-20261004/current-bore-geometry.py | PASS 실제 정점·면 검사 |
| python3 work/pack-numeric-input-20261004/native-reopen.py | PASS 새 브라우저·실제 다운로드·재열기 ZIP exact |

기존 cross-domain Blender proof의 의미 보존 pass와 benchmarkAccepted false는 구분한다. strict 최종 납품 기준 미충족이므로 전체 gate 실패를 유지한다. 이전 냉각 조립 UV INFO 문제 등 범위 밖 납품 실패를 이번 입력 UI 변경이 해결했다고 하지 않는다. 최신 전역 게이트 JSON은 사용자 변경을 섞어 커밋하지 않으며 실행 로그를 이 증거에 보존한다.

첫 after.py는 일반 GLB byte equality에서 실패했고, 후속 followup.py는 새 창 React mount 이전 업로드에서 실패했다. 실패 로그 삭제 없이 원인을 분리했다. native-reopen.py는 화면 heading 준비를 기다린 독립 세션에서 성공했다. 제품 계약 완화/테스트 skip 없음.

## 사용과 남은 한 가지 작업

`/?editor=elements`에서 Domain Pack을 선택하고 치수를 수정한 뒤 Generate한다. 빈 입력 오류 시 수치를 고치거나 Restore valid generation inputs를 누른다. source JSON은 Load JSON으로 다시 편집한다. 일반 GLB의 JSON 재열기 전체 바이트 일치는 미충족이다. 다음 우선 작업은 이 키 순서 차이가 엄격한 원본 대응·IR 평행이동 경로에 미치는 영향을 최소 재현으로 조사하는 것이다. 전역 정렬을 먼저 넣거나 검사를 약화하지 않는다.

이번 빈 입력→0 오적용 결함은 브라우저와 실제 파일로 수정 확인했다. 전체 플랫폼은 production-ready가 아니며 연속 Goal은 완료 처리하지 않는다.
