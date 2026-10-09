# 선언 파일을 편집 가능한 프로젝트로 불러오기

이번 단계는 전체 엔진 완성을 선언하는 작업이 아니다. 기존70%는 내부 검증표의 마일스톤이며 전체 모델링 품질의 백분율로 사용하지 않는다. 앞으로는 지원 작업·실제 결함·현재 검증·남은 조건으로 보고한다.

## 해결한 병목과 구현

이전에는 `sceliph.domain-invocation/0.1` 선언을 CLI에서만 실행했고, Element Editor 파일 선택은 native IR만 받았다. 이제 같은 파일 선택에서 등록된 Domain Pack 선언을 검증·생성한 뒤 편집 가능한 native source로 불러온다.

- `src/engine/editable-source.ts`: 원본 native source는 기존 parseProject 경로를 유지한다. 정확한0.1 선언만 기존 executeDomainInvocation/등록 generator/input/capability/editPart 검증을 거쳐 canonical native IR로 변환한다. 임의 코드/외부 모델 실행이나 단위 추측 없음. 미래 schema/미등록 pack/비지원 capability/잘못된 치수·재질은 거부한다.
- `src/element-source-load.ts`: parser를 선택적으로 주입할 수 있게 했다. 기존 생성자와 기본 native parser의 동작은 그대로다. 파일 읽기 시작부터 이전 편집·저장·export를 차단하고, 최신 읽기만 적용한다. 실패·늦은 완료·복원·unmount 정책은 변경하지 않는다.
- `src/ElementEditor.tsx`: 기존 source importer에 위 parser를 연결하고 파일 유형과 크기 안내를 표시한다. 새 hook/비동기 작업/전체 UI 재작성 없음. 기존 history, Part Inspector, source 저장과 strict export 검사 경로를 사용한다.
- `tests/editable-source.test.ts`: native 변환→사용자 이동→새 세션 재열기, 잘못된 선언의 원자적 차단, 실패한 최신 선택을 오래된 성공이 덮지 못함, unmount/restore, 등록 provider 실패 격리와 이후 정상 native import를 검사한다.
- `scripts/editable-declaration-evidence.ts`: 실제 디스크의 선언 파일을 UI와 동일한 import session으로 읽고 실제 sourceJSON·GLB를 생성한다.

기존 IR/job/component patch 버전은 변경하지 않았다. 기존 native 파일에 새로운 필드를 강제하거나 마이그레이션하지 않는다. 이번 파일 판독은 기존0.1 Domain invocation만 지원하며 미래 버전을 자동 수리하지 않는다.

## 실제 파일 검증

판형 부품(45×15×3mm,6mm bore),30톱니 module0.6 기어,7개 볼의12/30mm 베어링을 사용했다. 선언 import→선택 부품[2,-3,1]mm 이동→native 저장→새 import session으로 디스크 재열기→GLB→X 방향 추가1mm 이동을 확인했다.

3사례 모두 PASS. 실제 GLB12개(각 original/edited/reopened/continued). 편집본과 native 재열기본은 전체 바이트 동일하다. 대상의 geometry/normal/UV/index, 모든 비대상 부품의 버퍼·transform·hierarchy, 모든 재질은 보존됐다. 선언을 저장 파일에 다시 적용해 사용자의 이동을 초기화하거나 중복 이동하지 않는다. topology·100k triangle budget·Khronos validation·독립 WebIO 재열기를 수행했다.

이것은 실제 파일과 공유 import handler 증거다. 화면 클릭·브라우저 다운로드·Blender 편집 성공의 증거로 대체하지 않는다. 새로운 LLM 추론이나 생성 품질 향상률을 주장하지 않는다.

## 현재 코드 검사

`outputs/editable-declaration-20261008/execution.json`과 각 log:

- npm test:157files/1011tests PASS.
- npm run check, npm run benchmark, npm run build:PASS.
- npm run quality:gate, npm run quality:production:FAIL. 기존 Blender cross-domain 증거 미달 및 electronics52/90은 남는다. production의 dominance 단계는 앞 gate 실패로 not-run.
- git diff --check:PASS.

기존 UV5% 및 normal/accessor/strict GLB bytes 기준을 변경하지 않았다. 현재 검사에서 새 회귀는 관측되지 않았다. UI/Blender는 기존 환경 차단으로 not-run이며, 과거 성공 영수증을 현재 결과로 사용하지 않았다. UNI_AI/Claude/API/추가 패키지 설치·push 없음.

## 사용 방법

Element Editor의 `Load source / Domain declaration JSON`에서0.1 선언 JSON을 선택한다. 예시는 `outputs/editable-declaration-20261008/files/plate.declaration.json` 등이다. 등록 generator가 만든 프로젝트가 나타나면 부품을 선택해 기존 Inspector에서 편집하고 `Save project JSON` 또는 기존GLB+sourceJSON 내보내기를 사용한다.

이후에는 **저장한 native sourceJSON**을 불러온다. 원래 선언 파일을 다시 불러오면 생성기를 다시 실행하여 새 프로젝트를 만든다. 새로운 프로젝트를 불러오기 전에 기존 편집을 저장해야 한다. native 파일은2MB, 선언은64KiB까지다.

실패 시 기존 프로젝트를 보존하고 적용·내보내기를 막는다. 올바른 파일을 선택하거나 `Discard import and keep current project`로 기존 프로젝트를 복원한다.

## 상태·증거

체크아웃 `/private/tmp/sceliph-publish-20261007`, branch `engine/lathe-connectivity-20261007`, HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 사용자/앞 단계의 변경은 보존했다. GitHub main이 이 로컬 수정본이라고 주장하지 않는다.

실제 파일·입출력 SHA·현재 source SHA·환경·명령 log: `outputs/editable-declaration-20261008/manifest.json`.
Manifest SHA256: `1aa5a8ec4d5c99e09bcf899e44cbd2228edb8dcc60f39ac45e12fee3db2d0b5e`.

재현(새 출력 폴더 사용):

```sh
./node_modules/.bin/vite-node scripts/editable-declaration-evidence.ts /private/tmp/sceliph-new-declaration-proof
npm test
npm run check
npm run benchmark
npm run build
```

현재 전체 엔진 완성도에 새 퍼센트를 부여하지 않는다. 다음 한 작업은 알려진 수치 조합과 다른 입력을 사전에 고정해 LLM의 올바른 선언·거부·실패를 실제 파일로 검사하는 것이다. 임의 사진의 후면·새의 해부학·제조용 CAD 정확도는 이번 결과로 검증되지 않았다.

전체 목표의 완료에는 실제 UI가 동작하는 환경, 정상 실행되는 Blender의 첫 import/재export 검증, 원자료에 대한 독립 목적별 품질 검수가 필요하다. 현재 환경의 localhost/file security denial과 Blender Metal startup crash가 해소돼야 해당 단계를 실제 실행할 수 있다. 이를 자동 검사로 대신하거나 기준을 느슨하게 만들어 완료 처리하지 않는다.

플랫폼 Goal 도구는 기존 broad objective의 blocked 상태이고 resume/본문 수정 API가 없다. 실제 구현은 현재 사용자 지시에 따라 진행했으나 Goal 도구 재개나 전체 목표 달성을 보고하지 않는다.
