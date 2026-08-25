#!/bin/sh
set -eu

proc_root=${1:-/proc}
pid=${2:-1}

kill -0 "$pid"
test -r "$proc_root/$pid/cmdline"
tr '\000' '\n' < "$proc_root/$pid/cmdline" | grep -Fx -- 'dist/main.js' >/dev/null
test "$(cut -d' ' -f3 "$proc_root/$pid/stat")" != Z
