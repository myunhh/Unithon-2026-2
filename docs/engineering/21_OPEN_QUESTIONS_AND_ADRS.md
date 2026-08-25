# 21. Open Questions·ADR 목록

## 즉시 결정해야 하는 항목

| ID | 질문 | 기본 제안 | 차단 범위 | Owner |
|---|---|---|---|---|
| OQ-001 | 새 repo 공개/비공개 | 초기 private | repo 생성 | 대표/팀 |
| OQ-002 | canonical default branch | `main`으로 통일 | CI/스크립트 | Dev lead |
| OQ-003 | package manager/Node version | 현재 lockfile 기반 + Node LTS 고정 | bootstrap | FE/BE |
| OQ-004 | API domain/cookie topology | app/api subdomain + exact CORS | auth | Backend |
| OQ-005 | Supabase project 분리 | staging/prod 완전 분리 | deploy | Backend |
| OQ-006 | queue 구현 | managed durable queue 우선 | parse/run | Backend |
| OQ-007 | contract package registry | GitHub Packages 또는 release artifact | 병렬 개발 | Dev lead |
| OQ-008 | Desktop bundle ID/domain | 소유 domain 확정 후 고정 | signing | Product |
| OQ-009 | Apple Developer 계정 owner | 조직 계정/권한·2FA 담당 | notarization | 대표 |
| OQ-010 | 무료/유료 entitlement | 서버 capability 표로 확정 | UI/Budget | Product |
| OQ-011 | BYOK 개인/공용 우선순위 | 개인 key→Lab key→platform | provider | Product/Sec |
| OQ-012 | local run cloud sync | 기본 metadata+사용자 opt-in result | Desktop/privacy | Product |

## Beta 전 결정

| ID | 질문 | 기본 제안 |
|---|---|---|
| OQ-020 | PDF 최대 크기/페이지 | 50 MiB, page limit은 corpus 측정 후 |
| OQ-021 | soft delete/retention | 30일 |
| OQ-022 | run delta/result retention | delta 30일 이하, pinned result 장기 |
| OQ-023 | OCR plan | explicit opt-in/P1 |
| OQ-024 | pgvector 시점 | FTS baseline 측정 후 P1 |
| OQ-025 | supported macOS | Electron 44/CI/사용자 조사로 확정 |
| OQ-026 | arm64/x64 vs Universal | 별도 artifact 우선 |
| OQ-027 | update host | GitHub Releases/전용 storage 비교 |
| OQ-028 | crash reporting vendor | privacy·한국 데이터 정책 검토 |
| OQ-029 | 결제 provider | 정식 출시 전 webhook/세금/환불 검토 |
| OQ-030 | 학생 연구 데이터 동의 | 명시 동의·익명화·별도 retention |

## ADR 상태

| ADR | 결정 | 상태 |
|---|---|---|
| 0001 | frontend/backend 두 repo | Accepted proposed |
| 0002 | backend-owned versioned contract | Accepted proposed |
| 0003 | backend modular monolith + workers | Accepted proposed |
| 0004 | normalized top-left coordinates + multi-rect | Accepted proposed |
| 0005 | Electron local bridge, backend source import 금지 | Accepted proposed |
| 0006 | normalized Postgres + RLS, legacy migration | Accepted proposed |
| 0007 | durable event log + SSE replay | Accepted proposed |
| 0008 | Electron 유지, Tauri 재평가 P2 | Accepted proposed |

실제 팀 승인일과 decision owner를 각 `adr/*.md`에 기록한다.

## 검증이 필요한 가정

- 현재 code report에 적힌 test 통과 상태가 최신 checkout에서도 재현된다.
- 현재 Supabase aggregate schema와 production data가 문서 감사와 동일하다.
- Electron local CLI adapter가 지원하는 executable/version/출력 형식이 실제 사용자 환경에서 안정적이다.
- PDF.js frontend와 backend parser 버전을 독립 repo에서도 동일 compatibility policy로 유지할 수 있다.
- OpenRouter 외 provider를 remote backend에 즉시 추가할 필요가 없다.
- macOS beta 사용자의 Intel 비율이 별도 x64 artifact 운영 비용을 정당화한다.

가정은 Codex가 사실처럼 확장하지 않으며, 실측/코드/팀 결정으로 확인한 뒤 ADR 또는 문서 상태를 갱신한다.
