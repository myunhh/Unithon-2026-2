#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CONTAINERS_ROOT=${CONTAINERS_ROOT:-$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)}
EXPECTED_BASE='node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5'

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

require_file() {
  local path=$1
  [[ -f "$path" ]] || fail "missing file: $path"
}

require_line() {
  local pattern=$1
  local path=$2
  local description=$3
  grep -Eq -- "$pattern" "$path" || fail "$description ($path)"
}

require_exact_line() {
  local expected=$1
  local path=$2
  local description=$3
  grep -Fxq -- "$expected" "$path" || fail "$description ($path)"
}

runtime_section() {
  local path=$1
  awk '/^FROM [^ ]+ AS runtime$/ { in_runtime=1 } in_runtime { print }' "$path"
}

assert_runtime_contract() {
  local path=$1
  local service=$2
  local runtime

  runtime=$(runtime_section "$path")
  [[ -n "$runtime" ]] || fail "$service has no runtime stage"
  grep -Eq '^USER node$' <<<"$runtime" || fail "$service runtime is not non-root"
  grep -Eq '^WORKDIR /app$' <<<"$runtime" || fail "$service runtime workdir is not /app"
  grep -Eq '^ENTRYPOINT \["node", "--enable-source-maps", "--max-old-space-size=[0-9]+"\]$' <<<"$runtime" || fail "$service entrypoint is not bounded and exec-form"
  grep -Eq '^CMD \["dist/main\.js"\]$' <<<"$runtime" || fail "$service command does not name its compiled entrypoint"
  ! grep -Eq '^(ENTRYPOINT|CMD) [^[]' <<<"$runtime" || fail "$service uses shell-form runtime command"
}

assert_base_contract() {
  local path=$1
  local refs
  local reference

  refs=$(awk '$1 == "FROM" { print $2 }' "$path")
  [[ -n "$refs" ]] || fail "no base references in $path"
  while IFS= read -r reference; do
    [[ "$reference" == "$EXPECTED_BASE" ]] || fail "unpinned or inconsistent base reference in $path"
  done <<<"$refs"
}

api_dockerfile="$CONTAINERS_ROOT/api/Dockerfile"
worker_dockerfile="$CONTAINERS_ROOT/worker/Dockerfile"
worker_healthcheck="$CONTAINERS_ROOT/worker/healthcheck.sh"
sbom_spec="$CONTAINERS_ROOT/SBOM.md"
readme="$CONTAINERS_ROOT/README.md"

require_file "$api_dockerfile"
require_file "$worker_dockerfile"
require_file "$sbom_spec"
require_file "$readme"

for dockerfile in "$api_dockerfile" "$worker_dockerfile"; do
  require_line '^FROM [^ ]+ AS build$' "$dockerfile" 'missing disposable build stage'
  require_line '^FROM [^ ]+ AS runtime$' "$dockerfile" 'missing runtime stage'
  require_line '^COPY package\.json package-lock\.json \./$' "$dockerfile" 'dependency lockfile is not copied from context'
  require_line '^COPY apps \./apps$' "$dockerfile" 'application source is not copied from context'
  require_line '^COPY packages \./packages$' "$dockerfile" 'package source is not copied from context'
  require_line '^RUN npm ci --ignore-scripts$' "$dockerfile" 'dependency install is not script-disabled'
  assert_base_contract "$dockerfile"
  assert_runtime_contract "$dockerfile" "$(basename "$(dirname "$dockerfile")")"

  if grep -Eq '^USER[[:space:]]+root([[:space:]]|$)' "$dockerfile"; then
    fail "forbidden root runtime directive in $dockerfile"
  fi
done

require_line '^EXPOSE 8787$' "$api_dockerfile" 'API port contract is missing'
require_line '^HEALTHCHECK .*CMD \["node".*127\.0\.0\.1:8787/v1/health.*\]$' "$api_dockerfile" 'API healthcheck does not target /v1/health'
require_line '^HEALTHCHECK .*CMD \["sh", "/usr/local/bin/paperbridge-worker-healthcheck"\]$' "$worker_dockerfile" 'worker healthcheck command is missing'
require_file "$worker_healthcheck"
require_file "$SCRIPT_DIR/verify-worker-healthcheck.sh"
require_exact_line 'set -eu' "$worker_healthcheck" 'worker healthcheck must enable strict shell behavior'
require_exact_line 'proc_root=${1:-/proc}' "$worker_healthcheck" 'worker healthcheck must default to the container proc filesystem'
require_exact_line 'pid=${2:-1}' "$worker_healthcheck" 'worker healthcheck must default to PID 1'
require_exact_line 'kill -0 "$pid"' "$worker_healthcheck" 'worker healthcheck does not test PID liveness'
require_exact_line 'test -r "$proc_root/$pid/cmdline"' "$worker_healthcheck" 'worker healthcheck does not require process metadata'
require_exact_line "tr '\\000' '\\n' < \"\$proc_root/\$pid/cmdline\" | grep -Fx -- 'dist/main.js' >/dev/null" "$worker_healthcheck" 'worker healthcheck does not identify the compiled entrypoint'
require_exact_line 'test "$(cut -d'\'' '\'' -f3 "$proc_root/$pid/stat")" != Z' "$worker_healthcheck" 'worker healthcheck does not reject zombie state'
if grep -Eq '^[[:space:]]*(true|:)([[:space:]]|$)' "$worker_healthcheck"; then
  fail "worker healthcheck contains a no-op command"
fi
require_line '^STOPSIGNAL SIGTERM$' "$api_dockerfile" 'API graceful-stop signal is missing'
require_line '^STOPSIGNAL SIGTERM$' "$worker_dockerfile" 'worker graceful-stop signal is missing'

require_line '^syft "\$IMAGE_REF" .*cyclonedx-json=' "$sbom_spec" 'SBOM generation command is missing'
require_line '^test -s "\$SBOM_FILE"$' "$sbom_spec" 'SBOM non-empty verification is missing'
require_line '^jq -e .*bomFormat.*CycloneDX' "$sbom_spec" 'SBOM format verification is missing'
require_line '^grype "sbom:\$SBOM_FILE" .*--fail-on high' "$sbom_spec" 'SBOM vulnerability verification is missing'

for definition in "$api_dockerfile" "$worker_dockerfile" "$worker_healthcheck" "$sbom_spec" "$readme"; do
  if grep -Ein -- 'AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|-----BEGIN[^-]*PRIVATE KEY-----|(^|[[:space:]])USER[[:space:]]+root([[:space:]]|$)|(^|[^[:alnum:]_])(/Users|/home|/root)([^[:alnum:]_]|$)' "$definition"; then
    fail "forbidden secret, private-key, user-path, or root marker in $definition"
  fi
done

if [[ "${SKIP_WORKER_SEMANTIC:-0}" != 1 ]]; then
  "$SCRIPT_DIR/verify-worker-healthcheck.sh" "$CONTAINERS_ROOT" "$worker_healthcheck" "$SCRIPT_DIR/verify-container-contract.sh"
fi

printf 'PASS: API/worker container contract and SBOM command checks\n'
