# LLM 선언형 모델링: 지역 배치와 표면 접촉

기준 HEAD main / 3d26188af5951e7be77ffd0d5c3c9bdf15348fea. 이전 surface-flow, roadmap, benchmark latest, node_modules 변경을 보존했다. 사용자 재개 지시에 따라 구현했으며 Goal 도구에는 resume API가 없어 paused 상태 변경을 했다고 주장하지 않는다. UNI_AI/Claude/외부3D 생성 모델 호출0, 의존성 추가0, commit/push0.

## 실제 구현

- applyEllipsoidSurfaceLayout: 타원체의 owner-local 위도/방위각 범위, 행 수와 flow를 선언하면 기존 slot position/rotation override를 생성한다. 지역 angular grid와 교대 quarter-cell stagger이며 mm 등간격/깃털 겹침 보증은 아니다. 삭제된 slot을 포함한 원래 인덱스를 유지해 삭제/분리로 다른 root가 이동하지 않는다. 선택 그룹 위치·회전을 명시적으로 교체하고 개별 파라미터·삭제·분리·비대상·원본을 보존한다.
- alignEllipsoidAnchors: 두 analytic ellipsoid의 local full-scale fraction 표면점과 gradient normal을 계산해 서로 반대 normal인 anchor만 정렬한다. mm world translation을 기존 editPart로 적용하며 잠금·잘못된 표면점·임의 geometry·같은 부품·non-opposed normal은 거부한다. 지정 점의 접촉을 검증하며 전체 관통·물리 안정성·해부학·살아 있는 조립 제약을 보증하지 않는다.
- applyModelingRecipe: sourceSHA256에 연결된 선언형 JSON을 원자적으로 실행한다. surface-flow/surface-rows/anchor-align만 지원한다. 65,536 characters/최대16steps, unknown key/op/version·wrong source·invalid grid/lock은 거부한다. 단계 실패 시 호출자 IR은 불변이다. 입력은 await 전에 clone하고 UI는 ticket/mounted/currentProject로 늦은 결과를 폐기한다.
- UI: 기존 그룹 inspector의 Surface rows, 기존 History Undo/Redo와 sourceJSON/GLB 저장 경로. Declarative modeling recipe에서 template/JSON 입력/적용/입출력 SHA 영수증 저장. 별도 LLM API 호출·자연어 자동 분석은 추가하지 않았다. 호스트 LLM이 작성한 실제6-step recipe로 네 그룹 배치와 두 발 접촉을 실행했다.

## 버전·하위 호환

기존 native IR0.1–0.8/기본 새 생성/GLB binding 계약은 변경하지 않는다. 명령 계약0.1은 기존 두 surface 연산 그대로 수용하고0.2에 anchor-align을 추가했다. 0.1에서 새 연산을 쓰거나 미지원 version은 실패한다. 이전 IR migration은 필요 없으며 결과는 기존 override/part.position에 저장된다. source SHA는 prepareElementExportSource→serializeProject→UTF8 SHA256이며 selection은 제외한다. Recipe는 무상태 재실행 시 원본 SHA를 요구하므로 수정본에 원본 recipe를 다시 실행하면 sourceMismatch로 차단한다. 같은 출발점/recipe의 반복 생성은 별도 검증한다. 새 입력이 아닌 이전 template를 자동 갱신해 통과시키지 않는다.

## 가설·시도·판단

1. 이전 방향 개선 후보의 랜덤 root가 날개/꼬리 배열을 방해한다. 위치만 각도 행으로 제한하고 같은 메시 수/해상도에서 비교했다. 첫 영역이 넓어 꼬리 돌출이 남았다. 두 번째는 wing azimuth를 각각[-105,-75]/[75,105], latitude[-12,12]로 좁히고 tail[160,200]/[-8,8], elevation75°로 분리했다. 몸통은5rows latitude[-60,60]/azimuth[-170,170]/10°. 동일1024² clay/iso/고정 공간으로 렌더했다. 두 번째 후보에서 큰 돌출이 줄었다. 해부학 합격은 아니다. 실패/첫 후보 파일을 유지했다.
2. GLB 비대상 node 검사에서 root의 sourceSpec 변경을 실패로 잡았다. 수정 IR을 담는 해당 필드만 기대 변경으로 명시하고, sourceSpec이 실제 수정 IR과 정확히 같음을 따로 검사했다. 다른 node 속성과 geometry BIN/mesh/material/accessor는 엄격 비교를 유지했다. 수정 sourceSpec을 원본과 같게 위장하지 않는다.
3. 행 배치→recipe→접촉 연산 순서로 실제 검증 단위를 확장했다. 기능 변경 때만 전체 테스트를 다시 실행했다. 같은 실패의 무가설 반복이나 임계값 변경 없음.
4. 브라우저 row 적용/Undo/source 저장/새 세션 재열기/재적용/invalid3rows 거부에서 source 일치를 확인했다. SHA가 다른 recipe의 거부와1초 digest 지연 중 새 JSON 입력이 늦은 결과로 덮이지 않는 것을 실제 브라우저에서 확인했다.
5. 다중 다운로드 자동화가 sourceJSON만 포착하거나 지정 폴더에서 GLB를 찾지 못하는 사례와 로그를 보존했다. 4-step source의 새 세션 재열기 GLB는 전용 폴더에서 실제 다운로드·반복 바이트 일치·독립 재열기를 확인했다. 6-step 결과는 actual download anchor의 Blob URL을 관측해 GLB bytes를 별도로 저장했다. Blob 관측은 검사 후 발생하는 다운로드를 읽을 뿐 생성/검사/IR을 변경하지 않는다. OS 다중 파일 포착 성공과 Blob 관측을 구분한다.

## 지원 한계와 다음 작업

원자료 없이 authored 새 예제다. 사진 정확도·조류 해부학·groom/rig·제조·전체 충돌·물리 시뮬레이션을 검증하지 않았다. 위치가 재열리지만 UI row controls 자체의 settings history는 저장하지 않으며 JSON recipe를 별도로 보존한다. 다른 ellipsoid 크기/회전은 검증했지만 다른 생물의 실제 reference 품질은 검증하지 않았다. 99meshes/74,080triangles를 유지한다. Node/Chrome rotation last-bit 차이로 output source SHA는 다르며 cross-runtime exact PASS로 승격하지 않는다. 같은 runtime의 saved IR 재생성은 strict bytes로 확인한다. Blender first import와 reexport normal drift는 별개이며 본 단계의 Blender reexport는 not-run.

다음 한 가지는 몸통·날개·다리의 primary form 연결을 reference가 있는 대표 사례에서 개선하는 것이다. 깃털 수 증가와 미세표면으로 primary form 결함을 덮지 않는다. 전체 production failure/independent human review not-run은 별도 상태다. 작업 시작00:08 KST, 사전 예산30분, 시각 후보2회 제한. 현재 결과·SHA·재현 명령은 outputs/surface-layout-20261005의 results/manifest 및 scripts/log에 연결한다.

## 현재 검증 단위의 결과

현재 수정본: npm test130files/877tests, check/benchmark/build exit0. quality:gate/production exit1이며 기존 cross-domain acceptance 실패가 남는다. 새 연산은 기존 compiler/gate 조건을 변경하지 않았다. dominance는 앞 gate 실패로 not-run. Khronos errors0/warnings0·WebIO 독립 read PASS. Blender5.2.1에서 실제 browser6-stepGLB99mesh first import 성공. Blender reexport는 not-run. Node의 수정 IR 재열기와 browser 저장 IR 다시 load에서 각각 GLB strict bytes 일치. 원본 대비 전체BIN/mesh/material/accessor와 비대상 node 비교PASS는 Node 산출물에서 확인했다.

UI 사용: ?editor=elements → Declarative modeling recipe → Prepare recipe template로 현재 sourceSHA 확보 → 대응 schema의JSON 입력 → Apply modeling recipe → Save project JSON 및 Export project. 다른 세션에서 Load JSON. Recipe와 receipt는 IR과 별도로 저장한다. schemas에0.1/0.2 계약이 있으며 미지원 version을 자동 변환하지 않는다. 이번 검증 단위의 결과를 전체 제품 완성으로 취급하지 않는다.

완료 기록2026-10-05 00:35 KST. 이전 surface-flow 작업 시간은 이번 예산에 합산하지 않았다. 시간은 첫 기록된 테스트00:08에서의 구간이며 숨은 작업 시간을 추정해 측정값으로 추가하지 않는다.
