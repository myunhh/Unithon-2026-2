# 11. Frontend TODO

## 사용 방법

- 우선순위: **P0**는 저장소 분리와 MVP 차단 요소, **P1**은 Beta, **P2**는 연구실·확장 기능이다.
- 각 작업은 한 PR에서 검토 가능한 크기를 목표로 한다. Reader 구조 변경과 API 계약 변경은 같은 PR에 섞지 않는다.
- 세부 import용 목록은 `todo/frontend.csv`가 권위다.
- `depends_on`이 충족되지 않은 작업은 mock/feature flag로만 진행한다.

## Milestone F0 — 저장소 독립화

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| FE-001 | P0 | frontend 이력 보존 분리 | - | `src/electron/public` 이력 유지, backend source 없음 |
| FE-002 | P0 | package/tsconfig/Vite/Vitest 재작성 | FE-001 | clean clone에서 install/typecheck/test/build |
| FE-003 | P0 | 환경설정 schema와 build-time 검증 | FE-002 | 누락·잘못된 URL은 startup/build 실패 |
| FE-004 | P0 | OpenAPI client generation pipeline | C-001 | generated code 수동 수정 방지, exact contract version |
| FE-005 | P0 | MSW contract mock 서버 | FE-004 | 주요 success/error/SSE fixture 제공 |
| FE-006 | P0 | 기존 `/api` 호출 inventory와 adapter | FE-004 | 직접 fetch 0건 또는 승인된 예외만 |
| FE-007 | P0 | Electron의 backend import 제거 | BE-012 | backend clone 없이 desktop build |
| FE-008 | P0 | root `AGENTS.md`, CODEOWNERS, PR template | FE-001 | FE 소유 경계와 gate 명시 |

## Milestone F1 — App shell·인증·Workspace

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| FE-010 | P0 | route tree와 lazy boundary | FE-002 | landing/auth/library/reader/settings/account 독립 chunk |
| FE-011 | P0 | App/route/PDF error boundary | FE-010 | retry·support request ID·safe fallback |
| FE-012 | P0 | QueryClient 표준·query key factory | FE-004 | server state 중복 저장 없음 |
| FE-013 | P0 | Problem Details mapper | FE-004 | stable `code` 기반 UX, provider raw error 미노출 |
| FE-014 | P0 | session bootstrap/logout/password UI | BE-020 | loading/authenticated/anonymous 전 상태 테스트 |
| FE-015 | P0 | login/signup form validation | BE-020 | keyboard/aria/error/retry 포함 |
| FE-016 | P1 | personal workspace selector foundation | BE-030 | active workspace URL/cache 분리 |
| FE-017 | P1 | Lab member/invite UI | BE-034 | role별 action visibility와 403 처리 |
| FE-018 | P1 | device session 조회/revoke UI | BE-025 | 현재 device 구분, revoke 반영 |

## Milestone F2 — Library·업로드

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| FE-020 | P0 | Document list query/cursor pagination | BE-042 | empty/loading/error/has-more 상태 |
| FE-021 | P0 | upload session→signed upload→complete | BE-040 | progress, abort, retry, checksum |
| FE-022 | P0 | drag/drop/file picker validation | FE-021 | PDF/size/zero-byte/client hint |
| FE-023 | P0 | upload 직후 Reader 진입 | FE-021 | parse 미완료에도 원본 표시 |
| FE-024 | P0 | parse state 표시·capability gate | BE-044 | queued/extracting/ready/failed/retry |
| FE-025 | P0 | rename/delete/undo navigation | BE-043 | ETag 충돌, soft delete UX |
| FE-026 | P1 | Library search/filter/sort | BE-046 | URL state, cursor reset, debounce |
| FE-027 | P1 | orphan/expired file error recovery | BE-047 | 재업로드·지원 경로 |
| FE-028 | P2 | DOI/Zotero import UI placeholder | BE-140 | feature flag·analytics event만 |

## Milestone F3 — PDF Reader 기반

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| FE-030 | P0 | Reader 상태 머신 분리 | FE-010 | file/parse/viewport/selection/run 상태 독립 |
| FE-031 | P0 | PDF.js worker lazy load | FE-030 | initial route bundle에서 제외 |
| FE-032 | P0 | virtual page list | FE-031 | visible±1 render, 빠른 scroll 안정 |
| FE-033 | P0 | render task cancel/cleanup | FE-032 | zoom/navigation 시 stale canvas 없음 |
| FE-034 | P0 | page/zoom/rotation/fit controls | FE-032 | URL/restore policy와 keyboard |
| FE-035 | P0 | selectable TextLayer parity | FE-032 | canvas와 selection 좌표 허용 오차 충족 |
| FE-036 | P0 | Reader deep-link/last position restore | BE-043 | document/page/zoom 복원 |
| FE-037 | P1 | server page/block overlay | BE-054 | object graph version 불일치 fail-safe |
| FE-038 | P1 | figure/table/equation selectable overlay | BE-056 | object role unknown fallback |
| FE-039 | P1 | 300-page memory/perf guard | FE-032 | 지정 fixture에서 memory budget 통과 |
| FE-040 | P2 | OCR provenance overlay | BE-059 | OCR/원본 text 구분 표시 |

## Milestone F4 — Selection·Annotation

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| FE-050 | P0 | canonical `SelectionAnchor` 생성 | C-002 | 0..1 top-left, multi-rect, schema validation |
| FE-051 | P0 | rect merge/sort/clip algorithm | FE-050 | 2단·줄바꿈 fixture unit test |
| FE-052 | P0 | selection toolbar placement | FE-050 | viewport collision, keyboard, Escape |
| FE-053 | P0 | selected text/context snapshot | FE-050 | char limit·page 일치·공백 정규화 |
| FE-054 | P0 | highlight create/list/delete | BE-060 | optimistic rollback, normalized overlay |
| FE-055 | P0 | annotation click→page/anchor | FE-054 | virtualized Reader에서 정확히 이동 |
| FE-056 | P1 | note editor/autosave | BE-061 | debounce, conflict recovery, 20k limit |
| FE-057 | P1 | AI result pin annotation | FE-070 | source run/citation 연결 |
| FE-058 | P1 | version mismatch orphan UI | BE-062 | 원본 snapshot 표시·relocate 상태 |
| FE-059 | P2 | annotation filter/export | BE-063 | type/author filter와 portable export |

## Milestone F5 — AI 실행·Provider

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| FE-070 | P0 | run create client/state machine | BE-080 | accepted/running/terminal 단일 전이 |
| FE-071 | P0 | SSE parser/reconnect/replay | C-003 | `Last-Event-ID`, duplicate drop, unknown ignore |
| FE-072 | P0 | delta batching과 accessible live output | FE-071 | 렌더 폭주·스크린리더 폭주 방지 |
| FE-073 | P0 | cancel/retry UX | BE-083 | race/late terminal 안전, retry 새 run |
| FE-074 | P0 | explain-selection action | FE-050,BE-080 | 원문 위치와 streamed 답변 동시 표시 |
| FE-075 | P0 | translate-selection action | FE-050,BE-080 | 원문/번역 비교·source anchor |
| FE-076 | P0 | citation/evidence renderer | BE-085 | click 이동, missing evidence warning |
| FE-077 | P0 | provider connection status/settings | BE-070 | secret 재표시 없음, test/delete |
| FE-078 | P0 | cost estimate/budget unavailable UX | BE-086 | 실행 전 예상/잔여, hard block |
| FE-079 | P1 | agent picker/default helpers | BE-075 | operation capability filter |
| FE-080 | P1 | custom agent CRUD/version history | BE-076 | validation, clone, immutable version 표시 |
| FE-081 | P1 | summary action/result | BE-100 | parse readiness, citation 3줄/section |
| FE-082 | P1 | document Chat panel | BE-101 | thread history, citation, stop/retry |
| FE-083 | P1 | figure/table/equation actions | FE-038,BE-102 | object+caption context 표시 |
| FE-084 | P1 | usage/budget dashboard | BE-087 | period/provider/model/estimated 구분 |
| FE-085 | P2 | model compare/quality-speed-cost UI | BE-072 | capability/price freshness 표시 |

## Milestone F6 — Desktop·macOS

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| FE-100 | P0 | typed preload API와 IPC allowlist | FE-007 | generic IPC/file/shell API 없음 |
| FE-101 | P0 | loopback bridge random port/nonce | FE-100,BE-012 | 127.0.0.1 only, path/method allowlist |
| FE-102 | P0 | desktop PKCE login broker | BE-026 | system browser, one-time code, token renderer 미노출 |
| FE-103 | P0 | safeStorage token lifecycle | FE-102 | logout/revoke/rotation/error recovery |
| FE-104 | P0 | local CLI health display | FE-100 | path/credential 미노출 |
| FE-105 | P0 | local run event normalization | C-003 | Claude/Codex/Agy가 동일 UI state |
| FE-106 | P0 | process tree cancel/timeout/output cap | FE-105 | orphan process 없음 |
| FE-107 | P0 | external URL policy·window hardening | FE-100 | HTTPS allowlist와 navigation 차단 |
| FE-108 | P1 | Forge package config | FE-007 | arm64/x64 QA artifact 생성 |
| FE-109 | P1 | Developer ID sign/hardened runtime | FE-108 | `codesign --verify --deep --strict` |
| FE-110 | P1 | notarization/staple | FE-109 | Gatekeeper offline check 통과 |
| FE-111 | P1 | DMG+ZIP maker | FE-110 | clean Mac install/launch/uninstall |
| FE-112 | P1 | auto-update stable/beta channel | FE-111 | signature 검증, rollback runbook |
| FE-113 | P1 | desktop crash/update diagnostics | FE-112 | 개인정보 redaction, opt-in/notice |
| FE-114 | P2 | Universal binary 여부 재평가 | FE-111 | artifact size·CI 시간 근거 ADR |

## Milestone F7 — 품질

| ID | P | 작업 | 의존 | 완료 기준 |
|---|---:|---|---|---|
| FE-120 | P0 | unit/component test baseline | FE-002 | critical feature line/branch 목표 설정 |
| FE-121 | P0 | Web Playwright smoke | FE-023,FE-075 | login→upload→selection→run→highlight |
| FE-122 | P0 | Electron Playwright smoke | FE-101,FE-105 | launch/login bridge/local health |
| FE-123 | P0 | accessibility audit | FE-030 | keyboard, focus, contrast, aria-live |
| FE-124 | P0 | error/empty/loading visual matrix | FE-013 | 주요 route snapshot/story |
| FE-125 | P1 | locale/message-key 기반 i18n | FE-013 | ko/en fallback, raw server detail 의존 없음 |
| FE-126 | P1 | privacy-safe analytics | BE-120 | selection/PDF/prompt body 수집 없음 |
| FE-127 | P1 | bundle/performance budget CI | FE-031 | route/PDF/desktop chunk threshold |
| FE-128 | P1 | dependency/license/SBOM check | FE-002 | high severity gate·license allowlist |
| FE-129 | P1 | release smoke matrix | FE-111 | 지원 macOS/CPU/권한/업데이트 표 |

## Frontend 완료 정의

각 PR은 다음을 만족한다.

1. OpenAPI/JSON Schema 계약과 불일치가 없다.
2. loading/empty/error/permission/parse/provider/budget 상태가 정의되어 있다.
3. keyboard와 focus 이동이 가능하다.
4. unit/component와 영향 범위 E2E가 있다.
5. Desktop renderer에 token, key, file path, shell 권한이 노출되지 않는다.
6. PDF/선택 변경은 fixture와 좌표 허용 오차를 기록한다.
7. 분석 이벤트에 원문·프롬프트·AI 답변 원문을 보내지 않는다.
