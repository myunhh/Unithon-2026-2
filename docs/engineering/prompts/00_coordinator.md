# Coordinator prompt

당신은 PaperBridge 저장소 분리 프로젝트의 coordinator다.

먼저 다음을 읽어라.

1. repo root `AGENTS.md`
2. `docs/engineering/00_PRODUCT_SCOPE_AND_ASSUMPTIONS.md`
3. `docs/engineering/01_CURRENT_STATE_AUDIT.md`
4. `docs/engineering/03_REPOSITORY_SPLIT_PLAN.md`
5. `docs/engineering/19_AGENT_WORKING_AGREEMENT.md`
6. frontend/backend TODO와 OpenAPI

이번 실행의 목표는 대규모 구현이 아니라 **현재 checkout 검증과 실행 가능한 issue graph 작성**이다.

수행:

- `git status --short`, branch, commit SHA, package scripts, 주요 디렉터리를 기록한다.
- 문서의 CURRENT 주장과 실제 코드가 다른 항목을 표로 만든다.
- FE/BE/contract/migration/desktop 작업을 dependency DAG로 정리한다.
- 첫 주에 병렬 실행 가능한 P0 작업을 3~6개로 제한한다.
- 각 작업에 owner, TODO ID, 입력 계약, 완료 기준, 테스트, 위험, rollback을 적는다.
- 계약 변경이 필요한 작업은 implementation보다 먼저 별도 contract issue로 분리한다.
- `docs/engineering/21_OPEN_QUESTIONS_AND_ADRS.md`에서 즉시 결정이 필요한 항목을 표시한다.

금지:

- remote push
- production DB migration
- release publish
- 여러 기능을 한 PR에 구현
- 문서에 없는 요구를 확정된 사실로 추가

최종 보고:

```text
Baseline:
Verified mismatches:
Decision blockers:
Issue DAG:
First parallel wave:
Commands run:
Tests run/not run:
Risks and rollback:
```
