# 05. API 표준

## 기본

- base path `/v1`
- JSON / signed upload / SSE
- time: RFC 3339 UTC
- ID: opaque UUID
- money: integer `microusd`
- page: 1-based
- coordinate: top-left origin, 0..1

## Auth

### Web

- HttpOnly/Secure cookie
- credentialed fetch
- exact Origin와 CSRF 방어
- token을 renderer에 노출하지 않음

### Desktop

- system browser + Authorization Code + PKCE
- main process token storage
- local bridge가 bearer 주입
- renderer token 접근 금지
- device별 revoke

## URL

```text
/v1/workspaces/{workspaceId}/documents
/v1/documents/{documentId}/annotations
/v1/runs/{runId}/events
```

command는 상태 전이에만 사용한다.

```text
POST /v1/document-uploads/{id}/complete
POST /v1/documents/{id}/parse-jobs
POST /v1/provider-connections/{id}/test
```

## HTTP status

- `200` read/update
- `201` created
- `202` async accepted
- `204` delete/no body
- `400/422` validation
- `401/403/404`
- `409` conflict/idempotency
- `412` precondition
- `413` payload
- `429` rate/budget
- `503` dependency

## Problem Details

`application/problem+json`:

```json
{
  "type": "https://api.paperbridge.example/problems/budget-exceeded",
  "title": "Budget exceeded",
  "status": 429,
  "detail": "이 workspace의 월 AI 예산을 초과했습니다.",
  "code": "budget_exceeded",
  "request_id": "req_...",
  "retryable": false,
  "field_errors": []
}
```

UI는 `detail`이 아니라 stable `code`로 분기한다. provider raw error/SQL/path/secret은 공개하지 않는다.

## Stable error code

공통: `invalid_request`, `authentication_required`, `permission_denied`, `resource_not_found`, `conflict`, `precondition_failed`, `payload_too_large`, `rate_limited`, `service_unavailable`.

Document: `invalid_pdf`, `pdf_password_protected`, `pdf_corrupted`, `upload_expired`, `checksum_mismatch`, `parse_failed`, `parse_not_ready`.

AI: `provider_not_configured`, `provider_authentication_failed`, `provider_unavailable`, `provider_protocol_error`, `model_not_available`, `budget_exceeded`, `run_limit_exceeded`, `run_cancelled`, `run_timeout`, `output_limit_exceeded`, `evidence_not_found`.

## Pagination

```json
{"data":[],"page":{"next_cursor":null,"has_more":false}}
```

- default 25, max 100
- opaque cursor
- stable sort `updated_at desc, id desc`

## Concurrency

- editable resource에 ETag/version
- PATCH에 `If-Match`
- mismatch `412`
- state transition은 server CAS

## Idempotency

필수: upload create/complete, run create, invitation, billing.

- `Idempotency-Key` header
- owner+method+path+key unique
- same request hash replay
- different hash `409`
- default 24h

## Upload

1. `POST /v1/document-uploads`
2. signed Storage upload
3. `POST /v1/document-uploads/{id}/complete`

complete에서 object/size/SHA-256를 재검증한다. current multipart endpoint는 migration 중 deprecated compatibility로 유지 가능하다.

## SSE

```text
GET /v1/runs/{runId}/events
Last-Event-ID: 17
```

- run 내 monotonic sequence
- heartbeat 15~30초
- `Cache-Control: no-store`
- terminal 후 close
- Last-Event-ID 이후 replay
- unknown event 무시
- canonical events: accepted, started, delta, citation, result, warning, failed, cancelled, completed

## CORS/Cache/Limits

- exact allowlist, wildcard+credentials 금지
- private API `no-store`
- short signed file URL
- default PDF 50 MiB
- selection text 8,000 chars
- prompt 16,000 chars
- annotation 20,000 chars
- rects 128
- remote active runs/user 4

## Contract change

OpenAPI/Schema → breaking diff → examples/tests → contract package → frontend update → staging E2E. 구현과 문서 중 하나만 먼저 breaking 배포하지 않는다.
