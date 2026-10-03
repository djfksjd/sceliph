# Lathe 분할 수 사전 검사

2026-10-04, 기준 `39714644808e444be37ef16f2b3ea0d0c8fb383f`, compiler0.40. 기존 스키마의 정수3~512 조건을 runtime preflight에도 적용했다. 새로운 기하 기능·스키마·자동 반올림을 추가하지 않았다. 정상 입력의 생성 엔진과 출력은 그대로다. UNI_AI/Claude 호출0회, 계약 예산15분/새 증거100MiB 이내.

## 재현과 변경

선언 `lathe.segments=32.5`는 이전 IR 사전 검사를 통과했다. 기존 UV 안전 검사가 생성된 퇴화 삼각형을 뒤에서 차단했으므로 손상 모델이 납품됐다고 주장하지 않는다. 잘못된 입력을 일찍 설명하지 못하는 검증 순서 결함이다.

`assembly-compiler.ts`의 lathe 검사에 명시된 segments의 정수·3~512 범위를 추가했다. 분수·문자열·null·boolean·배열·객체를 거부한다. 기존 NaN/Infinity/범위 초과 숫자 안전 검사와 UV 퇴화 차단은 유지한다. 생략된 기본64와 기존 유효 정수는 바꾸지 않는다. 기존0.1 IR 스키마 자체가 비정상 타입을 허용하지 않았으므로 비정상 선언의 자동 migration은 제공하지 않는다. 사용자가 의도한 정수를 명시해 다시 저장해야 하며 엔진이 임의로 반올림하지 않는다.

구현 전 신규 테스트3개 중2개 실패·1개 성공을 기록했다. 수정 후 전체113파일/814테스트, 관련9개, `npm run check`, `npm run benchmark`, `npm run build` PASS.

## 실제 결과

- 기본값/3/16/32/64/128/512의 실제 POSITION·NORMAL·UV·index·bounds fingerprint가 변경 전후 정확히 일치했다.
- 작은·기본·큰 부싱과 솔리드 회전체의 원본/법선 옵션8개 GLB를 현재 코드로 재생성했다. 모두 이전 실제 파일과 전체 SHA가 같고, 현재 Khronos/WebIO 재열기 PASS다. 기존 infos도 그대로 보존했다.
- 실제 브라우저에서 유효 원본을 열고32.5 파일을 업로드했다. `Lathe segments must be an integer from 3 to 512 in bushing.` 오류를 확인했다. 실패 후 SAVE IR은 원본과 같고, GLB 다운로드 전후 전체 SHA도 같다. 부분 적용하지 않았다.
- 오류는 기존 검사 패널 상단에 표시된다. 다운로드 조작으로 패널이 아래로 스크롤된 경우 위로 스크롤해야 보인다. 자동 toast를 추가한 것은 아니다. 실제 스크롤 후 CSS visibility·rect와 화면 캡처로 표시를 확인했다.

실제 브라우저 GLB SHA: `05cb768dbea6f4c48e98f6189c757fcf3b4ce34812fcb74c08d6b9e2b6a980be`.

`quality:production`은 내부 quality/release 대응 통과 후 기존 cooling UV infos23의 strict competitive 기준에서 exit1, dominance not-run이다. 이번에 기준을 변경하거나 UV를 삭제하지 않았다. Blender·Godot·PrusaSlicer 재실행은 **not-run**이다. 이번 검증은 현재 실제 파일의 전체 바이트 동일성과 독립 재열기이며 이전 native 실행을 새 실행으로 표기하지 않는다. 형상 품질이 개선됐다고 주장하지 않고 잘못된 입력의 실패 경로를 개선했다고 보고한다.

현재 코드 SHA·명령·실제 파일은 공개 [`benchmarks/modeling-slices-20261004/lathe-segment-preflight`](../benchmarks/modeling-slices-20261004/lathe-segment-preflight), 로컬 `/Users/danny/Documents/morphloom/outputs/lathe-fractional-segments-20261004`의 manifest와 로그를 따른다. 환경 Apple M5/macOS/Node24.13.1, 브라우저 실제 파일 업로드/다운로드. 원본 폴더의 사용자 변경을 덮어쓰지 않는다.

```sh
npm test -- --run tests/assembly-lathe-segment-validation.test.ts tests/assembly-lathe-normals.test.ts
npm test
npm run check
npm run benchmark
npm run build
npm run quality:production
```

다음 단계는 실제 곡면 분할 오차를 근접 카메라의 화면 해상도와 연결해 측정하고, 기존 lathe segments의 부품 편집 경로를 활용할지 판단하는 것이다. 계속되는 Goal은 active다.
