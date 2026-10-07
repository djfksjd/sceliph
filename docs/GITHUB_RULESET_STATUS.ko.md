# GitHub ruleset — 2026-10-05

사용자가 저장소 ruleset을 먼저 설정하도록 요청하여 djfksjd/sceliph의 관리자 권한과 실제 원격 상태를 확인했다. 이전 rulesets는 빈 배열이며 기존 main branch protection은404였다. 기본 브랜치는main, 저장소는PUBLIC이다.

활성 규칙: https://github.com/djfksjd/sceliph/rules/24482601

- 대상: 현재 기본 브랜치(`~DEFAULT_BRANCH`).
- main 직접 push 대신 PR 필수.
- 삭제와 non-fast-forward/강제 push 차단.
- PR 리뷰 대화 해결 필수.
- 필수 승인0: 별도 리뷰어가 확인되지 않은 개인 저장소 기준.
- bypass actor 없음. 관리자의 우회 push도 허용 목록에 추가하지 않았다.

POST 후 ruleset 상세GET과 main effective-rules GET에서 deletion/non_fast_forward/pull_request를 재확인했고 branch API의 protected:true도 확인했다. 실제 삭제/강제 push로 시험하지 않았다. 코드 commit/push/merge는 하지 않았다. 이후 코드 업데이트는 별도 브랜치와 PR로 수행해야 한다.

필수 status check는 아직 미등록이다. 최근 원격Quality5회가 모두 실패했고 현재HEAD3d26188의 실패는npm test 단계다. 로그에는 gear-math-policy 실제GLB byte 비교 실패1개와 native-blender-normal-kit/surface-cache/workspace-history의5초 timeout3개가 있다. 이 원격 실행은863테스트 당시 코드이며 현재 미커밋 수정본의 로컬930테스트 PASS와 구분한다. 검사를 삭제/skip하거나 timeout/임계값을 완화하지 않았다. 기존Quality workflow도 유지했다.

원격 실패를 해결하고 실제 GitHub 실행이 통과하기 전에는 필수 CI 설정 완료로 보고하지 않는다. 단순 ruleset 생성이 제품 품질 검증이나50% 목표 완료를 의미하지 않는다. 다음 CI 작업은 Node20.19.0/Linux에서 원격HEAD의 byte 비교 실패를 원본 버퍼/GLB metadata 차이로 분리하는 것이다.

로컬 Docker240초 상한의 두 진단을 실행했다. 원격HEAD를 그대로 archive한 코드에서 Node20.19.0/Linux arm64는gear-math-policy8개 PASS, linux/amd64는7개PASS/1개FAIL이었다. amd64는 Apple arm64의 에뮬레이션이며 실제 GitHub 러너 실행을 대신하지 않는다. 추가 진단에서 whole GLB bytes는 다르지만 BIN은 완전히 같다. 차이는 JSON `/nodes/0/extras/sourceSpec/parts/0/geometry/points/23/1`의8.147647602939013→8.147647602939012, points/25/1의8.25444768324152→8.254447683241521 두 지점뿐이다. 기하·normal·UV·index 바이너리는 보존됐다. 이는 legacy 진단 tooth의 Float64 sourceSpec 포인트에서 발생하는 플랫폼 차이를 분리한 결과이며 구체적인 산술 연산 수정은 아직 하지 않았다. strict bytes를 수치 tolerance로 바꾸거나 기준 파일을 덮어쓰지 않았다. timeout3개는 이 두 기어 진단에서 재실행하지 않았다.

증거: outputs/github-ruleset-20261005의 before/request/created/verified/main-effective-rules JSON, 원격실패로그와 로컬Linux 진단 결과.550MiB 수준의 원격HEAD archive는 authoritative checkout에 로컬 보존하고 일반 mirror 증거 복사에서 제외한다. 아카이브를 실행한 현재 미커밋 코드로 혼동하지 않는다.
