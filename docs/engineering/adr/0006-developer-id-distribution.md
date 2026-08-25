# ADR: macOS Developer ID 직접 배포 우선

- Status: Accepted
- Date: 2026-08-25

## Context

초기 CLI 연동과 release 속도에 적합하며 Mac App Store sandbox 검증을 미룰 수 있다.

## Decision

DMG+ZIP를 Developer ID로 sign/notarize해 직접 배포한다.

## Consequences

Mac App Store는 P2에서 기능 제약과 사업 요구를 다시 평가한다.

## Review trigger

비용, 사용자 규모, 보안 경계, 운영 팀 또는 플랫폼 요구가 전제를 바꿀 때 재검토한다.
