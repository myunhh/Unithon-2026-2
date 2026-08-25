# PaperBridge implementation plan

## Build in stages

1. **Document foundation** — Implement upload, storage metadata, and parsing orchestration behind `Document` and `ParseState`. Persist only durable metadata and record target-document failures separately from system errors.
2. **PDF reader** — Render pages and text layers from `PdfObjectGraph`. Keep `Page`, `TextItem`, `Line`, `Block`, `NormRect`, and `SelectionAnchor` as the only reader-to-feature contracts.
3. **Provider gateway** — Implement provider discovery and execution behind `Gateway`, `Provider`, `AgentRequest`, and streamed `AgentEvent`. Provider SDKs and credentials must remain outside renderer code.
4. **Workspace features** — Add highlights, explanations, translation, summaries, and chat as independent consumers of reader selections and the gateway; do not place their state in `App.tsx`.
5. **Desktop delivery** — Extend only the allowlisted Electron IPC contract for native capabilities, keeping provider command execution in an explicit desktop service boundary.

## Module ownership

- `src/components` and `src/routes`: reusable rendering primitives and URL state only.
- `src/pages`: route-level composition; no PDF parsing, persistence, or provider SDK calls.
- `src/domain`: shared product contracts and deterministic utilities.
- `server`: environment validation, authenticated APIs, and Supabase access.
- `electron`: secure main/preload integration with a narrow renderer bridge.

## Supabase reuse rule

Use the existing Supabase project through `SUPABASE_URL` and `SUPABASE_SECRET_KEY` only in `server/`. Do not create a second project, do not place service credentials in `VITE_*` variables, and expose only purpose-specific API responses to the web renderer.
