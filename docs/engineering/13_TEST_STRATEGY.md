# 13. 테스트 전략

## 목표

저장소를 분리한 뒤에도 PDF 좌표, API 계약, 인증/RLS, AI stream, 비용 정산, Electron 권한 경계가 함께 깨지지 않도록 한다. 테스트 피라미드는 빠른 단위 테스트를 기본으로 하되, PaperBridge의 실제 위험은 **계약·브라우저 렌더링·DB 권한·stream race·macOS package**에 있으므로 해당 통합 테스트를 필수 gate로 둔다.

## 테스트 레이어

| 레이어 | Frontend | Backend | 실행 |
|---|---|---|---|
| Static | TypeScript, Oxlint, generated drift | TypeScript, lint, SQL/OpenAPI lint | 모든 PR |
| Unit | 좌표/상태/query key/UI helper | policy/state/budget/retrieval/provider parser | 모든 PR |
| Component | Reader toolbar, errors, stream panel | route schema/service with fake repo | 모든 PR |
| Contract | generated client+MSW examples | OpenAPI request/response conformance | 모든 PR |
| Integration | browser↔mock/real staging | Postgres/RLS/Storage/queue/fake provider | 모든 PR/merge |
| E2E | Web/Electron user flow | staging API dependencies | merge/nightly |
| Release | signed app install/update | migration/backup/rollback | release candidate |

## Contract 테스트

1. `openapi.yaml` lint와 operationId unique.
2. breaking change diff. Optional field/endpoint 추가는 허용하되 enum 추가 정책을 명시한다.
3. 모든 operation은 success 1개와 주요 Problem example을 가진다.
4. generated TypeScript client가 깨끗한 checkout에서 재생성 가능해야 한다.
5. 생성 결과 drift가 있으면 CI 실패한다.
6. JSON Schema fixture는 valid/invalid corpus로 양쪽에서 실행한다.
7. SSE event는 envelope/version/sequence/terminal invariant를 검사한다.

## PDF fixture corpus

| Fixture | 검증 |
|---|---|
| simple-one-column.pdf | 기본 text/selection/block order |
| two-column.pdf | 좌→우/섹션 reading order |
| rotated-pages.pdf | 90/180/270도 geometry |
| equations.pdf | 수식 glyph/bounds/object candidate |
| figures-tables.pdf | caption/reference relation |
| multi-line-selection.pdf | 여러 rect merge/sort |
| korean-english.pdf | Unicode/공백/폰트 fallback |
| scanned.pdf | textless/OCR candidate |
| password.pdf | `pdf_password_protected` |
| corrupt.pdf | `pdf_corrupted` |
| huge-300-pages.pdf | virtualization/memory/worker limit |
| boundary-size.pdf | 50 MiB 정책 경계 |

Frontend와 backend는 같은 fixture manifest와 expected normalized geometry tolerance를 사용한다. byte-level PDF 재배포에 제약이 있으면 fixture 생성 스크립트와 해시를 관리한다.

## 핵심 불변식 테스트

### 좌표

- 모든 값 finite, 0..1.
- `x + width <= 1 + epsilon`, `y + height <= 1 + epsilon`.
- page 1-based.
- rect는 reading order로 정렬되고 인접/겹침 규칙대로 병합된다.
- zoom, DPR, viewport resize 후 같은 anchor가 같은 문장에 붙는다.

### Document

- upload complete는 document/version/job/outbox를 모두 만들거나 아무것도 만들지 않는다.
- Reader file 접근과 analysis readiness는 독립이다.
- 동일 checksum/idempotency 재요청이 중복 version을 만들지 않는다.
- parse retry는 안정된 artifact 경로와 deterministic ID를 유지한다.

### Run

- terminal event는 exactly one.
- sequence는 run 내 단조 증가.
- disconnect는 cancel이 아니다.
- cancel/timeout/provider completion race에서 late event가 저장되지 않는다.
- budget reservation 없는 provider call은 0건.
- citation은 제공 context allowlist 안에만 있다.

### Security

- 다른 user/workspace의 document/provider/annotation/run은 읽거나 수정할 수 없다.
- response/log에 secret, raw cookie, refresh token, PDF path, provider raw body가 없다.
- Electron renderer에서 Node, arbitrary IPC, arbitrary URL, token을 얻을 수 없다.

## Frontend 테스트

### Unit

- `SelectionAnchor` 생성·clip·merge·serialization.
- run reducer/state machine.
- Problem code mapper.
- query key/cursor/optimistic rollback.
- desktop preload wrapper validation.

### Component

- SelectionToolbar viewport collision과 keyboard.
- parse/provider/budget unavailable state.
- SSE delta batching/citation/terminal.
- annotation orphan/conflict.
- login/upload error matrix.

### Web E2E

```text
signup/login → upload → Reader immediate entry → select → explain stream
→ citation click → highlight/note → Library exit/re-enter → position restore
```

추가 실패 흐름: invalid PDF, provider not configured, budget exceeded, stream disconnect/reconnect, parse failed.

### Electron E2E

- packaged 또는 production-like renderer launch.
- web content가 Node/shell을 접근하지 못함.
- PKCE browser handoff/loopback.
- local provider health/run/cancel.
- external navigation 차단.
- update available/download/restart를 test feed에서 검증.

## Backend 테스트

### Unit

- RBAC policy matrix.
- state transition/CAS.
- price estimation/reservation/settlement.
- provider event parser와 error mapping.
- retrieval scope/citation allowlist.
- filename/path/log redaction.

### Integration

- 실제 Postgres extension/migration과 RLS.
- Supabase local 또는 동일 정책의 Storage test.
- outbox claim/lease/dead-letter.
- upload object metadata/checksum mismatch.
- SSE replay with `Last-Event-ID`.
- concurrent run budget race.
- account deletion cascade/reconciliation.

### Provider fake server

- 정상 SSE/JSONL.
- chunk boundary에서 split JSON.
- malformed line/unknown event.
- 401/429/500/timeout.
- usage 없음/부분/최종 수정.
- cancel 이후 늦은 데이터.

## 비기능 테스트

| 항목 | 기준 제안 |
|---|---|
| PDF first page | 20 MiB 이하 p95 3초 이내(기준 환경) |
| Run stream start | provider 정상 p95 1.5초 이내 |
| API read | p95 300ms 이내, 외부 dependency 제외 |
| Reader memory | 300 page scroll 후 지속 증가 없음 |
| Concurrent run | user 4개 제한과 budget 정확성 |
| Parse | 100-page text PDF 성공률 99% 목표 |
| Accessibility | 핵심 흐름 keyboard-only, 자동 검사+수동 |

수치는 staging baseline을 측정한 뒤 ADR로 확정한다.

## CI 배치

- PR: lint/typecheck/unit/component/contract/RLS smoke/build.
- merge: real DB integration, Web E2E, image build.
- nightly: 전체 PDF corpus, Electron E2E, load/fuzz/dependency scan.
- RC: signed/notarized artifact install/update, backup restore, migration rehearsal.

## 실패 처리

flake를 retry로 숨기지 않는다. flaky test는 owner와 만료일이 있는 quarantine issue를 만들고, security/contract/RLS/release test는 quarantine할 수 없다.
