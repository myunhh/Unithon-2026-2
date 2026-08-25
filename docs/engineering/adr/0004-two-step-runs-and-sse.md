# ADR: Run 생성과 SSE 조회 분리

- Status: Accepted
- Date: 2026-08-25

## Context

같은 POST stream은 reconnect/background 복구와 event history에 취약하다.

## Decision

POST /runs가 202와 run/event URL을 반환하고 별도 GET SSE로 replay/live tail한다.

## Consequences

Event sequence와 Last-Event-ID를 계약화하고 terminal state를 하나로 제한한다.

## Review trigger

비용, 사용자 규모, 보안 경계, 운영 팀 또는 플랫폼 요구가 전제를 바꿀 때 재검토한다.
