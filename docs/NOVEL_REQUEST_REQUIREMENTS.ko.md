# 새 치수 요청의 실패와 요구사항 검사

전체 엔진 완성은 아직 아니다. 과거70%는 내부 검증표의 제한된 마일스톤이며 전체 엔진 품질/생성 정확도의 백분율로 사용하지 않는다. 이번 새로운 입력 검사에서는 모델의 중요 조건 실패를 확인했다.

## 실제 실행과 결론

추론 전에 `outputs/novel-parameters-20261008/contract.json`에 새로운 수치 조합을 고정했다. 기존과 다른37×17×2.5mm/7mm bore plate, module1.2/28teeth/5mmface/8mmbore gear,16/36mm·11mmwidth·6mm balls9개 bearing. 각 seed11/23,temperature0.7의 실제 선택토큰 sampling을 수행했다. 치수/개수/관통을 틀린 후보도 포함했다.6선택·수정 재시도0·외부 API0.

**2/6 성공,4/6 실패.** plate11,gear11,gear23,bearing23은 요청과 다른 유효한 기하 파라미터를 골랐다. plate23/bearing11만 실제 기하/normal/UV/GLB standard/저장 재열기 전체bytes 검사를 통과했다. 실험 전체는FAIL이며, 성공 파일은4GLB다. 이것은6개 한정 검사 결과이지 일반 성공률 추정이 아니다.

원인: 기하/스키마 유효성과 사용자의 요청에 맞는 선언은 별개다. 유효한 다른 toothCount나 boreDiameter는 일반 입력 validator를 통과한다. 현재 작은 로컬 Qwen3/0.6B의 선택이 새 수치에 안정적이라고 입증되지 않았다. 이전 알려진 입력의9/9를 그 증거로 재사용하지 않는다. 잘못된 답을 사후 수정해 성공으로 세거나 seed를 골라 다시 실행하지 않았다.

## 구현한 수정

- `src/engine/domain-requirements.ts`: 사용자에게서 독립적으로 제공된 `sceliph.domain-requirements/0.1`의 packId/mm/right-handed-y-up와 필수 숫자 입력을 기존 metadata validator로 검사한다. 선언의 해당 값이 다르거나 누락되면 generator 실행 전에 거부한다. 모델 답에서 요구사항을 추출해 자기일치를 승인하는 경로가 아니다. CAD/실측 정확도, 재질이나 자연어 의미 전부를 검사한다고 주장하지 않는다.
- `src/engine/editable-source.ts`: 선택적으로 요구사항이 제공되면 위 검사를 통과한 선언만 native IR로 생성한다. 요구사항이 비어 있는 기존 import 동작은 유지한다. 요구사항이 남은 채 native 저장 파일을 선택하면 명시적으로 거부하며, 이를 수정된 native IR의 치수 승인처럼 취급하지 않는다.
- `src/element-source-load.ts`: 파일 읽기 시작에 parser context를 고정할 수 있게 했다. 기존 호출의 기본 parser·최신 intent·restore·unmount 정책은 유지한다.
- `src/ElementEditor.tsx`: `Required dimensions for a new declaration`의 JSON 입력에 위 요구사항을 넣고 기존 파일 불러오기를 사용한다. 요구사항 편집은 pending import를 취소하고 현재 프로젝트를 보존한다. 저장된 native source를 재열기할 때 이 필드를 비우도록 안내한다. 실제 브라우저 검수는 not-run이다.
- `src/engine/centered-plate-pack.ts`: 직접 호출의 seed:null이42로 바뀌던 불일치를 수정했다. 등록 경로와 같은 안전한 nonnegative integer 조건을 적용했다. 유효 입력의 기하/기존IRschema는 변경하지 않는다.

새 요구사항 계약의 이전 버전은 없으며 미래 schema/잘못된 단위/미등록 pack/알 수 없는 입력을 거부한다. 기존IR/job/patch를 마이그레이션하거나 변경하지 않는다. 직접 입력에 대한 새 검사만 추가했다. 숫자 조건은 정확한 선언 비교이고 actualmesh의 허용오차를 임의로 줄이거나 늘리는 변경이 아니다.

## 수정 효과의 구분

현재 actual 모델 응답을 그대로 importer와 요구사항 검사에 넣었다. 올바른2건은 통과, 잘못된4건은 **generator 호출0회로 거부**. `requirements-guard.json`의 safetyPASS와 `artifacts/report.json`의 generationFAIL은 분리했다. 요구사항 없는 경로에서 임의 요청의 정확도를 보장하지 않는다.

요구사항 예시:

```json
{
  "schema": "sceliph.domain-requirements/0.1",
  "packId": "mechanical.spur-gear.visual",
  "units": "mm",
  "coordinates": "right-handed-y-up",
  "input": {
    "moduleMm": 1.2,
    "toothCount": 28,
    "pressureAngleDeg": 20,
    "faceWidthMm": 5,
    "boreDiameterMm": 8
  }
}
```

`gear-11.requirements.json`과`gear-11.declaration.json`은 실제 실패 차단 재현 파일이다. 요구사항을 모델 답에서 복사해 만들어서는 안 되며 사용자가 원하는 입력에서 작성해야 한다. 생성 후 편집/저장한 native IR에는 초기 선언을 다시 적용하지 않는다.

## 현재 검증과 파일

- npm test:158files/1016testsPASS.
- npm run check, npm run benchmark, npm run build:PASS.
- npm run quality:gate, npm run quality:production:FAIL. 기존 Blender 증거 미달/electronics52/90은 남으며 dominance는 앞 gate 실패로 not-run.
- strict GLB/normal/UV 검사와 per-tooth5%는 그대로다. 새 회귀는 현재 검사에서 관측되지 않았다.
- 실제브라우저는 기존 localhost/file security denial,Blender는 기존 Metal startup crash로 not-run. 독립 실무자 품질 검수 없음.

체크아웃 `/private/tmp/sceliph-publish-20261007`,branch `engine/lathe-connectivity-20261007`,HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a`. 기존 사용자 변경을 보존했고 commit/push하지 않았다. UNI_AI/Claude/유료/외부3D 모델/패키지설치 없음. 새 모델 실행은 기존 설치된 로컬0.6B 모델의6선택이다.

현재 코드 SHA·실제 입력/출력 SHA·명령/환경: `outputs/novel-parameters-20261008/manifest.json`.
Manifest SHA256 `6238642a7d563db63c2a516f29a46b36f05d1c8564b2b90e24bc03b72d909866`.

재현(NEW 출력폴더 사용):

```sh
python3 scripts/offline-qwen-ir.py /private/tmp/sceliph-offline-qwen3-20261007/model-f32.gguf outputs/novel-parameters-20261008/tasks.json /private/tmp/sceliph-new-numerical-model
./node_modules/.bin/vite-node scripts/domain-invocation-evidence.ts outputs/novel-parameters-20261008 /private/tmp/sceliph-new-numerical-model /private/tmp/sceliph-new-numerical-proof
./node_modules/.bin/vite-node scripts/check-novel-requirements.ts
```

최초 generation verifier는 현재 입력에서FAIL exit1을 포함한다. 마지막 safety검사는 저장된 현재 모델 응답/독립 요구사항을 사용하며 모델 재추론이 아니다. 실패 파일을 지우거나 과거 성공 파일로 대체하지 않았다.

## 다음 판단

잘못된 선택을 막는 것은 완성형 모델링 품질의 대체물이 아니다. 다음 한 작업은 실패 사유를 모델에 전달하는 제한된 수정 경로를 잠근 새로운 요청으로 검증하는 것이다. 잘못된 후보를 제거해 같은 답을 강제로 고르게 한 결과를 LLM 정확도 향상으로 세지 않는다.

전체 완료에는 추가적인 실제 형상/사용 목적의 품질과 UI/Blender/독립 검수 증거가 필요하다. 현재 broad Goal 도구는 이전blocked상태이며 본문 수정/resume API가 없다. 전체 목표를 완료 처리하거나 재개됐다고 보고하지 않는다.
