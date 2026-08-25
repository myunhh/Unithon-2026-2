# ADR: PDF.js 좌표 계약

- Status: Accepted
- Date: 2026-08-25

## Context

다른 좌표계 사용 시 selection/citation overlay drift가 핵심 신뢰를 훼손한다.

## Decision

Frontend renderer와 backend parser의 PDF.js compatibility를 fixture와 parser version으로 관리한다.

## Consequences

Mismatch 시 server overlay를 fail-safe로 끄고 local selection은 유지한다.

## Review trigger

비용, 사용자 규모, 보안 경계, 운영 팀 또는 플랫폼 요구가 전제를 바꿀 때 재검토한다.
