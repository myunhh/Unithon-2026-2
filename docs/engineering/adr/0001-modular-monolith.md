# ADR: Backend modular monolith 우선

- Status: Accepted
- Date: 2026-08-25

## Context

작은 팀에서 microservice의 network/ops/contract 비용을 피하면서 long-running worker를 독립 scale할 수 있다.

## Decision

API와 worker는 같은 backend repo/domain을 공유하고 process만 분리한다.

## Consequences

향후 queue 지연·팀 소유·장애 격리·데이터 저장소가 실제로 달라질 때 service extraction을 재평가한다.

## Review trigger

비용, 사용자 규모, 보안 경계, 운영 팀 또는 플랫폼 요구가 전제를 바꿀 때 재검토한다.
