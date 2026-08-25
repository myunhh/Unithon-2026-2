# PaperBridge provider runtime

This folder is intentionally isolated from HTTP routes and environment loading. It
provides the server-only core for a session-scoped OpenRouter credential and a
normalized agent-stream event vocabulary.

## Integration seams

1. In `server/env.ts`, parse `PAPERBRIDGE_PROVIDER_MASTER_KEY` once and inject it
   into `new ProviderCredentialCipher(...)`. Its only accepted string form is
   `base64url:<43 unpadded base64url characters>` for exactly 32 random bytes.
   Generate it with `base64url:` plus `randomBytes(32).toString('base64url')`; do
   not use a passphrase, an OpenRouter key, or a client-exposed Vite variable.
2. Implement `OptimisticStateGateway` against a server-side store. `read` returns
   `{ revision, value }`, and `compareAndSet` must atomically create/update only
   when its expected revision matches (or return `null` on contention). The
   repository uses `paperbridge:providers:<sessionId>` and retries at most three
   times by default.
3. A future authenticated route can call `adapter.testKey(...)` to test a submitted
   key. This is a one-token, non-streaming request bounded to 15 seconds and it
   never persists anything. Only an explicit subsequent `saveOpenRouter(...)`
   stores the encrypted envelope and selected model id.
4. For a run, call `repository.withOpenRouterCredential(sessionId, credential =>
   credential.useApiKey(apiKey => adapter.stream({ apiKey, modelId:
   credential.modelId, messages })))`. Forward the returned `started`,
   `text-delta`, `result`, `error`, and `done` events as SSE without inventing
   another provider event format.

## Security boundary

`ProviderCredentialCipher` encrypts each key with AES-256-GCM, a random 96-bit IV,
and session id as authenticated additional data. Moving an envelope to another
session or changing any envelope field makes decryption fail. Stored state admits
only the versioned encrypted envelope and model id; public repository results and
`OpenRouterCredential.toJSON()` deliberately omit the key.

The server process necessarily sees a key briefly while it encrypts, decrypts, or
places it in the outbound `Authorization` header. Browser code, state JSON, runtime
metadata, errors, logs, and provider response error bodies must never receive it.
The injected fetch adapter performs no live network I/O by itself, making route-level
logging policy explicit and tests deterministic.

## Verification

```sh
npx vitest run server/providers/crypto.test.ts server/providers/repository.test.ts server/providers/openrouter.test.ts
npx tsc -p tsconfig.server.json --noEmit
```
