# 06. API endpoint 카탈로그

상세 schema의 권위는 `api/openapi.yaml`이다.

## Health/Capabilities

- `GET /v1/health`: build/readiness의 공개 가능한 상태
- `GET /v1/capabilities`: contract version, feature flags, limits

## Auth/Desktop session

- `GET /v1/auth/session`
- `POST /v1/auth/signup`
- `POST /v1/auth/login`
- `DELETE /v1/auth/session`
- `PUT /v1/auth/password`
- `POST /v1/desktop/authorizations`
- `POST /v1/desktop/token`
- `GET /v1/devices`
- `DELETE /v1/devices/{deviceId}`

Desktop authorization은 PKCE challenge/state/loopback redirect를 등록하고 one-time code를 교환한다.

## Workspaces

- `GET/POST /v1/workspaces`
- `GET/PATCH /v1/workspaces/{workspaceId}`
- `GET /v1/workspaces/{id}/members`
- `POST /v1/workspaces/{id}/invitations`
- `PATCH/DELETE /v1/workspaces/{id}/members/{userId}`

마지막 owner는 제거/강등할 수 없다.

## Documents

- `POST /v1/document-uploads`
- `POST /v1/document-uploads/{uploadId}/complete`
- `GET /v1/documents`
- `GET/PATCH/DELETE /v1/documents/{documentId}`
- `GET /v1/documents/{documentId}/file-access`
- `POST /v1/documents/{documentId}/parse-jobs`
- `GET /v1/documents/{documentId}/object-graph`
- `GET /v1/documents/{documentId}/pages/{pageNumber}`

Upload create는 workspace/filename/MIME/size/checksum을 받고 single-use signed target을 반환한다. Complete는 object를 검증하고 document/version/parse job을 transaction으로 생성한다.

## Annotations

- `GET/POST /v1/documents/{documentId}/annotations`
- `PATCH/DELETE /v1/annotations/{annotationId}`

Anchor schema, document version, page가 일치해야 한다. Zoom/window와 독립적인 normalized rect를 저장한다.

## Agents

- `GET/POST /v1/agents`
- `GET/PATCH/DELETE /v1/agents/{agentId}`

수정은 기존 version update가 아니라 새 immutable agent version을 만든다.

## Providers

- `GET /v1/providers`
- `GET /v1/provider-connections`
- `PUT/DELETE /v1/provider-connections/{providerId}`
- `POST /v1/provider-connections/{providerId}/test`

응답에 secret을 포함하지 않는다. Desktop provider health는 local IPC 결과와 frontend가 merge한다.

## Runs

- `POST /v1/runs` → `202` + events URL
- `GET /v1/runs/{runId}`
- `GET /v1/runs/{runId}/events` SSE
- `DELETE /v1/runs/{runId}` cancel

검증 순서: auth → resource → operation/capability → parse readiness → provider/model → active limit → budget reservation → idempotency → commit/outbox.

## Chat

- `POST /v1/threads`
- `GET /v1/threads/{threadId}/messages`
- `POST /v1/threads/{threadId}/messages`

User message와 연결된 run을 생성하고 event URL을 반환한다.

## Usage/Budget

- `GET /v1/usage/summary`
- `GET /v1/budgets`
- `PUT /v1/budgets/{budgetId}`

## 운영 endpoint

일반 public API와 별도 보안 경계로 운영한다.

- dead-letter parse retry
- orphan Storage reconciliation
- provider catalog refresh
- audit query
- account deletion status
