# ADR: Desktop local bridge와 PKCE

- Status: Accepted
- Date: 2026-08-25

## Context

Backend source 번들을 제거하면서 renderer token 노출과 arbitrary native 권한을 막는다.

## Decision

Packaged renderer는 local loopback bridge를 통해 remote API를 호출하고 token은 main process가 보유한다.

## Consequences

Bridge는 exact path proxy만 제공하고 system browser PKCE를 사용한다.

## Review trigger

비용, 사용자 규모, 보안 경계, 운영 팀 또는 플랫폼 요구가 전제를 바꿀 때 재검토한다.
