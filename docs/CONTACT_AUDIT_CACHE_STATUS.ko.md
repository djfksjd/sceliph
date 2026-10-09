# 2026-10-07 반복 접촉 검사 비용

실행 위치 `/private/tmp/sceliph-publish-20261007`, branch `engine/lathe-connectivity-20261007`, HEAD `24b541fc3fca9a35f16c34a1ba38c934777b647a` 위의 작업 트리다. 이전 변경을 보존했다. 이번 checkpoint 예산30분/동일 결함 수정 가설2회, UNI_AI/Claude/API/새 의존성/원격 write 없음. Goal 도구 상태는 변경하지 않았다.

## 가설과 구현

이전 단계의 샘플 transform 최적화 후에도 복합 recipe 테스트가 5초를 넘었다. 같은 입력의 contact 검사를 각 편집 전후·반복 recipe·재열기·no-op에서 재실행하는 설계를 확인했다. 한 단계의 after IR이 다음 단계 before IR과 같아도 모든 관련 component를 다시 polygonize/topology 검사하고 실제 clearance를 다시 계산했다.

`src/engine/assembly-contact-witness.ts`에 성공한 실제 측정값만 저장하는 process-local LRU 캐시를 추가했다. 버전 `sceliph.contact-audit-cache/0.1`, 최대16항목/512KiB 문자열 payload다. 이 수치는 전체 JS heap 측정값이 아니다. GPU texture/geometry/Material/IR 객체는 보관하지 않는다. 최초 검사의 triangle/topology/matrix/clearance 검사와 finally dispose는 동일하다.

매 호출마다 contract parse와 전체 `validateAssemblyIR`를 먼저 실행한다. 캐시 키는 전체 JSON IR과 signed-zero 위치를 포함한 정확한 문자열이다. hash 근사나 수치 tolerance를 사용하지 않는다. 기하·좌표·축·scale·witness 위치·최소 clearance·원천 자료·기타 IR 필드가 달라지면 hit하지 않는다. 관련 없는 변경도 miss하므로 일부 변경을 추측해서 제외하지 않는다.

캐시 반환값은 내부 저장된 JSON에서 새 객체로 만들어 사용자 수정이 내부 PASS를 오염시키지 않는다. 실패는 저장하지 않는다. key 구성은10000노드/32깊이/128Ki문자 한도며 oversized/non-JSON/accessor/toJSON hook/sparse array는 캐시를 우회한다. 캐시 최적화의 범위 제한 때문에 기존 입력을 새로 거부하지 않는다. 캐시 eviction 후에는 원래 검사 경로로 돌아간다. 영구 receipt나 납품 승인으로 저장하지 않는다.

기존 IR schema, recipe, source fingerprint, export, UV threshold, topology threshold, test timeout 변경 없음. 실제 caller인 implicit ellipsoid edit와 primary recipe가 기존 audit 함수를 호출하므로 별도 UI 플래그 없이 활성 경로에서 사용된다.

## 재현과 자료

`outputs/contact-cache-20261007/`에 이전 구현, baseline 실패, 새 fixture 실패, 유효한 fixture의 before 실패, 변경 후 로그와 실제 파일을 보존한다. 처음 fixture는 segments1로 계약 최소3을 위반했다. 제품 검증을 완화하지 않고 fixture를3으로 수정했다. 유효한 이전 경로는 동일 입력 재호출 시2개 component를 다시 compile해 신규 기대값에 실패했다.

baseline implicit test를 기다리는 도중 running 결과를 잘못 다뤄 짧은 신규 fixture 검사가 겹쳤다. 해당 baseline wall-clock 수치를 통제된 성능 비교로 사용하지 않는다. 이전 체크포인트의 실패와 현재 새 경로의 통과는 별도로 기록한다. 후속 heavy/full 검사는 순차 실행한다.

첫 GLB 진단 스크립트는 Assembly compiler의 실제 API를 잘못 사용했다(mode 인자는 문자열이며 반환값에 dispose가 없음). 실패 로그와 이미 생성된 파일을 보존했다. 실제 `compileAssemblyIR(ir,'clay')`와 mesh/material disposal로 수정한 별도 `parity-attempt2` 디렉터리만 현재 성공 증거다. 제품 API를 그 스크립트에 맞춰 변경하지 않았다.

변경 후 targeted 최초20테스트 통과. 기존 implicit 복합 recipe 검사1.292초/기존5초 한도, 기존 contact 재열기·반복 편집0.899초. 신규 회귀는 동일 JSON 재열기의 compile 횟수, 출력 mutation, geometry/position/witness/clearance/version/units 변경, signed-zero 구분, entry/payload eviction, oversized/non-JSON fallback, 기존 triangle budget을 검사한다.

실제 창작 bird study를 world scale0.5/1/2로 비교했다. source recipe/결과 IR/receipt/actual contact 값이 이전 경로와 동일하고, source JSON을 다시 불러온 no-op도 원본을 보존했다. 각 크기 before/after/reopened GLB3개씩 총9파일이 모든 바이트 동일하며 Khronos0오류/0경고·WebIO재열기 통과다. source와 GLB SHA는 `parity-attempt2/parity.json`에 있다. 이 파일은 clay 진단이며 beauty/실측 조류/해부학/대상 앱 납품 검증이 아니다.

시간은 macOS arm64/Apple M5/Node24.13.1의 단일 before→after 비교다. scale0.5 recipe920→543ms, scale1 648→451ms, scale2 640→481ms. 반복 샘플 통계나 모든 장비의 성능 보장은 아니다.

## 현재 판정

전체 현재 수정본 test/check/benchmark/build/quality 실행은 `execution.json`과 해당 로그에 기록한다. 검사 통과 여부를 로그 종료 전 추측하지 않는다. 실제 브라우저/Blender first import/reexport/render는 이번 단계 not-run, 이전 환경 차단과 normal drift가 해결되었다고 주장하지 않는다. GitHub write는 기존 호스트 승인 정책 차단을 우회하지 않으며 실무 납품 완료 조건은 아직 별도다.

최종 실행: `npm test`는151파일/979테스트 전부 통과(exit0,127.02초). `npm run check`, `npm run benchmark`, `npm run build` 전부 exit0. `quality:gate`/`quality:production`은 각각exit1이며 새 cache 회귀 실패가 아니다. quality locked-case/expected-rejection rates는 전부1을 유지했고, 이어지는 competitive 게이트는 기존 Blender cross-domain/edit 증거를 현재 적용 조건에서 benchmarkAccepted=false로 차단했다. 전자 조립의 실물·원천 근거는52/90으로 차단 상태를 유지한다. production의 dominance 단계는 선행 gate 실패로 not-run이다. 기존 성공 receipt를 현재 앱 실행으로 승격하지 않았다.

최종 신규 회귀9테스트에는 원래50000삼각형 한도와128Ki문자 초과 key의 bypass가 포함됐다. 별도 실제 진단은 own-toJSON/nonenumerable accessor/symbol 입력에서 이전 측정과 동일하고 hook 실행0회, cache payload/항목 증가0임을 확인했다. 안전하지 않은 입력을 JSON으로 추측 변환하여 캐시하는 경로는 없다.

이번 반복 접촉 검사 최적화 범위의 판정은 PASS다. 기존 복합 recipe 타임아웃과 전체 test 실패가 해결됐다. 실무 납품 전체 판정은 INCOMPLETE로 유지한다. 다음 한 단계는 허용된 localhost 환경에서 실제 UI recipe 적용·sourceJSON 저장·새 세션 재열기를 확인하는 것이다. 코드 단위 검증과 WebIO 검증을 실제 브라우저 동작으로 대체하지 않는다.
