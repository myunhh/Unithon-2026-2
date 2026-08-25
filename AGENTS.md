# PaperBridge repository agent rules

이 파일은 원본 `Unithon-2026-2`에 설계 문서를 먼저 적용하는 과도기 규칙이다. 구현을 시작하기 전에 `docs/engineering/README.md`, OpenAPI, ERD, 해당 TODO를 읽는다.

## 공통

1. 한 번에 하나의 TODO ID만 맡고 branch/PR 제목에 ID를 넣는다.
2. 사실과 가정을 분리한다. 코드로 확인하지 못한 항목은 `OPEN` 또는 검증 필요로 남긴다.
3. frontend와 backend 사이의 권위 있는 계약은 `docs/engineering/api/openapi.yaml`과 `docs/engineering/contracts/*.schema.json`이다.
4. 계약, DB migration, 보안 경계를 임의로 바꾸지 않는다. 필요하면 먼저 ADR/contract PR을 만든다.
5. secret, 개인 정보, PDF 본문, 사용자 prompt/AI 원문을 로그·fixture·commit에 넣지 않는다.
6. 기존 테스트를 삭제하거나 assertion을 약화해 통과시키지 않는다.
7. remote push, production migration, release publish, 인증서 사용은 명시적 사용자 승인 전 실행하지 않는다.
8. 작업 전후 `git status`, branch, 실행한 명령과 결과, 미실행 항목, rollback을 기록한다.

## Frontend 경계

- 소유: `src/**`, `electron/**`, `public/**`, web/desktop build와 테스트.
- 금지: Supabase service key, 원격 provider secret, backend DB entity 직접 import, renderer의 Node/child_process 접근.
- API DTO는 generated contract를 사용하고 handwritten 복제 타입을 만들지 않는다.
- Reader/PDF 변경은 fixture, zoom/rotation/resize, normalized coordinate 회귀 테스트를 포함한다.
- Electron IPC는 narrow allowlist, sender 검증, context isolation, sandbox를 유지한다.

## Backend 경계

- 소유: `server/**` 및 분리 후 API/worker/OpenAPI/migration/RLS/provider gateway.
- route에서 직접 SQL·Storage·provider를 호출하지 않고 policy/service/repository 경계를 둔다.
- 모든 workspace resource에 authorization negative test를 둔다.
- POST는 idempotency, transaction, retry, state transition을 검토한다.
- provider raw 오류·credential·절대 경로를 공개 응답이나 로그에 노출하지 않는다.

## 완료 보고

```text
TODO ID:
Summary:
Changed files/modules:
Contract/schema impact:
Migration/feature flag:
Tests run and result:
Security/privacy review:
Known limitations:
Rollback:
```
