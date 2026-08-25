#!/usr/bin/env bash
set -euo pipefail

CONTAINERS_ROOT=${1:?container root is required}
HEALTHCHECK=${2:?worker healthcheck path is required}
VERIFIER=${3:?container verifier path is required}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

expect_success() {
  local label=$1
  shift
  if "$@"; then
    printf 'PASS: worker healthcheck accepted %s\n' "$label"
  else
    fail "worker healthcheck rejected valid state: $label"
  fi
}

expect_failure() {
  local label=$1
  shift
  if "$@" >/dev/null 2>&1; then
    fail "worker healthcheck accepted invalid state: $label"
  fi
  printf 'PASS: worker healthcheck rejected %s\n' "$label"
}

copy_contract() {
  local mutant_root=$1
  cp -R "$CONTAINERS_ROOT/api" "$mutant_root/"
  cp -R "$CONTAINERS_ROOT/worker" "$mutant_root/"
  cp "$CONTAINERS_ROOT/SBOM.md" "$mutant_root/SBOM.md"
  cp "$CONTAINERS_ROOT/README.md" "$mutant_root/README.md"
}

mutate_noop() {
  sed -i.bak 's/^kill -0 "\$pid"$/true # kill -0 1/' "$1"
}

mutate_comment() {
  sed -i.bak 's/^kill -0 "\$pid"$/# kill -0 "\$pid"/' "$1"
}

mutate_missing_liveness() {
  sed -i.bak '/^kill -0 "\$pid"$/d' "$1"
}

mutate_wrong_command() {
  sed -i.bak 's/dist\/main\.js/dist\/other.js/g' "$1"
}

mutate_zombie_acceptance() {
  sed -i.bak 's/!= Z/= Z/' "$1"
}

expect_contract_failure() {
  local label=$1
  local mutation=$2
  local mutant_root
  mutant_root=$(mktemp -d "${TMPDIR:-/tmp}/paperbridge-worker-contract.XXXXXX")
  copy_contract "$mutant_root"
  "$mutation" "$mutant_root/worker/healthcheck.sh"
  if CONTAINERS_ROOT="$mutant_root" SKIP_WORKER_SEMANTIC=1 bash "$VERIFIER" >/dev/null 2>&1; then
    fail "container verifier accepted $label"
  fi
  printf 'PASS: container verifier rejected %s\n' "$label"
}

fixture_root=$(mktemp -d "${TMPDIR:-/tmp}/paperbridge-worker-health.XXXXXX")
fixture_pid=$$
fixture_proc="$fixture_root/$fixture_pid"
mkdir -p "$fixture_proc"

write_fixture() {
  local command=$1
  local state=$2
  printf 'node\000--enable-source-maps\000%s\000' "$command" > "$fixture_proc/cmdline"
  printf '%s (node) %s 0 0 0\n' "$fixture_pid" "$state" > "$fixture_proc/stat"
}

run_fixture_healthcheck() {
  sh "$HEALTHCHECK" "$fixture_root" "$fixture_pid"
}

write_fixture 'dist/main.js' S
expect_success 'a live worker running dist/main.js' run_fixture_healthcheck

write_fixture 'dist/other.js' S
expect_failure 'a live process running the wrong command' run_fixture_healthcheck

write_fixture 'dist/main.js' Z
expect_failure 'a zombie worker process' run_fixture_healthcheck

failed_pid=2147483647
while kill -0 "$failed_pid" 2>/dev/null; do
  failed_pid=$((failed_pid - 1))
done
expect_failure 'a failed or missing worker PID' sh "$HEALTHCHECK" "$fixture_root" "$failed_pid"

expect_contract_failure 'true # kill -0 1 liveness neutralization' mutate_noop
expect_contract_failure 'comment-only PID liveness' mutate_comment
expect_contract_failure 'missing PID liveness check' mutate_missing_liveness
expect_contract_failure 'wrong worker command check' mutate_wrong_command
expect_contract_failure 'zombie state acceptance' mutate_zombie_acceptance

printf 'PASS: worker healthcheck executable and adversarial checks\n'
