# 23. 개발·배포 Roadmap

## 1. 사업계획서 일정과 기술 milestone 매핑

사업계획서에는 2026-08-25~09-17 MVP, 09-18~10-17 내부 검증, 10-18~11-17 Closed Beta, 11-18~12-17 2차 개발, 12-18~2027-01-17 QA, 2027-01-18~02-17 Open Beta, 02-18~04-10 정식 출시 계획이 제시되어 있다. 아래는 해당 일정에 저장소 분리·계약·Desktop 배포 작업을 반영한 기술 계획이다.

## 2. Milestones

### R0 — Architecture baseline (즉시)

- 현재 repo audit와 tag
- docs/OpenAPI/ERD/TODO 승인
- FE/BE repo 생성
- contract workflow/branch protection
- P0 범위 고정

Exit: 두 agent가 독립적으로 첫 PR을 시작할 수 있음

### R1 — MVP Foundation

- FE: Reader/Library 구조 분리, generated client
- BE: modular skeleton, auth/personal workspace, normalized document/annotation
- upload immediate Reader
- selection explain/translate remote/local
- legacy compatibility

Exit:

- upload→select→stream→highlight E2E
- current unit tests 이관
- no backend import in desktop target branch

### R2 — Internal Validation

- real Supabase test account/storage smoke
- actual OpenRouter opt-in smoke
- installed Claude/Codex/Agy smoke
- PDF fixture 확대
- usage/cost estimate와 diagnostics
- 320px/desktop accessibility

Exit: 팀 내부 주간 사용, blocker bug triage

### R3 — Closed Beta

- signed/notarized arm64/x64 beta DMG
- device login/revoke
- auto-update beta channel
- parse worker/page/block/citation
- summary/document chat beta
- privacy/feedback instrumentation

Exit: 20~30명 배포, crash-free/first-page/run metrics 확보

### R4 — Feature Expansion

- figure/table/equation explanation
- user-defined agent/version
- provider/model catalog
- budget hard stop
- memo/AI pin/library search
- optional pgvector experiment

Exit: 핵심 기능 quality/cost 검증

### R5 — QA/Open Beta

- RLS/security/migration audit
- payment/entitlement skeleton
- backup/restore/runbook
- stable update pipeline rehearsal
- legacy read cutover
- support diagnostic export

Exit: 일반 사용자 공개 가능, rollback validated

### R6 — Stable Launch

- stable signed/notarized release
- Student/Desktop/Cloud entitlement 반영
- production SLO/alert/on-call
- API/desktop minimum version policy
- release notes/privacy/terms

Exit: 유료 전환과 운영 가능

### R7 — Lab/B2B

- Lab workspace/invitation/role
- shared library/agent
- seat/organization usage/budget
- audit/admin dashboard
- DOI/Zotero/import integration 검토

## 3. 우선순위 원칙

1. Reader 흐름과 신뢰성
2. 권한/secret/cost 안전성
3. 계약과 두 repo 독립성
4. 실제 beta 검증
5. 기능 확장
6. 미세 최적화/새 framework 전환

## 4. Release gate KPI

| Gate | 최소 지표 |
|---|---|
| Internal | core E2E green, no secret log |
| Closed Beta | upload 99%, first page p95 목표, signed launch smoke |
| Open Beta | budget overspend 0, RLS matrix green, restore test |
| Stable | SLO dashboard/alert/rollback, update success, privacy docs |

## 5. Scope control

Stable 전 제외 권장:

- Tauri 전환
- full plugin marketplace
- real-time collaborative editor
- broad web browsing agent
- multi-cloud DB abstraction
- premature microservice split
- Mac App Store 전용 sandbox 재설계
