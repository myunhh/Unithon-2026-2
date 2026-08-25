# ADR: Backend가 API 계약 원본 소유

- Status: Accepted
- Date: 2026-08-25

## Context

두 repo에서 같은 DTO를 수동 관리하면 drift가 발생한다. 세 번째 repo는 초기 운영 비용이 크다.

## Decision

OpenAPI와 JSON Schema는 backend repo가 소유하고 CI가 contract package를 publish한다.

## Consequences

Frontend는 generated package를 pin하고 breaking change는 major version으로 처리한다.

## Review trigger

비용, 사용자 규모, 보안 경계, 운영 팀 또는 플랫폼 요구가 전제를 바꿀 때 재검토한다.
