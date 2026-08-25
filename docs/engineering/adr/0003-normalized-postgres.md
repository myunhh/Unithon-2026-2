# ADR: Workspace 중심 normalized Postgres

- Status: Accepted
- Date: 2026-08-25

## Context

RBAC, 검색, 부분 갱신, 파싱 이력, usage, Lab 기능을 지원해야 한다.

## Decision

Legacy session JSON aggregate를 workspace/document/run 관계형 스키마로 전환한다.

## Consequences

JSONB는 versioned anchor/config/event payload에만 제한한다.

## Review trigger

비용, 사용자 규모, 보안 경계, 운영 팀 또는 플랫폼 요구가 전제를 바꿀 때 재검토한다.
