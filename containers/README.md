# PaperBridge container definitions

The API and worker definitions use the repository root as their build context
and are intentionally kept under `containers/` so this slice can be reviewed
without changing application, package, or CI files.

Runtime invariants:

- both images compile in a disposable stage and run the final process as the
  pre-existing `node` user;
- both Dockerfiles use the same exact
  `node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5`
  base reference in every build/runtime stage;
- both entrypoints use the Node exec form and cap the V8 heap at 512 MiB;
- the API exposes port `8787` and checks `GET /v1/health` with a bounded
  interval, timeout, startup grace period, and retry count;
- the worker healthcheck validates that PID 1 is live, non-zombie, and running
  the exact compiled worker entrypoint; it does not claim queue readiness,
  which has no current worker HTTP contract;
- no Docker build, image run, registry login/push, or SBOM generation is
  performed by this repository slice.

The release-pipeline-only SBOM generation and verification specification is in
[`SBOM.md`](SBOM.md). The runnable static checks are in
[`tests/verify-container-contract.sh`](tests/verify-container-contract.sh).
