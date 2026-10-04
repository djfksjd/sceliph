# Native 기어 계산 정책 0.8 — 2026-10-04

기준 `ebda45e`에서 기존 native spur-gear에 명시적 계산 정책을 연결했다. 원본 IR의 계산을 자동 변경하지 않는다. 새 의존성·외부 API·Claude 호출은 없다. compiler0.41.0/renderer0.12, 계산 정책 `morphloom.gear-ieee-series/0.1`, Node24.13.1 / Chrome154 / macOS Apple M5 / Blender5.2.1 LTS에서 검사했다. 모든 브라우저나 제조 정밀도를 보장하지 않는다.

## 실제 사용자 동작과 호환성

Elements 편집기에서 기어 선택 → **Enable gear math policy (schema 0.8)** → **Gear math revision**에서 IEEE series0.1 선택 → **Apply part edit** → 별도 sourceJSON/GLB 저장. 새 세션의 Load project JSON으로 저장한 source를 불러와 다시 편집·export할 수 있다. 기존 undo/redo를 사용한다.

스키마만 0.8로 올리면 모든 부품과 기존 legacy Math 정책이 보존된다. mathRevision 필드를 선택한 기어만 새로운 계산을 사용한다. 스키마0.1..0.7은 새 필드를 거부하고, 모르는 revision·잠긴 부품의 편집도 거부한다. 기존 치수·UV·normal·토폴로지 합격 기준을 바꾸지 않았다. 정책 없는 기존 diagnostic tooth GLB는 이전 실제 파일과 전체 바이트가 같다. 기존 파일명을 유지하여 이전 저장 자료와 검사 도구의 계약을 보존했다.

## 실패 원인과 최소 수정

이전 단계에서 같은 입력의 Node/Chrome native sin/cos/tan/atan이 마지막 비트에서 달라 profile/feature와 GLB가 달라졌다. 새 정책이 있는 native 기어만 검증된 bounded IEEE 계산으로 profile·involute·bore·extract를 계산한다. 임의 좌표 반올림이나 참고 메시로 native IR을 대체하지 않았다.

이번 구현 중 TypeScript unknown narrowing과 생성된 polar wrapper의 재귀 오류를 발견해 수정했다. 초기 전체 테스트는 862개 통과·1개 default bearing timeout이었다. 큰 Uint8Array의 재귀 assertion이 병렬 전체 실행에서 5초를 넘었다. timeout을 늘리지 않고 기존 full GLB/BIN 비교를 Buffer.equals로 바꾸었다. 여전히 전체 바이트를 정확 비교한다. 삭제·skip·오차 허용은 없다. 최종 863개/126파일이 통과했다. 초기 실패 로그도 보존했다.

## 현재 수정본의 증거

- 네 native 기어: 모듈0.5/1/2mm, 24/36톱니, 압력각20/25/23.5도. 원본/새 정책 모두 기존 topology 검사 PASS.
- 실제 브라우저 저장 source와 Node 생성 GLB 네 사례의 **전체 바이트 직접 비교 PASS**. 새 세션 재열기, 추가 X+2mm 편집, undo/redo 후 전체 바이트 보존 PASS.
- 비대상 marker의 POSITION/NORMAL/UV/INDEX 실제 accessor bytes·재질·노드와 IR 정확 보존, 기어 bounding box 정확 보존. 이동에서는 두 메시 payload와 비대상 노드 그대로 보존.
- JSON Schema0.8 별도 검증: 실제 소스4개 허용, 잘못된 revision4개 거부.
- 최초 GLB10개 및 Blender 재export4개: 기존 Khronos/독립 재열기 검사 exit0. INFO는 원문 그대로 보존.
- 실제 브라우저 native normal kit4개 → 별도 Blender 명시적 source-normal import: FLOAT_VECTOR/CORNER 최초 오차0도. .blend 저장 후 재열기·재저장·재열기에서 local position/normal/UV/loop 정확 보존, sourceJSON SHA 그대로 보존.
- 그 .blend의 실제 재export: 각 기어 최대 normal 차이0.003608..0.003768도, marker0.003853도; 기존 고정0.01도 조건 PASS. 이 수치 검사는 **DCC 재export normal 계약만** 증명한다. Node↔browser native byte 계약을 오차 비교로 대체하지 않는다. DCC raw accessor byte 일치 및 임의 DCC 편집→IR 역변환은 주장하지 않는다. kit의 before-edit-reference/false editable provenance를 유지한다.
- npm run check PASS / npm test **863tests·126files PASS** / npm run benchmark PASS / npm run build PASS.
- npm run quality:gate / quality:production은 **exit1**. core quality6 rates1 및 release browser audit PASS지만 competitive의 기존 Blender cross-domain/cross-domain-edit benchmarkAccepted=false가 남는다. 후속 dominance not-run. 예전 cross-domain 영수증을 이번 native 정책의 현재 DCC 증거로 재사용하지 않았다.

기존 일반 Blender 첫 import normal drift와 전체 플랫폼 납품 실패는 이 단계로 해결되지 않았다. 기어 기본 UV 실패도 자동 PASS로 바꾸지 않았다. 이번 비교 fixture는 명시적인 uvScale100을 사용했고 기본값을 바꾸지 않았다. 연결 톱니 추출은 diagnostic sector이며 분리 가능한 조립 부품이 아니다. 참고 사진의 정확도나 전문가 평가를 수행했다는 주장은 없다.

## 증거와 재현

`benchmarks/modeling-slices-20261004/gear-math-policy`에 실제 입력/출력·실행·실패·browser screenshot을 보존한다. `file-manifest.json`은 코드/파일 SHA, `STORAGE.json`은 gzip 무손실 raw SHA와 저장량을 연결한다. 압축 파일은 복원 후 사용한다. raw는 `work/gear-math-policy-20261004`, 원본 checkout의 별도 outputs에 보존한다.

재현: `npm run check`, `npm test`, `npm run benchmark`, `npm run build`, 두 quality 명령. 생성/실제 브라우저 작업은 fixtures.ts와 browser.py의 명령을 참고하고 **새 출력 폴더**를 사용한다. Blender: `/Applications/Blender.app/Contents/MacOS/Blender --background --python <unpacked-kit>/tools/blender-source-normal-import.py -- <model.glb> <new.blend> <new-receipt.json>`; 재열기는 보존한 reopen-native.py, normal 비교는 scripts/compare-native-normal-payload.ts를 사용한다. 기존 결과를 덮어쓰지 않는다.

이 단계의 native opt-in 편집/재생성은 검증했다. 플랫폼 전체를 production-ready로 표시하지 않으며 연속 Goal을 완료 처리하지 않는다. 다음 우선순위는 **새 정책 native 기어의 기본 UV 실패를 실제 톱니별 값으로 재현하고 원인을 분리하는 것**이다. 증거와 목표 용도 없이 임계값이나 기본 UV를 바꾸지 않는다.

시간 예산: 사전20분, 증거 기록 시 wall20.197분으로 약12초 초과했다(중간 사용자 대화 포함). 예산 내 완료로 주장하지 않는다. 이번 체크포인트 정리 후 다음 구현은 중단한다.
