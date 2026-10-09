# Sceliph 게시 체크포인트 · 2026-10-07

## 게시 범위와 기준

GitHub main 기준 SHA: `3d26188af5951e7be77ffd0d5c3c9bdf15348fea`.
원본 로컬 폴더의 Git HEAD가 누락되어 원본은 그대로 보존했다. 원격 SHA와 일치하는 기존 Git 객체로 별도 `/private/tmp/sceliph-publish-20261007` 체크아웃을 만들고 Sceliph 변경만 구성했다. 무관한 thermal 소스·설정·테스트 19개와 로컬 cache 설정은 게시하지 않는다. 이전 로컬 사본의 976개 테스트를 게시본 증거로 사용하지 않았다.

게시 변경은 LLM→선언형 IR→로컬 기하 엔진 원칙을 유지한다.

- primary form: 창작 새 예제, component-bound recipe, 접촉 witness, tube radius profile, ellipsoid sectionShape/fit/mesh budget 및 저장된 단면 검사.
- 부품 편집: 기어 입력의 구체적 오류, 기존 허용 범위의 preflight, 단위·locked·잘못된 수치·취소·적용 상태.
- 곡면 품질: 실제 facet/ring 오차에 따른 제한된 sphere/lathe 정련. 기존 compiler 기본 분할이나 IR을 자동으로 재작성하지 않는다.
- 사용자 파일 교체: native source 읽기중/실패에서 이전 편집·저장·내보내기 차단, 새 유효 입력 또는 명시적 discard로 복구, stale/unmount 응답 폐기, 동일 JSON 재열기 시 편집 draft 초기화.
- 한국어·영어 README를 최신 게시 검증과 제한에 맞춰 갱신하고 기존 브랜드 이미지·호환 스키마를 보존한다.

전용 3D 생성 모델·UNI_AI·Claude CLI·새 의존성·유료 서비스 호출은 없다. 기존 UV 5% 기준과 엄격한 GLB 바이트 계약을 유지한다. 모델 소스의 추가 항목은 해당 versioned recipe/profile/check 계약에서 선언되며 기존 필드 없는 입력은 legacy 동작을 유지한다. unknown version이나 유효 범위를 벗어난 입력은 거부한다. 제조용 솔리드·물리 접촉·해부학 인증을 주장하지 않는다.

## 이번 게시본에서 재실행한 결과

환경: macOS arm64, Node v24.13.1. 원격 CI 환경 Ubuntu/Node20과 별개다.

| 명령 | 실제 결과 |
|---|---|
| npm test |148파일·957테스트 PASS,119.92s|
| npm run check |exit0|
| npm run benchmark |exit0|
| npm run build |exit0|
| npm run quality:gate |exit1|
| npm run quality:production |exit1; 이후 dominance not-run|

전체 gate에는 기존 electronics-production-evidence/electronics-evidence 52/90 실패가 남아 있다. 의도적으로 손상시킨 dimension fixture의 pass:false는 정상적인 실패 차단 증거이며 새 회귀가 아니다. 테스트·임계값·시간 제한을 변경하거나 skip하여 통과시키지 않았다. 기존 Linux legacy gear JSON 바이트 차이와 Blender 기본 normal drift가 이번 게시에서 해결됐다고 주장하지 않는다. 원격 CI 결과는 GitHub Actions에서 별도로 확인한다.

현재 게시 코드·package-lock SHA와 이 재실행 로그는 [publication 영수증](../benchmarks/modeling-slices-20261007/publication/verification.json)에 연결된다. 별도 local checkpoint 영수증은 각각 당시 코드·실행 범위를 기록한 역사 자료다.

## 형상·파일 증거와 제한

- sphere: radius3mm의 facet 편차 0.0100138→0.0046205mm. primitive-local 선언 구면에 대한 측정이며 실측 객체 복원이 아니다.
- lathe: small/default/large/solid authored16분할 입력의 원주 편차를0.03mm 이내로 정련. default16→48분할,0.269006→0.029975mm. cardinal bounds와 비대상 속성을 보존한다.
- lathe의6파일 흐름에서18개 GLB의 Khronos 오류·경고0, WebIO accessor 재열기·오차 측정, after/reopened 전체 바이트 일치. no-op sourceJSON/GLB 보존 포함. 이 파일들은 해당 코드·입력의 로컬 증거이며 대상 DCC 편집 검증이 아니다.
- sphere 및 lathe stage의 실제 sourceJSON/GLB·실패 로그·receipt를 [STORAGE](../benchmarks/modeling-slices-20261007/checkpoint/STORAGE.json)에 원본 SHA와 함께 보관한다. 일부 GLB/log/큰JSON은 무손실 gzip이며 원본 SHA는 압축 해제한 바이트에 적용한다. diagnostic render는 CPU 기하 진단이며 Blender/PBR 품질 증거로 취급하지 않는다.
- 실제 최신 브라우저 파일 선택·키보드·다운로드·새 세션 재열기와 Blender first import/reexport는 blocked/not-run이다. local 서버 미응답·실행 권한 차단을 우회하지 않았다. 과거 browser receipt를 최신 사용자 흐름의 성공으로 승격하지 않는다.

## 사용과 다음 작업

`npm run dev` 후 `/?editor=elements`에서 native JSON을 불러오고 부품을 수정·저장한다. 새 파일이 읽히지 않으면 명시적으로 discard하여 이전 프로젝트로 돌아갈 수 있다. lathe 오차 Fit은 아래 명시적 CLI 경로이며 새 디렉터리를 지정해야 한다.

```sh
npx vite-node scripts/fit-lathe-surface.ts assembly.json component_id 0.03 new-output-directory
```

이 게시 체크포인트는 alpha 코드 최신화다. 실제 UI·대상 앱 검증과 전체 납품은 미완료다. 다음 한 작업은 정상 localhost에서 파일 교체·실패·복구·저장·재열기·추가 편집·GLB 다운로드를 실제 조작 검증하는 것이다.
