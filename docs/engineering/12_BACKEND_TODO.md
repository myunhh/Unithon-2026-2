# 12. Backend TODO

## 사용 방법

- 우선순위: **P0**는 repo 분리·MVP 안전성·계약 기반, **P1**은 Beta, **P2**는 연구실·확장이다.
- 각 migration은 한 목적만 갖고 forward/rollback 또는 명시적 forward-fix 전략을 포함한다.
- 세부 import용 목록은 `todo/backend.csv`가 권위다.

## Milestone B0 — 저장소·계약 기반

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| BE-001 | P0 | backend 이력 보존 분리 | - | `server/**` 이력 유지, UI/Electron 없음 |
| BE-002 | P0 | workspace/package 구조 생성 | BE-001 | `apps/api`, `apps/worker`, packages 독립 build |
| BE-003 | P0 | strict config schema | BE-002 | startup fail-fast, secret log 없음 |
| BE-004 | P0 | HTTP framework/module skeleton | BE-002 | route/service/repository/policy 경계 |
| BE-005 | P0 | OpenAPI 3.1 원본·lint | BE-004 | 모든 public route operationId/schema/example |
| BE-006 | P0 | contract client/package publish | BE-005 | exact semver artifact, provenance |
| BE-007 | P0 | problem+json/error registry | BE-004 | stable code·request ID·redaction |
| BE-008 | P0 | request ID/log/metrics baseline | BE-004 | 모든 request/run/job correlation |
| BE-009 | P0 | `/api` compatibility adapter | BE-005 | 기존 FE 전환 기간 regression test |
| BE-010 | P0 | CI branch/contract/migration gates | BE-002 | clean clone full gate |
| BE-011 | P0 | root AGENTS/CODEOWNERS/PR template | BE-001 | backend ownership/contract rule |
| BE-012 | P0 | remote API와 Electron import 계약 제거 | BE-004 | backend는 packaged desktop 내부 import 안 됨 |

## Milestone B1 — 인증·Workspace·데이터 모델

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| BE-020 | P0 | Supabase auth session endpoints | BE-004 | signup/login/logout/session/password tests |
| BE-021 | P0 | web cookie flags/rotation/CSRF | BE-020 | Secure/HttpOnly/SameSite/Origin 정책 |
| BE-022 | P0 | request auth context | BE-020 | user/session/device/method 추출 |
| BE-023 | P0 | authorization policy module | BE-022 | route 직접 role 비교 금지 |
| BE-024 | P0 | auth rate limit/lockout telemetry | BE-020 | 분산 limiter와 enumeration 방지 |
| BE-025 | P1 | device sessions/revoke | BE-022 | device별 refresh revoke/audit |
| BE-026 | P0 | desktop PKCE authorization endpoints | BE-022 | S256, state, one-time code, expiry |
| BE-030 | P0 | profiles/workspaces/members migration | BE-002 | 가입 시 personal workspace |
| BE-031 | P0 | workspace RLS helper/policies | BE-030 | cross-user negative test |
| BE-032 | P0 | workspace CRUD | BE-023,BE-030 | ETag, owner invariant |
| BE-033 | P1 | invitations accept/expire/revoke | BE-032 | token hash·role·expiry·audit |
| BE-034 | P1 | member role update/remove | BE-032 | 마지막 owner 보호 |
| BE-035 | P1 | account export/delete orchestration | BE-030 | job status·retention·provider secret 삭제 |

## Milestone B2 — Document·Storage

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| BE-040 | P0 | upload session/signed target | BE-030 | MIME/size/checksum/expiry/idempotency |
| BE-041 | P0 | upload complete transaction | BE-040 | storage verify→version→job→outbox atomic |
| BE-042 | P0 | document list/get/cursor | BE-041 | workspace policy·stable cursor |
| BE-043 | P0 | rename/soft delete/file-access | BE-042 | ETag, short signed URL, no-store |
| BE-044 | P0 | document parse state/capabilities | BE-041 | Reader-ready와 analysis-ready 분리 |
| BE-045 | P0 | legacy multipart compatibility | BE-040 | deprecation header, parity test |
| BE-046 | P1 | metadata search/filter | BE-042 | indexed title/author/date |
| BE-047 | P0 | orphan Storage reconciliation | BE-041 | expired upload/object/DB mismatch cleanup |
| BE-048 | P1 | document version replacement | BE-043 | annotation orphan policy·current version CAS |
| BE-049 | P2 | DOI/import source model | BE-042 | source provenance·dedupe checksum |

## Milestone B3 — Parsing·Object Graph

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| BE-050 | P0 | durable queue/outbox publisher | BE-041 | transaction outbox, lease, retry, DLQ |
| BE-051 | P0 | parse worker sandbox/resource limit | BE-050 | temp cleanup, timeout, memory/page limits |
| BE-052 | P0 | PDF validation/error taxonomy | BE-051 | password/corrupt/too-large 구분 |
| BE-053 | P0 | page geometry/text extraction | BE-051 | rotation/transform/version metadata |
| BE-054 | P0 | line/block/reading-order structure | BE-053 | 1단/2단 fixture tolerance |
| BE-055 | P0 | object graph artifact writer | BE-054 | versioned schema, deterministic IDs |
| BE-056 | P1 | figure/table/equation/caption relation | BE-054 | object role + reference block |
| BE-057 | P0 | pages/blocks projection + full text index | BE-055 | bulk transaction/idempotent upsert |
| BE-058 | P0 | parse retry/status/admin recovery | BE-050 | retryable 분류, attempt/heartbeat |
| BE-059 | P2 | textless detection/OCR lane | BE-053 | provenance·plan gate·normalized coords |
| BE-060 | P0 | annotation CRUD/anchor validation | BE-054 | document/version/page/schema/RLS |
| BE-061 | P1 | note conflict/autosave support | BE-060 | ETag/version, size limit |
| BE-062 | P1 | annotation orphan/relocation fields | BE-048,BE-060 | source snapshot·state transition |
| BE-063 | P2 | annotation export | BE-060 | portable JSON/Markdown with provenance |

## Milestone B4 — Provider·Agent·Run

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| BE-070 | P0 | provider registry/capability model | BE-005 | remote provider-neutral descriptor |
| BE-071 | P0 | BYOK envelope encryption/key version | BE-070 | ciphertext만 저장, rotation test |
| BE-072 | P1 | model catalog/pricing freshness | BE-070 | capability, source, fetched_at, stale flag |
| BE-073 | P0 | connection test/error normalization | BE-071 | secret/raw body log 없음 |
| BE-074 | P0 | provider timeout/concurrency/circuit breaker | BE-070 | retry classification와 metrics |
| BE-075 | P1 | default agents seed | BE-030 | 설명/번역/수식/방법론/비판 리뷰 |
| BE-076 | P1 | agent CRUD + immutable versions | BE-075 | clone/visibility/capability/prompt validation |
| BE-077 | P1 | agent publish/archive policy | BE-076 | workspace scope와 audit |
| BE-080 | P0 | run create/authorization/context assembly | BE-054,BE-070 | idempotency, operation capability |
| BE-081 | P0 | event log + SSE replay/live tail | BE-080 | monotonic sequence, heartbeat, Last-Event-ID |
| BE-082 | P0 | remote execution adapter | BE-073,BE-081 | malformed SSE/JSONL normalization |
| BE-083 | P0 | cancel/timeout/terminal CAS | BE-082 | terminal 정확히 하나, late event drop |
| BE-084 | P0 | prompt assembly/injection boundary | BE-080 | trusted/untrusted 분리, limits |
| BE-085 | P0 | citation allowlist/result validation | BE-054,BE-082 | context 밖 citation 제거, unsupported 상태 |
| BE-086 | P0 | budget reservation/settlement | BE-072,BE-080 | concurrent overspend 0, microusd ledger |
| BE-087 | P0 | usage summary/reconciliation | BE-086 | actual/estimated/price snapshot 구분 |
| BE-088 | P1 | run retention/replay compaction | BE-081 | final projection 보존, event TTL |

## Milestone B5 — Retrieval·Chat·비즈니스 기능

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| BE-100 | P1 | evidence-based document summary | BE-057,BE-085 | problem/method/result + citation |
| BE-101 | P1 | thread/message/document chat | BE-057,BE-080 | user message+run atomic, pagination |
| BE-102 | P1 | object explanation retrieval | BE-056,BE-085 | caption+reference paragraph context |
| BE-103 | P1 | hybrid retrieval/top-k/diversity | BE-057 | FTS baseline, optional pgvector |
| BE-104 | P1 | retrieval/result cache | BE-103 | version/agent/model key, privacy TTL |
| BE-105 | P2 | page/section translation job | BE-057,BE-081 | block order·progress·partial resume |
| BE-110 | P1 | budget policy CRUD | BE-086 | user/workspace/provider/model hierarchy |
| BE-111 | P1 | plan entitlement/capability service | BE-030 | server authority, feature flag와 분리 |
| BE-112 | P1 | subscription/billing webhook skeleton | BE-111 | signature/idempotency/audit |
| BE-113 | P2 | Lab seat/organization usage | BE-034,BE-087 | member attribution·seat state |

## Milestone B6 — 운영·보안·배포

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| BE-120 | P0 | structured log redaction | BE-008 | secret/PDF/prompt/output/path 차단 test |
| BE-121 | P0 | metrics/tracing/SLO dashboard | BE-008 | API/run/parse/storage/provider 지표 |
| BE-122 | P0 | shared rate limiter | BE-004 | route/user/workspace/provider limits |
| BE-123 | P0 | security headers/CORS/body limits | BE-004 | exact origin·no wildcard credentials |
| BE-124 | P0 | audit log taxonomy | BE-030 | provider/member/budget/delete/device event |
| BE-125 | P0 | backup/restore rehearsal | BE-030 | RPO/RTO evidence와 private Storage 포함 |
| BE-126 | P0 | migration expand/contract pipeline | BE-030 | staging rehearsal·lock timeout·rollback |
| BE-127 | P0 | API/worker container images | BE-002 | non-root, healthcheck, SBOM |
| BE-128 | P0 | staging deployment/smoke | BE-127 | Supabase/storage/provider fake E2E |
| BE-129 | P1 | production canary/rollback | BE-128 | contract compatibility와 migration gate |
| BE-130 | P1 | dependency/secret/container scanning | BE-010 | high severity policy·exceptions expiry |
| BE-131 | P1 | incident runbooks | BE-121 | provider outage, queue backlog, key leak, RLS |
| BE-132 | P1 | data retention/cleanup jobs | BE-035,BE-088 | soft delete/event/upload/audit TTL |
| BE-133 | P1 | load/cost test | BE-087,BE-121 | concurrent run/upload/SSE envelope |
| BE-140 | P2 | Zotero/DOI connector | BE-049 | SSRF-safe fetch/provenance/rate limit |

## Backend 완료 정의

1. OpenAPI request/response와 example이 구현을 통과한다.
2. authorization policy와 RLS에 positive/negative integration test가 있다.
3. state transition은 transaction/CAS/idempotency가 정의되어 있다.
4. secret, PDF 내용, prompt, 모델 원문 응답이 기본 로그에 없다.
5. migration/worker/provider 변경은 retry·rollback·reconciliation이 있다.
6. run은 budget reservation 이후에만 provider를 호출한다.
7. citation-required 작업은 근거 ID allowlist를 통과한다.
8. staging smoke와 observability dashboard가 준비된다.
