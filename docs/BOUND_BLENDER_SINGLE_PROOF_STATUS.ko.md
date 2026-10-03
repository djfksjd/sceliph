# 현재 입력에 결합된 단일 Blender 증거

2026-10-04, 기준 `819bf60d9bc1cbba01802be6ac7bab974cd84a6c`, compiler 0.40. 제품 기하·UV·재질·리그는 변경하지 않았다. 이번 수정은 납품 검증 경계이며 형상 품질 개선으로 보고하지 않는다. UNI_AI/Claude 호출 0회. 예산 30분, 새 로컬 증거 약54MiB/100MiB 이내.

## 실제 결함과 수정

competitive의 단일 Blender 보고서 검사에는 현재 엔진·IR·원본 SHA 대응 조건이 없었다. 2026-09-02 보고서의 source SHA `e3867a…`와 현재 architecture SHA `a7ea7d…`가 달라도 수락됐다. 메시·면·재질 수가 양쪽 모두 누락되어도 `undefined === undefined`로 일치했다. 두 실패 테스트를 실제 이전 보고서로 먼저 재현했다.

`auditBlenderRoundTripProof`는 기존 Blender5.2/0.1mm/기하·재질 수/독립 parser/표준 오류0·경고0 조건을 유지하며 다음을 추가한다.

- schema `morphloom.blender-roundtrip/0.3`, 현재 compiler·asset ID.
- 현재 저장 JSON IR fingerprint, 현재 cross-domain 원본 SHA와 최종 납품 SHA 대응.
- 실제 양의 파일 크기, 유한·비음수 bounds, 정수인 메시·면·재질 수. 누락값끼리의 일치를 거부한다.
- geometry/image/skinning parity와 최종 검증 바이트 SHA 대응. `pass=true`만으로 수락하지 않는다.
- 실패 이유를 competitive 보고서에 남긴다. source나 final 대응이 없으면 대체하지 않고 차단한다.

기존 0.1/0.2 native 보고서는 그대로 읽고 보존한다. 현재 납품 증거로 자동 승격하지 않는다. 마이그레이션은 실제 실행 파일을 검증하는 `scripts/bind-blender-roundtrip-proof.ts`이며 메타데이터만 바꾼 migration은 지원하지 않는다. native 실행 도구의 0.2 출력 계약도 변경하지 않았다.

## 실제 파일 검증

이번 턴에 architecture GLB를 Blender5.2.1 LTS `--threads 1`로 다시 import/export/reimport했다. 기존 repair가432 tangent 값을 보정한 최종 파일을 별도 Khronos+WebIO로 다시 읽었다. raw native SHA와 native 보고서 SHA·크기가 일치하며, 최종 SHA는 현재 cross-domain 실제 파일 증거와도 일치했다.

| 실제 파일 | SHA256 |
|---|---|
| 현재 원본 | `a7ea7dc3300d8d261b50e925ce586ffb4c2580981bc05b98b91900f0c329cca2` |
| 이번 raw Blender 재export | `cd6395a371fb192f684b22835b55dd07696ac25f54eeeff6fb4e81ba63822c77` |
| 최종 tangent repair 파일 | `c9338a90672d2261b549e74c4167dcd6d3f0b09b6e617cf9040fa02b8df8782e` |

첫 binder 시도는 IR fingerprint 차이로 실패했다. 실제 차이는246개의 optional `rotation: undefined` 키이며 저장 JSON 내용은 현재 IR의 JSON 저장 내용과 정확히 같다. 새 보고서는 `assemblyFingerprintRepresentation: source-json/0.1`을 요구한다. 기존 component patch fingerprint는 변경하지 않았다. 선언된 값이 다른 IR은 계속 거부한다. 최초 실패 로그와 전체 diff를 보존했다.

실제 CLI 실패4개: 오래된 compiler, 다른 source 파일, native 수치 누락, 원본과 output alias. 모두 비정상 종료·부분 출력0·원본 SHA 보존을 확인했다. 합계100MiB 파일 예산은 읽기 전에 검사하고, 출력은 기존 atomic benchmark writer로 보호한다.

## 현재 검증 상태

- 112파일/811테스트 PASS. 최종 `check`, `benchmark`, `build` PASS.
- 신규 binder와 변경된 competitive script의 strict TypeScript 검사 PASS. 최초 검사에서 기존 ambient 선언을 제외한 오류와 기존 metrics type의 두 optional 필드 누락을 확인해 로그를 보존했다. ambient를 포함하고 실제 사용하던 optional 필드만 선언했으며 실행 의미는 바꾸지 않았다.
- 실제 competitive: 이전 보고서 `benchmarkAccepted=false`, 새0.3 보고서 `true`, blockers=[] 확인.
- `quality:gate` 및 `quality:production` exit1. 내부 quality100%·release browser4/4는 유지되지만 cooling UV infos23 때문에 전체 competitive FAIL. production의 dominance는 not-run.
- UI/렌더는 변경이 없어 이번 단계에서 다시 실행하지 않았다. 직전 단계의 브라우저·중립 렌더를 새 실행으로 보고하지 않는다.
- 최종 repaired 파일의 **Blender 재import는 이번 단일 binder 검증에서 not-run**이다. source→raw의 실제 import/reimport와 final의 독립 WebIO 읽기를 구분한다. raw NORMAL byte 충실도·전체 production-ready·전문가 승인 주장은 하지 않는다.

실행 환경 Apple M5/macOS, Node24.13.1, Blender5.2.1 LTS. 실제 파일과 로그는 `/Users/danny/Documents/morphloom/outputs/single-blender-binding-20261004`, 공개 작은 증거는 [`benchmarks/modeling-slices-20261004/bound-blender-single-proof`](../benchmarks/modeling-slices-20261004/bound-blender-single-proof)이며 manifest는 변경 코드·입출력 SHA에 연결한다.

```sh
npm test
npm run check
npm run benchmark
npm run build
npx vite-node scripts/bind-blender-roundtrip-proof.ts current-native-aggregate.json current-source.glb new-proof.json actual-native.json raw.glb final.glb
```

마지막 세 파일을 생략하면 aggregate에 기록된 실제 artifact 경로를 사용한다. 출력은 원본·raw·final·입력 보고서와 다른 경로여야 한다. 실제 native/repair/negative 명령은 `commands.json`과 `cli-negative-results.json`에 기록한다. 원본 폴더의 사용자 변경·보고서는 바이트 대응이 확인되지 않으면 보존한다. 연속 Goal은 active이며 다음 형상 병목은 실제 메시의 방향/단면 검사로 선정한다.
