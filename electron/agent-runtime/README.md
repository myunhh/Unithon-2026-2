# PaperBridge desktop agent runtime

This folder is a renderer-neutral Electron main-process boundary for the local
`claude`, `codex`, and `agy` CLIs. Integrate it from Electron main code by
constructing a provider with the app-owned workspace root, calling
`healthCheck()`, and translating the normalized `started`, `text-delta`,
`result`, `error`, and `done` events at a narrow IPC boundary. Command builders
(`commands.ts`) and protocol parsers are deliberately separate so CLI flag or
wire-format changes do not affect process safety.

## Agy v1.1.20 contract

The Agy provider runs the exact headless mode shape
`agy -p <prompt> --output-format stream-json`. It always adds `--mode plan`,
`--sandbox`, and `--disable-slash-commands`; it never adds
`--dangerously-skip-permissions`. Optional `--model`, `--effort low|medium|high`,
`--agent`, `--conversation`, and `--print-timeout` are passed as individual argv
elements. It parses the documented NDJSON `init`, `step_update`, and `result`
events, streams `step_update.step_type === "agent_response"` `text_delta`, and
handles `SUCCESS`, `ERROR`, `CANCELED`, `INTERRUPTED`, `INVALID`, `WAITING`, and
`RUNNING` result statuses explicitly.

## Security and operational seams

Executable discovery uses only `PATH`; this package never opens `~/.claude`,
`~/.codex`, `~/.gemini`, or any credential file. On Windows it accepts only a
direct `.exe` or `.com` binary: a discovered `.cmd`/`.bat` shim is reported as
limited rather than executed through a shell. Health checks run bounded,
no-prompt CLI probes (`--version` plus a provider-specific cached-credential
usability query), so they classify `healthy`, `limited`, or `failed` without
submitting token-consuming prompts. `ProcessRunner` passes a minimal execution,
user-profile, locale, temporary-directory, and credential-store environment
allowlist rather than inheriting application or provider secrets; it uses
`spawn` with exact argv arrays and `shell: false`, constrains cwd to an
integration-supplied workspace root, caps streams/lines/time, keeps raw stderr
out of errors, and cancels only the spawned process tree.

## Validation

```sh
npx tsc -p tsconfig.electron.json --noEmit
npx vitest run --config electron/agent-runtime/vitest.config.ts
```
