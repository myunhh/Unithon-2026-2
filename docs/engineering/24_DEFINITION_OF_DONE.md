# 24. Definition of Done

## 1. 공통

모든 작업은 다음을 만족한다.

- TODO ID와 acceptance criteria가 있다.
- 관련 설계/contract/ADR이 최신이다.
- loading/empty/error/success/permission 상태를 고려한다.
- secret/PII/PDF 본문이 log/fixture에 없다.
- unit 또는 적절한 상위 테스트가 있다.
- 실행한 명령과 결과를 PR에 기록한다.
- migration/rollback/compatibility 영향을 적는다.
- 미완료 부분을 완료로 표현하지 않는다.

## 2. Contract change

- OpenAPI/JSON Schema source 변경
- example과 stable error code
- generated output diff
- breaking-change check
- version bump
- frontend mock/consumer test
- migration/deprecation note

## 3. Frontend

- generated client/type 사용, handwritten server DTO 없음
- route/page/feature/entity boundary 준수
- loading/empty/error/offline/unauthorized
- keyboard/accessibility name/focus
- 320px와 desktop layout
- unit/component, relevant E2E
- web/desktop impact 검토
- analytics privacy 확인
- bundle/memory regression 확인

## 4. Reader/PDF

- PDF fixture 추가 또는 기존 golden 확인
- zoom/rotation/resize/long-document
- selection normalized rect와 text snapshot
- render task cancel/cleanup
- parser version mismatch fallback
- page-level error가 app 전체를 crash하지 않음
- citation click/anchor 복원

## 5. Backend

- route→service→repository/policy 분리
- request/response runtime validation
- authorization policy test
- idempotency/retry/state transition
- transaction/outbox boundary
- rate/size/timeout limit
- structured log/metric/trace
- raw error/secret redaction
- integration/contract test

## 6. Database migration

- ordered immutable migration
- constraint/index/RLS
- existing data/backfill 영향
- empty DB와 previous schema test
- rollback 또는 forward-fix 설명
- lock/latency 위험
- backup/restore 필요 여부
- service-role usage review

## 7. AI/Provider/Run

- provider-neutral contract
- prompt trusted/untrusted boundary
- budget reservation before call
- timeout/output/concurrency limit
- cancel/terminal race test
- usage estimate/actual flag
- citation allowlist
- error/body/credential redaction
- disconnect/reconnect behavior

## 8. Desktop

- renderer privilege 증가 없음
- narrow preload API와 IPC validation
- `shell: false`, fixed command/args
- symlink/path/external URL test
- close/cancel lifecycle
- arm64/x64 impact
- signed/notarized release gate에 필요한 config
- updater rollback/channel 영향

## 9. Security-sensitive change

추가 reviewer가 필요한 path:

- auth/session/cookie/PKCE
- RLS/authorization
- provider encryption
- Electron main/preload/IPC
- local bridge/proxy
- upload/parser
- signing/update
- billing/budget

## 10. Release

- version/build SHA/contract version
- all required CI green
- migration and rollback command checked
- signed/notarized/checksum/SBOM where applicable
- staging/smoke result
- known issues/release notes
- monitoring/alert/dashboard
- support/runbook owner
