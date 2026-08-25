# 19. 멀티 에이전트 작업 규약

## 목적

Frontend Agent와 Backend Agent가 서로 기다리거나 같은 파일을 덮어쓰지 않고 병렬 개발하도록 계약·소유권·handoff 형식을 고정한다.

## 역할

| Agent | 소유 | 금지 |
|---|---|---|
| Coordinator | milestone, ADR, dependency, integration decision | 구현을 두 repo에 동시에 대량 수정 |
| Backend Agent | OpenAPI, JSON Schema, DB/RLS, API/worker, contract release | FE UI/renderer 직접 수정 |
| Frontend Agent | Web/Reader/Electron, generated client 소비, mock, macOS | DB/schema/provider remote secret 처리 |
| Integration Reviewer | contract diff, E2E, security boundary, release readiness | 새로운 요구를 암묵적으로 추가 |

## 단일 권위

1. `openapi.yaml`, `contracts/*.schema.json`.
2. 적용된 DB migration.
3. ADR.
4. 구현 명세.
5. TODO/issue.

충돌을 발견하면 임의로 맞추지 않고 contract/ADR issue를 만든다.

## 작업 단위

- 한 agent는 한 issue/branch/worktree.
- branch: `feat/FE-###-slug`, `feat/BE-###-slug`, `contract/C-###-slug`.
- issue에 목적, non-goal, contract impact, acceptance, test, rollout을 적는다.
- 1 PR은 원칙적으로 한 repo. Cross-repo 변경은 contract PR → backend implementation → frontend consumer PR 순서로 나눈다.
- generated file은 생성 source와 함께 변경하고 수동 편집하지 않는다.

## Contract-first handoff

Backend Agent가 제공:

```yaml
contract_version: 1.4.0
change: additive
operations:
  - POST /v1/runs
  - GET /v1/runs/{runId}/events
examples:
  - run-accepted.json
  - budget-exceeded.json
feature_flag: runs_v1
available_in: staging
```

Frontend Agent는 exact version을 pin하고 MSW example로 UI를 먼저 구현한다. staging capability가 없으면 production UI를 노출하지 않는다.

## 상태 보고 형식

각 agent는 작업 종료 시 PR description에 다음을 남긴다.

```text
Summary:
Changed files/modules:
Contract/schema impact:
Migration/feature flag:
Tests run and result:
Security/privacy review:
Known limitations:
Follow-up IDs:
Rollback:
```

“테스트 통과”만 쓰지 않고 실제 명령과 실패/미실행 이유를 기록한다.

## 파일 소유 충돌 방지

### Frontend

- `src/generated/**`: generator only.
- `electron/security/**`, release workflow: security/release review 필수.
- Reader geometry와 selection schema adapter는 별도 owner review.

### Backend

- `openapi/**`, `packages/contracts/**`: contract owner.
- `supabase/migrations/**`, RLS: database/security owner.
- provider encryption/budget ledger: security/finance invariant review.

Coordinator는 같은 migration/contract file을 두 agent에게 동시에 배정하지 않는다.

## Agent 실행 순서

1. Coordinator가 현재 repo와 docs를 읽고 issue graph를 만든다.
2. Backend Agent가 C-001 OpenAPI baseline과 mock examples를 완성한다.
3. Frontend Agent가 generated client/MSW를 연결한다.
4. BE/FE가 독립 TODO lane을 병렬 수행한다.
5. Integration Reviewer가 staging E2E와 contract/version/capability를 검증한다.
6. Desktop release agent는 cloud API 안정 후 signing lane을 진행한다.

## Codex 사용 규칙

- 각 prompt는 repo root에서 실행하고 해당 repo `AGENTS.md`를 우선 읽게 한다.
- 시작 전 `git status --short`, 현재 branch, test baseline을 기록한다.
- sandbox는 workspace write로 제한하고 필요한 외부 network/credential은 사람이 제공한다.
- destructive command, remote push, migration apply, release publish는 명시 승인 전 실행하지 않는다.
- 작업 중 발견한 unrelated defect는 수정하지 말고 issue/handoff에 기록한다.
- 기존 test를 삭제/완화해 통과시키지 않는다.

## Integration 계약

- frontend는 capability endpoint와 contract version을 startup에서 확인한다.
- backend는 최소 한 minor 호환 window를 유지한다.
- unknown response field/event는 frontend가 무시한다.
- required/type/semantic breaking은 major와 migration guide가 필요하다.
- enum을 exhaustive switch로 소비한다면 enum 추가도 breaking으로 취급한다.

## Merge 순서

### Additive endpoint

1. contract + backend implementation deploy.
2. staging capability on.
3. frontend consumer merge/deploy.
4. feature flag rollout.

### Breaking replacement

1. 새 endpoint/field additive.
2. dual support.
3. frontend migration.
4. usage 0 확인.
5. old contract deprecate/delete.

## 리뷰 질문

- 이 PR은 다른 repo를 몰래 import/의존하는가?
- contract에 없는 behavior를 UI가 가정하는가?
- DB entity/provider SDK 타입이 client로 누출되는가?
- PDF coordinate/parser version mismatch가 fail-safe인가?
- budget/permission/citation/terminal invariant가 test되는가?
- Desktop renderer에 권한이 새로 노출되는가?
- rollout과 rollback이 실제로 가능한가?

## 병렬 개발 완료 조건

- BE 없이 FE가 MSW로 핵심 UI 개발 가능.
- FE 없이 BE가 OpenAPI conformance/fake provider로 완료 가능.
- staging에서는 exact contract artifact로 E2E.
- 각 TODO의 dependency와 owner가 CSV/issue에서 추적 가능.
