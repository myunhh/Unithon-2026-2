# 09. Frontend 구현 명세

## 책임

Web SPA와 Desktop renderer를 같은 React codebase로 제공하고, Electron main/preload/local CLI를 frontend repo에서 관리한다. DB/provider remote API는 generated client만 통해 사용한다.

## 권장 구성

- React/Vite/TypeScript/PDF.js 유지
- React Router 또는 TanStack Router
- TanStack Query server state
- OpenAPI generated client + runtime validator
- MSW contract mock
- Vitest/Testing Library
- Playwright Web/Electron
- Electron Forge

서버 state를 별도 global store에 복제하지 않는다.

## 구조

```text
src/
├── app/{providers,router,error-boundary}
├── pages/{landing,auth,library,reader,settings,account}
├── features/{upload,reader,selection,annotations,agent-run,provider}
├── entities/{document,workspace,annotation,agent,run}
├── shared/{api,ui,lib,config,i18n}
└── generated/api
```

Page는 route composition, feature는 use-case UI, entity는 domain display, shared는 domain-independent다.

## API client

- browser: credentials include
- desktop: same-origin local bridge
- request ID, AbortSignal
- problem+json parse
- safe GET retry만 기본
- query keys를 resource/workspace/filter로 안정화
- mutation은 target cache만 갱신

## Reader decomposition

```text
ReaderPage
├── ReaderHeader
├── PdfViewport
│   ├── VirtualPageList
│   ├── CanvasLayer
│   ├── TextLayer
│   ├── AnnotationOverlay
│   └── SelectionOverlay
├── SelectionToolbar
├── AgentResultPanel
├── DocumentChatPanel
└── StatusBar
```

Reader file state와 analysis parse state를 분리한다.

## PDF/Selection

- PDF.js worker lazy load
- visible±1 page virtualization
- render task cancel, DPR cap, cleanup
- selection이 text layer 내부인지 검증
- single-page MVP
- page-relative normalized rect
- close/overlap rect merge
- selected text + text item range snapshot
- toolbar collision/keyboard/Escape

## Annotation

- page query/prefetch
- normalized overlay
- highlight/note/AI pin token
- list click → page/anchor
- optimistic create/delete rollback
- version mismatch orphan 표시

## AI UX

- 실행 전 agent/provider/model/estimated cost
- parse/provider/budget unavailable 해결 경로
- run create 후 SSE connect
- delta batching
- Last-Event-ID reconnect
- unknown event ignore
- cancel/retry
- citation click, evidence missing warning, pin result

## Desktop preload API

좁은 typed method만 노출한다.

- app version
- open HTTPS external
- provider health
- local run/cancel/events
- desktop login/logout

Generic IPC, file, shell, arbitrary URL proxy, absolute path, raw token은 금지한다.

## Error/A11y/I18n

- app/route/PDF page error boundary
- stable error code→localized message
- request ID support detail
- keyboard focus, `aria-live` batching, accessible names
- 320px 핵심 흐름
- message key와 Intl

## 성능

- initial route에서 PDF.js/Electron code 제외
- bundle budget
- 300-page memory regression
- stream delta batching
- canvas/blob revoke

## Definition of Done

contract types, all states, accessibility, unit/component, relevant E2E, web/desktop impact, analytics privacy, TODO acceptance를 충족한다.
