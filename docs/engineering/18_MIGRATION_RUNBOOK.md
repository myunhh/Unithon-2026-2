# 18. Monorepo→분리 저장소·DB 마이그레이션 Runbook

## 목적

사용자 기능을 중단하지 않고 현재 단일 저장소/JSON aggregate를 두 저장소/정규화 DB/API v1로 전환한다. 각 단계는 검증과 rollback 지점을 가진다.

## 사전 조건

- 원본 default branch와 commit SHA 기록.
- 현재 `typecheck`, `test`, `lint`, `build`, web/desktop smoke 결과 보존.
- production Supabase DB/Storage backup과 restore rehearsal.
- GitHub에 빈 private/public 정책의 `paperbridge-frontend`, `paperbridge-backend` 생성.
- `git-filter-repo`, `gh`, Node LTS, package manager 준비.
- migration/cutover owner와 maintenance window 지정.

## Phase 0 — Freeze baseline

```bash
git checkout master
git pull --ff-only
git tag split-base-$(date +%Y%m%d)
git push origin --tags
npm ci
npm run typecheck
npm test
npm run lint
npm run build
```

실패하면 분리 전에 원본 기준선을 먼저 수리한다. 기능 PR을 잠깐 freeze하고 긴급 수정만 cherry-pick한다.

## Phase 1 — 문서/계약 적용

- 이 번들의 `docs/engineering`과 `AGENTS.md`를 원본에 적용한다.
- ADR/OpenAPI/DB 초안을 팀 리뷰한다.
- OPEN 결정 중 배포를 차단하는 항목을 확정한다.
- docs branch만 먼저 merge해 두 agent가 같은 기준을 읽게 한다.

## Phase 2 — 이력 보존 repo 생성

`scripts/split-history.sh`를 dry-run directory에서 실행한다.

```bash
./scripts/split-history.sh /path/to/Unithon-2026-2 /path/to/output
```

검증:

- 주요 FE/BE 파일의 `git log --follow`가 유지된다.
- secret `.env`나 build artifact가 포함되지 않는다.
- package lock과 config는 임시 상태임을 표시한다.
- 원본 remote를 제거/rename한 후 새 remote를 설정한다.

새 repo push 전 `git log --all --stat`와 secret scan을 수행한다.

## Phase 3 — 독립 bootstrap

### Frontend

- root package에서 server dependencies/scripts 제거.
- web/desktop scripts만 유지.
- generated client/MSW setup.
- Electron backend import를 interface 뒤로 격리.

### Backend

- API/worker package structure.
- React/Electron/Vite dependency 제거.
- current API를 module route로 감싸 regression test.
- OpenAPI v1 compatibility endpoint 추가.

Gate:

```text
FE clean clone: install → lint → typecheck → test → web build → electron build
BE clean clone: install → lint → typecheck → test → API/worker build
```

## Phase 4 — API 계약 전환

1. backend가 `/api`와 `/v1`을 병행한다.
2. 현재 behavior를 OpenAPI example/contract test로 고정한다.
3. frontend 직접 fetch를 generated client로 교체한다.
4. feature별로 `/v1`으로 이동한다.
5. telemetry에서 legacy `/api` consumer가 0인지 확인한다.
6. deprecation 기간 후 삭제 PR을 별도로 만든다.

Rollback: frontend contract version과 endpoint base를 이전 release로 되돌린다. `/api` adapter는 전환 기간 유지한다.

## Phase 5 — Electron decoupling

1. packaged main의 backend source import를 feature flag 뒤로 둔다.
2. static renderer + local bridge skeleton.
3. remote API auth/PKCE/token broker.
4. allowlisted proxy와 health.
5. local CLI IPC를 canonical event로 전환.
6. legacy embedded server 제거.

Gate: backend checkout/node module 없이 production package가 launch하고 cloud API/local CLI를 각각 smoke한다.

Rollback: 내부 beta에서는 이전 signed desktop release/feed로 되돌린다. token/local settings migration은 backward compatible하게 유지한다.

## Phase 6 — 정규화 DB expand

1. extension/type/helper/table/index 생성.
2. RLS enable/policy 추가.
3. 기존 JSON state는 그대로 유지.
4. 새 write path를 feature flag 뒤에 배포.
5. backfill job과 audit table 준비.

큰 index/constraint는 lock 시간과 online/concurrent 전략을 staging에서 측정한다.

## Phase 7 — Backfill

Legacy namespace aggregate마다:

- session/user를 personal workspace로 mapping.
- documents→documents/document_versions.
- Storage path/checksum/size 복원 또는 계산.
- highlights→annotations + canonical anchor.
- provider encrypted state→provider_connections; 재암호화가 필요하면 사용자 재연결 정책.
- revision/source ID를 migration metadata로 저장.

Backfill은 batch cursor, idempotency, retry, dry-run, per-record error table을 가진다.

## Phase 8 — Dual write/read parity

- write: legacy + normalized를 같은 service orchestration에서 기록하되 한쪽 실패를 metric/audit한다.
- read shadow: 사용자 response는 legacy, normalized 결과를 background compare.
- parity: document count/metadata/storage access/highlight geometry/provider status.
- 민감한 secret plaintext 비교는 하지 않고 decrypt/test 상태만 검증한다.

Gate는 샘플이 아닌 전체 또는 통계적으로 승인된 coverage와 0 critical mismatch다.

## Phase 9 — Read cutover

1. internal/staging normalized read.
2. production cohort/canary.
3. error/latency/parity 관찰.
4. 100% normalized read.
5. legacy write는 rollback window 동안 유지.

Rollback: read flag를 legacy로 되돌린다. 새 기능이 normalized-only data를 만들기 전에 rollback compatibility를 확보한다.

## Phase 10 — Contract/cleanup

- legacy API 호출 0.
- normalized read/write 안정 기간.
- JSON aggregate write 중단.
- retention 후 legacy state/archive 삭제.
- compatibility code와 feature flag 제거.
- final backup/restore와 account deletion 검증.

## Verification query 범주

- workspace별 document/annotation count.
- Storage object existence/checksum.
- normalized anchor bounds/rect count.
- provider connection decrypt/test 가능 여부.
- active run/budget/usage invariant.
- cross-tenant RLS negative.
- deleted/expired data retention.

실제 query는 schema와 staging data를 기준으로 migration PR에 추가한다.

## 실패 대응

| 실패 | 조치 |
|---|---|
| history split 누락 | 새 repo 폐기 후 filter path 수정·재생성 |
| contract mismatch | backend compatibility 유지, FE rollback |
| backfill 일부 실패 | cursor 중지, error table 수정 후 idempotent resume |
| RLS block/누출 | feature flag off, policy hotfix, audit 조사 |
| Storage mismatch | 원본 삭제 금지, reconciliation queue |
| Desktop auth 실패 | beta feed 중지, 이전 signed version 유지 |
| DB destructive migration | forward-fix 우선, restore는 incident owner 승인 |

## 완료 조건

- 두 repo가 독립 CI/CD와 release artifact를 가진다.
- backend source 없이 Desktop package 가능.
- `/api` consumer 0, OpenAPI v1이 권위.
- 모든 active user data가 normalized schema에 있고 parity report 승인.
- legacy aggregate/embedded server 제거 전에 rollback window 완료.
