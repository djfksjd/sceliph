# 선택형 Blender 원본 법선 도구 — 로컬 다운로드 흐름

기준 HEAD `2f17ead6e83ab96ae2a0648aa338673730760f3e`, compiler0.41. 이번 변경은 기하 계산이나 기존 importer를 재구현하지 않고 검증된 FLOAT_VECTOR/CORNER 도구를 검수 뷰어에 연결한다. 기본 Blender import의 구 법선0.029680464° 실패와 선택형 도구의 통과를 구분한다. 예산30분/100MiB/API0; 원본과 사용자 변경은 보존한다.

## 사용자 동작과 지원 범위

1. 검수 뷰어에서 정적 AssemblyIR을 LOAD IR로 연다.
2. `BLENDER 5.2 · SOURCE NORMAL KIT`를 누른다. 기존 실제 GLB export/reopen 검증 후 단일 AssemblyIR 대응과 native 지원 범위를 검사한다.
3. ZIP을 풀면 변경 없는 실제 `model.glb`, 별도 `source.json`, 기존 두 Python 도구, Apache LICENSE, 파일별 SHA manifest와 실행 명령을 받는다. ZIP 자체는 코드를 실행하지 않는다.
4. ZIP 디렉터리에서 `blender --background --threads 1 --python-exit-code 1 --python tools/blender-source-normal-import.py -- model.glb output.blend receipt.json`을 실행한다. 실제 검증 버전은 Blender5.2.1LTS build9e2066aef7ef; 도구는 5.2 범위만 허용하고 기존 출력 파일을 덮어쓰지 않는다.
5. `.blend`를 Blender에서 다시 열어 메시 객체를 수정할 수 있다. `source.json`은 Sceliph에서 별도로 다시 열어 편집한다. Blender 수정은 source.json으로 역변환되지 않는다.

현재 UI 연결은 **texture 없는 정적 AssemblyIR**에 한정한다. character/product-spec/native elements 전용 UI의 kit 연결은 미구현이며 완료로 표시하지 않는다. texture/image, skin/animation/morph, URI, required extension, 잘못된 Float32 accessor, 중복 mesh 이름, 지원 예산 초과를 거부한다. IR↔GLB reference가 다르면 거부한다. 최대 GLB/ZIP100MiB, mesh128, node10000, accessor20만 vertex, mesh별20만 corners, 총200만 vertex/corners를 유지한다. receiver는 원본 sourceSpec을 수정 전 참고로 다루며 현재 editableIR을 복원했다고 주장하지 않는다. manifest `nativeImportVerified=false`는 사용자 native 실행 전 상태다.

AssemblyIR/patch/job 스키마와 compiler 버전은 변경하지 않았다. 새 ZIP manifest는 `sceliph.blender-normal-kit/0.1`; source fingerprint 표현은 명시적 JSON0.1이다. 직접 sourceJSON 비교와 기존 validateAssemblyIR/fingerprint/GLB validation을 사용한다. 전체 ZIP은 고정 mtime으로 동일 입력 반복 생성 시 동일 바이트다. 기하·UV·normal·index·PBR의 새 자동 수정은 없다.

## 실제 증거

- 작은/기본/큰/축 솔리드 4개 actual browser ZIP: 독립 unzip, 모든 SHA, sourceJSON, 원본 GLB 전체 bytes 일치 PASS.
- ZIP에 실제 포함된 Python 도구 실행4 PASS. `.blend` 저장·재열기→bushing world X+1mm→다시 저장·재열기 PASS. 해당 native 로컬 기하·법선·UV·loop index 및 별도 sourceJSON 바이트는 그대로다. Native 수정이 IR에 반영됐다는 의미가 아니다.
- 각 재export에서 bushing과 독립 sphere8검사 모두 기존0.01° PASS, 최대0.003853402°. 4 actual edited GLB Khronos+독립 읽기 PASS. 전체 DCC 파일 bytes 보존으로 보고하지 않는다.
- ZIP의 sourceJSON을 새 브라우저 세션에서 실제 재열기→bushing X2mm→sourceJSON 및 새 kit 다운로드 PASS. 비대상 IR, 대상 기하/재질 보존 확인.
- 한 SHA 검사를 실제 브라우저에서 지연시킨 상태에서 파일 교체 및 읽기 실패: 이전 ZIP 다운로드0건, 새 선택/오류 표시 유지 PASS. 부품 변경/해제는 기존 commit sequence와 export cancel 경로를 재사용한다. 실제 React root에 정상 pack/IR로 ResultViewport를 mount하고 digest를 지연시킨 뒤 root.unmount했다. 이후 완료는 취소 오류로 끝났고 다운로드0건 PASS.
- 기존 cooling texture 입력은 실패 이유를 표시하며 부분 ZIP 다운로드0건. 비지원 character 버튼은 disabled 이유를 제공한다.
- 처음 모듈 부재 실패, multi-primitive mesh 코너 합계 미검사 실패 테스트를 보존한다. native의 기존20만 mesh corner 계약을 추가로 검사해 불일치를 해결했다. 임계값을 느슨하게 하지 않았다.
- 최종 현재 npm test는120파일835테스트 PASS. check/benchmark/build PASS이며 공개 check-results와 로그를 따른다. quality:gate/quality:production은 내부 quality rates1, browser4/4를 유지하고 기존 cooling infos23로 competitive에서 exit1. dominance not-run. compiler/기하가 같아 직전0.41 native/static 영수증은 계속 현재 입력과 대응하며 과거 실행을 이번 신규 실행으로 재표기하지 않는다.

## 원인·시도와 남은 항목

가설: CLI에만 있는 도구를 실제 GLB와 함께 내보내면 원본 법선을 보존하는 선택형 사용자 경로를 만들 수 있다. 독립 파일/새 세션/native 재열기로 확인했다. 중간 화면에서는 설명이 버튼 옆에 배치돼 버튼 행이 커졌다. full-row CSS로 수정 후 실제 화면과 현재 검사로 확인했다. 첫 browser/native 실행은 생성 전 디렉터리를 workdir로 지정해 실행 시작이 거부됐다; 순서를 분리해 실제 다운로드 후 native를 실행했다. 제품 검증 실패를 숨기는 수정은 없다.

원본 기본 importer drift는 미해결이다. 전체 production-ready·독립 전문가 승인·제조 정확도·Unity/Unreal 검증 완료를 주장하지 않는다. 다음 한 단계는 기존 native elements 편집 화면에서도 해당 source 계약을 유지하며 같은 도구를 받을 수 있도록 연결하는 것이다. 스키마/출처가 다르므로 AssemblyIR reference를 임의로 붙이지 않는다.

로컬 원본 증거: `/Users/danny/Documents/morphloom/outputs/blender-normal-kit-20261004`. 공개 작은 파일/해시/스크립트는 `benchmarks/modeling-slices-20261004/blender-normal-kit`. 검증한 checkout은 publisher이며 원본 checkout 충돌 파일은 별도 mirror 보고서로 남긴다. Goal은 active다.

최종 추가 검수에서 읽기 실패 뒤 이전 source cache로 새 kit를 요청할 수 있음을 재현했다(버튼 disabled=false). 파일 선택 시작 시 source-current 상태를 무효화하고 실패/미완료 동안 저장 및 오래된 RETRY를 차단했다. 브라우저에서 disabled=true, RETRY 다운로드0건, 유효한 재로드 후 native-tested ZIP 전체 bytes 일치를 확인했다. 초기30분 뒤 이 결함의 별도10분 correction 계약을 기록했으며 초기 예산 안에 모두 끝났다고 보고하지 않는다.
