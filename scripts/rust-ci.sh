#!/usr/bin/env bash
# Runs a cargo check over the workspace, or skips cleanly when the workspace has no members yet.
# cargo itself errors on a virtual manifest with no members, which would break CI before B4 lands.
# Usage: scripts/rust-ci.sh <fmt|clippy|test>
set -euo pipefail

cd "$(dirname "$0")/.."

members=$(cargo metadata --no-deps --format-version 1 | jq '.workspace_members | length')
if [ "$members" -eq 0 ]; then
  echo "rust-ci: cargo workspace has no members yet; skipping '$1'"
  exit 0
fi

case "${1:-}" in
  fmt) cargo fmt --all --check ;;
  clippy) cargo clippy --workspace --all-targets --locked -- -D warnings ;;
  # integration tests need built wasm and a sandbox; they run in their own job
  test) cargo test --workspace --exclude pontis-integration-tests --locked ;;
  *) echo "usage: $0 <fmt|clippy|test>" >&2; exit 2 ;;
esac
