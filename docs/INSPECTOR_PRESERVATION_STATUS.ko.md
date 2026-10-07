# Sceliph 기어 편집 보존 검사 · 2026-10-06

## 이번 작업

이전 단계의 `gearEditPreflight`가 연결된 편집 경로에 회귀 검사를 추가했다. 이번에는 제품 엔진·UI 구현을 다시 수정하지 않았다. 새 테스트는 모듈0.5/1/2와 잇수36의 네 사례에 독립 비대상 기어를 배치하고 mm 이동, 실제 메시 버퍼, PBR, 계층, source 저장·재열기, GLB 반복 생성, 변경 없는 재저장, 연속 절대 이동, undo/redo를 검사한다. 원본 IR 문자열과 비대상 부품도 보존된다.

처음 검사에서 기존 메시가 non-indexed인데 index가 있다고 가정해 네 사례 모두 실패했다. 실패 로그를 보존했다. 수정 검사는 실제 index 유무까지 보존되는지 확인한다. position/normal/UV는 버퍼 바이트 정확 일치를 요구한다. 재생성마다 달라지는 Three.js material runtime UUID만 속성 비교에서 제외하며 재질의 나머지 JSON은 일치해야 한다. 납품 GLB는 전체 바이트 정확 일치를 요구한다. 허용 오차나 기존 UV 임계값은 변경하지 않았다.

## 실제 파일 증거

`outputs/inspector-preservation-20261006/files`에는 네 사례의 original/moved/reopened GLB 12개, 수정 source JSON4개와 SHA256 manifest가 있다. 디스크의 source JSON을 실제로 다시 읽어 parse·재생성했고 moved/reopened GLB는 모두 전체 바이트 일치했다. 독립 WebIO로12개를 다시 열어 원본이0이동, 수정/재열기가 [0.012,-0.003,0.005]m인지 확인했다. 원본 native IR은 mm, right-handed Y-up이다.

Khronos 검사12개 PASS(오류0·경고0), 독립 재열기12개 PASS. 이 결과는 치수·관찰 자료와의 모델 정확도나 Blender 호환성 검증을 뜻하지 않는다. 실측 기계 제조 정확도, 뒤쪽 구조 복원, 다른 도메인의 결정성은 주장하지 않는다.

## 상태와 제한

작업/실행 환경은 `/private/tmp/sceliph-refine-20261006`, Node24.13.1/macOS arm64. 기존 작업 경로는 Git HEAD/구성 일부가 없어 status/HEAD 미확인이며 임의 복구하지 않았다. 이전 체크아웃과 Documents 사본을 읽어 만든 보존 사본의 구성은 snapshot-origin.json에 기록했다. Raptor, Documents 원본, GitHub는 수정하지 않았다.

기존4179서버는 현재 응답하지 않는다. 이전 단계의 서버 listen EPERM과 브라우저 file URL 보안 거부를 우회하거나 같은 시도로 반복하지 않았다. 현재 수정 UI의 조작·desktop/mobile 시각·다운로드는 blocked/not-run. Blender 첫 import/재export도 not-run이다. CLI 저장·재열기를 사용자 UI 완료로 승격하지 않는다. 정상 작업 경로와 localhost 주소를 사용자에게 요청했다.

타입 검사·build·benchmark·quality gate는 제품 코드가 이전 검증본과 바이트 동일하므로 재실행하지 않았다. 이전 단계의 check/build/benchmark PASS와 quality:gate/quality:production FAIL 기록을 그대로 구분해 인용한다. 이번 변경은 새 회귀 테스트이며 전체 npm test를 실행했다. 최종 전체 검사145 files /957 tests PASS,113.90초. results.json에 기록한다. legacy ARM/x64 기어 바이트 불일치, 일반 Blender normal drift 및 전체 production 실패를 해결했다고 주장하지 않는다.

## 재현

```sh
cd /private/tmp/sceliph-refine-20261006
npx vitest run tests/gear-edit-preflight-preservation.test.ts
npm test
npm run gltf:validate -- outputs/inspector-preservation-20261006/files/*.glb
```

export-proof.ts는 실제 엔진/GLTFExporter로 파일을 만든 당시 실행 스크립트다. 출력 디렉터리가 이미 있으면 실패해 기존 증거를 덮어쓰지 않는다. 독립 재열기 결과는 independent-reopen.json, 처음 실패는 first-test.log, 수정된4개 검사는 verified-test.log, 전체 검사는 npm-test.log에 있다. 이번 검증은 편집 보존 범위이며 전체 플랫폼/사용자 UI 흐름 완료는 아니다. 다음 한 가지 작업은 정상 서버에서 새 입력 차단·복구·Apply/Cancel·저장·재열기를 실제로 조작하는 것이다.
