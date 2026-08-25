# 10. Backend 구현 명세

## 방향

raw `node:http` 단일 router를 TypeScript modular monolith로 재구성한다. Node LTS, strict TypeScript, schema-first 경량 HTTP framework, Supabase Postgres/Auth/Storage, durable queue, OpenAPI 3.1을 사용한다.

## 구조

```text
apps/{api,worker}
packages/{contracts,domain,db,storage,queue,pdf,providers,security,observability}
```

Module은 `routes/schemas/service/repository/policy/errors/tests`로 구성한다.

## 계층

- route: transport/auth/response
- service: policy/transaction/state
- repository: SQL/Storage
- provider adapter: external protocol
- domain은 HTTP/Supabase를 import하지 않음
- route 직접 SQL/provider 금지

## Request lifecycle

request ID → security/CORS/limits → auth → OpenAPI validation → rate/idempotency → service → response validation → log/metric.

모든 error는 domain error에서 problem+json으로 mapping한다.

## Auth/RBAC

- auth context: user/session/method/device
- read: active member
- write: member+
- member/budget 관리: admin/owner
- workspace delete: owner
- resource enumeration 방지를 위해 일부 unauthorized는 404
- request DB와 worker service-role 분리

## Transaction

한 transaction:

- upload complete + version + parse job + outbox
- agent + version
- run + budget reservation + accepted event + outbox
- terminal + usage settlement + terminal event
- invitation accept + membership

Storage/provider 네트워크 호출은 긴 transaction 밖에서 한다.

## Queue/Outbox

- transaction에 outbox 포함
- publisher claim/publish/mark
- payload는 ID/version만
- lease/heartbeat/attempt/dead-letter
- idempotent worker

## Modules

### Documents

upload session/complete, list/get/rename/delete, file access, parse retry, page/object graph, orphan reconcile.

### PDF worker

safe temp, resource limits, parser heartbeat, versioned artifact, page/block bulk projection, cleanup/failure code.

### Providers

provider-neutral adapter, encrypted connection, key rotation, model catalog, timeout/concurrency/circuit breaker, raw body log 금지.

### Runs

create/read/events/cancel/execute/finalize. One terminal state, monotonic event sequence, budget required, output limit, late event drop, citation allowlist.

### Usage

microusd, price snapshot, append-only reservation/debit/release, concurrent overspend prevention, leak reconciliation.

## Validation/Security

- runtime request/response validation
- write DTO `additionalProperties: false`
- multipart limits
- event JSON Schema
- JSONB schema validation
- exact CORS, no-store, HSTS edge
- shared production rate limiter
- secret/prompt/PDF body/path/raw provider log 금지

## Config/Deploy

- startup env schema
- active/previous secrets
- API/worker image targets
- migration one-shot
- expand/contract
- readiness/liveness
- graceful shutdown and rollback

## Test

Domain unit, real Postgres/Supabase local integration, RLS, OpenAPI conformance, fake provider, SSE race, PDF fixtures, migration/backfill rehearsal, load.

## Definition of Done

OpenAPI/examples, auth policy test, migration/RLS review, idempotency/retry, observability/redaction, unit/integration/contract, staging rollback, contract package release.
