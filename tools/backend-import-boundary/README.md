# Backend import boundary verifier

This standalone Node CLI checks every source module under the backend roots for imports into
Electron, renderer, or packaged-desktop surfaces, and checks Electron sources for imports back into
backend roots. It also checks `tsconfig.electron.build.json` and an existing `dist-electron`
artifact for backend source/output. TypeScript's AST parser handles static imports, exports,
`export type`, `import x = require(...)`, dynamic imports, and `require` without matching
import-like text inside strings. Namespace-qualified `import x = Namespace.value` references do
not name an external module and are intentionally not treated as module edges.

It is intentionally separate from CI; BE-010 owns CI wiring and its accepted branch is not changed
by BE-012.

Run it from the repository root:

```sh
node tools/backend-import-boundary/verify.mjs
```

An optional positional argument selects a repository or synthetic fixture root:

```sh
node tools/backend-import-boundary/verify.mjs tools/backend-import-boundary/fixtures/forbidden
```

Require a built Electron artifact for the check:

```sh
node tools/backend-import-boundary/verify.mjs --require-artifact
```

Exit status `0` means no forbidden edge was found. Exit status `1` means a boundary violation was
found; exit status `2` means the supplied root is not a directory. The default backend scan roots
are `apps/api`, `apps/worker`, `packages`, and `server`; the desktop source root is `electron`.
The forbidden top-level roots are `electron`, `src`, `dist-electron`, and `desktop`, plus the
Electron and desktop/renderer package aliases. Without `--require-artifact`, a missing
`dist-electron` directory is reported as `NOT BUILT` but does not fail the source/config check.

Packaged Electron startup currently fails explicitly until the FE-007 remote API loopback bridge is
implemented. Development mode remains available through `VITE_DEV_SERVER_URL`; no local backend is
bundled or hosted by Electron.

The synthetic tests and the current BE-004 tree can be run without credentials or external
services:

```sh
node --test tools/backend-import-boundary/verify.test.mjs
```
