# Sceliph 구면 메시 오차 기반 분할 · 2026-10-06

## 실제 구현과 품질 계약

기존 네이티브 sphere의 반지름·분할 수 IR을 재사용했다. `measureSphereSurfaceError`는 생성된 모든 삼각형에서 원점과 가장 가까운 점 및 정점 반지름을 측정한다. 삼각형 위 반지름의 최소는 최근접점, 최대는 정점에서 발생하므로 정점만 이상적 구면 위에 있다는 이유로 면 정확도를 승인하지 않는다. 메시 표면과 선언된 이상적 구면 사이의 최대 방사 편차이며, 원자료/실측값과 모델 사이의 정확도는 아니다.

`fitSphereSurfaceBudget`는 현 메시를 검사하고 기존 분할을 줄이지 않는 유한 후보를 생성·검사한다. 128×128 및32512삼각형, 최대63개 후보로 제한한다. 전체 면 오차가 목표 이하면 기존 geometry에 명시적 widthSegments/heightSegments만 추가한다. 이미 만족하면 같은 기하 선언을 반환한다. 달성 불가능하거나 입력이 잘못되면 throw하고 원본을 변경하지 않는다. 현재 일치하는 엔진에서 반복 결과는 같으며 플랫폼 간 초월함수 차이를 해결했다고 주장하지 않는다.

품질 계약은 테스트·생성 전에0.005mm로 고정했다. 세 크기의 실제 기존 베어링 볼, Detail mesh, primitive-local mm 기준이다. 반지름·축 극값·부품 변환·재질·조립 관계 보존, 비대상 메시 버퍼 보존, 목표 편차,source 재열기, 반복 결정성, 오류 차단을 검사했다. 폴리곤 수 증가 자체가 PASS 조건은 아니다. 삼각형 예산 내에서 실제 면 편차를 만족해야 한다.

기본 생성값·LOD·IR schema·legacy 기하·UV5% 임계값·GLB 바이트 계약은 변경하지 않았다. 목표 볼은 정점/normal/UV 샘플링이 의도적으로 바뀌며 기존 normalized UV 좌표 체계와 반지름은 유지한다. 비대상은 원본과 같아야 한다. 저해상도 preview LOD는 더 성길 수 있다.

## 실제 측정값

| 사례 | 반지름 mm | 이전 최대 면 편차 mm | 수정 최대 면 편차 mm | 삼각형 |
|---|---:|---:|---:|---:|
| small | 1.5 | 0.00500690 | 0.00360716 | 2976 → 3968 |
| default | 3 | 0.01001381 | 0.00462052 | 2976 → 6240 |
| large | 6 | 0.02002761 | 0.00471791 | 2976 → 12320 |

현재 GLB9개를 독립 WebIO로 다시 읽어 실제 accessor에서 편차와 normal 단위 길이를 측정했고 수정/재열기 세 사례가0.005mm 이하를 만족했다. source JSON 저장·재열기 후 수정 GLB는 전체 바이트 일치했다. 새 출력의 SHA256은 files/manifest.json에 있다. 실제 전체 기본 베어링에서 대상 볼 topology PASS, 비대상10부품의 position/normal/UV/index/재질/변환/계층 보존을 별도 검사했다.

## 사용자 경로

Elements 편집기의 네이티브 sphere 부품 선택 → Sphere surface tolerance(mm) 입력 → Fit sphere surface tolerance → 결과 확인 → Apply part edit → Save project JSON. 반지름을 바꾸면 이전 결과 문구를 지우며 Cancel은 draft를 되돌린다. 실제 검사 결과 PASS를 IR에 캐시하지 않고 명시적 분할 수만 저장한다. 재열기 후 같은 Fit을 수행하면 현재 메시를 다시 측정한다.

거리 오차는 primitive-local mm이며 부품 scale 적용 전이다. 비균일 스케일로 변형된 타원체의 월드 오차 인증이 아니다. 임의 메시/사진 복원/곡면 전체/CAD 공차로 지원 범위를 확대하지 않는다. 표면 채널의 원자료 물성, texel-density·atlas padding, Blender normal drift를 승인하지 않는다.

## 현재 코드 검증

macOS arm64, Node24.13.1, 작업 사본 /private/tmp/sceliph-refine-20261006. 기존 체크아웃의 Git 정보/구성 일부 누락은 유지돼 HEAD·branch·git status는 blocked. 이전 사본과 Documents 원본은 임의 복구하지 않았다. 소스 해시와 결과는 results.json에 있다.

- npm test:147files/963tests PASS,105.83초.
- npm run check/build/benchmark:PASS.
- quality:gate/quality:production:exit1. 기존 전자 근거52/90·Blender acceptance 등 전체 납품 실패 유지. 후속 production dominance not-run.
- Khronos GLB9개:오류0·경고0. WebIO 실제 파일 재열기와 면 편차 검사 PASS.
- Impeccable detector:빈 결과. 실제 UI 시각·입력·다운로드/재열기는 서버 제약 때문에blocked/not-run.
- Blender5.2.1LTS 중립 렌더:first attempt exit139. 첫 import 성공도 확인하지 못했으며 재export·후면 렌더는not-run. crash와 로그 보존. 새 가설 없는 재시도 없음.

실제 GLB 삼각형으로 같은1024×1024 정사영·방향·조명·스케일의 CPU 기하 검수 clay/wire 이미지를 생성·확인했다. flat face shading이며 실제 analytic normal 기반 뷰어/PBR 렌더나 Blender 성공 자료가 아니다. 선의 미세 rasterization 이음도 있으므로 셰이딩 품질 인증으로 사용하지 않는다. 이 단계의 확인된 개선은 구면 면 근사 편차 감소다. 이전 범위 밖 gate 실패나 모델 전체 구조 정확도를 해결했다고 하지 않는다.

## 재현·증거

outputs/sphere-budget-20261006에 최초 실패 테스트, 현재 검사 로그, 파일·SHA, Blender 실패, CPU 검수 이미지,전체 비대상 보존·topology 자료를 보존했다. 출력 스크립트는 기존 파일을 덮어쓰지 않는다. source JSON은 기존 parse/edit/export 경로를 사용한다.

```sh
cd /private/tmp/sceliph-refine-20261006
npx vitest run tests/sphere-surface-budget.test.ts
npm test
npm run check
npm run build
npm run benchmark
npm run gltf:validate -- outputs/sphere-budget-20261006/files/*.glb
```

다음 한 가지 작업은 정상 로컬 서버에서 네이티브 구체 선택→오차 입력→Fit→Apply/Cancel→저장·재열기를 실제 조작해 확인하는 것이다. 이번 구면 메시 정확도 기능과 전체 제품 납품 가능 여부는 구분한다. push하지 않았다.
