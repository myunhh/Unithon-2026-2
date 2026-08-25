# 01. 현재 저장소 감사

## 범위

- 원본: `myunhh/Unithon-2026-2`
- 기준일: 2026-08-26
- 방식: 공개 GitHub HTML/Raw 파일과 저장소의 handoff report, 사업계획서
- 한계: container에서 실제 clone/build는 불가능해 정적 감사로 수행

## 현재 구조

```text
Unithon-2026-2/
├── src/        # React/Vite renderer
├── server/     # Node HTTP API, Supabase, OpenRouter
├── electron/   # main/preload, local CLI providers
├── public/
├── docs/
└── package.json
```

하나의 package에 web/API/Electron이 결합되어 있고, packaged Electron main이 backend `server/app.ts`를 import해 loopback server를 띄운다. 따라서 폴더만 분리하면 desktop build가 깨진다.

## 구현 확인

### Frontend

- Landing/Login/Library/Reader/Settings/Account
- PDF.js canvas + selectable TextLayer
- page/zoom/rotation, text selection, normalized coordinate
- Explain/Translate stream·cancel·retry
- 수동 highlight 저장/이동/삭제
- provider 상태 UI

### Backend

- Supabase email/password auth를 server API로 wrapping
- access/refresh HttpOnly cookie
- private PDF Storage와 upload validation
- OpenRouter key AES-256-GCM encrypted state
- OpenRouter test/run/cancel와 SSE
- body/file/run limit, Origin 검증, error redaction

### Electron

- contextIsolation/sandbox/nodeIntegration off
- IPC sender/origin 검증
- HTTPS external link 제한
- Claude Code/Codex/Agy 탐지·실행·취소
- app-owned empty read-only workspace
- normalized runtime event

## 현재 데이터 구조

공용 Supabase 상태 테이블 `opencowork_platform_state`에 session namespace별 JSON aggregate로 저장된다.

- library document array
- document highlights array
- encrypted provider state
- optimistic revision/CAS
- PDF object는 session path의 private bucket

빠른 MVP에는 유리하지만 다음에 부적합하다.

- Lab membership/RBAC
- document version/parse job/history
- page/block retrieval와 citation
- agent/version/run/usage
- chat thread/message
- 부분 갱신·검색·분석·감사

## 확인된 현재 API

```text
GET    /api/health
GET    /api/auth/session
POST   /api/auth/signup
POST   /api/auth/login
DELETE /api/auth/session
PUT    /api/auth/password
GET    /api/documents
POST   /api/documents
GET    /api/documents/{id}/file
GET    /api/documents/{id}/highlights
POST   /api/documents/{id}/highlights
DELETE /api/documents/{id}/highlights/{highlightId}
GET    /api/providers
PUT    /api/providers/openrouter
DELETE /api/providers/openrouter
POST   /api/providers/openrouter/test
POST   /api/providers/openrouter/runs
DELETE /api/providers/openrouter/runs/{runId}
```

## 보존할 강점

| 강점 | 목표 구조에서의 보존 |
|---|---|
| renderer/parser가 같은 PDF.js 좌표계 | parser/object graph version 계약 |
| 다중 `NormRect[]` selection | canonical `SelectionAnchor` |
| provider-neutral UI gateway | generated contract + adapter |
| remote/local event normalization | 단일 JSON Schema |
| renderer에 key/CLI 권한 없음 | backend/main trust boundary |
| Origin/IPC/external URL 검증 | release gate |
| upload 즉시 Reader 진입 | async parse 후에도 유지 |
| 많은 unit test | 소유 repo로 이관 + contract test |

## 우선 위험

| ID | 위험 | 심각도 | 조치 |
|---|---|---:|---|
| A-01 | Electron이 backend source import | Critical | local shell + remote API 분리 |
| A-02 | JSON aggregate 저장 | Critical | normalized schema, dual-write migration |
| A-03 | 900+ line raw server router | High | module router/service/repository |
| A-04 | Reader page가 너무 많은 책임 | High | feature/state machine 분리 |
| A-05 | client 전체 PDF parse | High | server object graph + lazy page |
| A-06 | POST와 SSE가 한 연결 | Medium | run create와 events endpoint 분리 |
| A-07 | local/remote error 계약 차이 | Medium | canonical code/event |
| A-08 | OpenAPI 없음 | Critical | contract-first CI |
| A-09 | signed desktop release lane 없음 | High | Forge signing/notarization |
| A-10 | 실제 Supabase/OpenRouter/CLI smoke 미실행 | High | staging/manual release smoke |
| A-11 | renderer chunk 경고 | Medium | route/PDF.js code split |

## 결론

전면 재작성보다 다음 세 축을 먼저 해결하는 것이 최적이다.

1. 정규화 DB와 비동기 문서 파이프라인
2. OpenAPI/JSON Schema 기반 repo 간 계약
3. backend를 import하지 않는 독립 Electron shell
