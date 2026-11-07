#!/usr/bin/env bash
# Builds every contract under contracts/ to wasm with cargo-near.
# Requires: cargo-near (https://github.com/near/cargo-near), wasm32-unknown-unknown target.
# Usage: scripts/build-contracts.sh [reproducible]
#   default      -> `cargo near build non-reproducible-wasm` (fast, local/dev and CI)
#   reproducible -> `cargo near build reproducible-wasm` (Docker; use for testnet deploys)
set -euo pipefail

cd "$(dirname "$0")/.."

mode="${1:-non-reproducible}"
case "$mode" in
  non-reproducible) build_args=(non-reproducible-wasm) ;;
  reproducible) build_args=(reproducible-wasm) ;;
  *) echo "usage: $0 [reproducible]" >&2; exit 2 ;;
esac

if ! cargo near --version >/dev/null 2>&1; then
  echo "build-contracts: cargo-near is not installed (cargo install cargo-near --locked)" >&2
  exit 1
fi

found=0
for manifest in contracts/*/Cargo.toml; do
  [ -e "$manifest" ] || continue
  found=1
  dir=$(dirname "$manifest")
  echo "build-contracts: building $dir ($mode)"
  (cd "$dir" && cargo near build "${build_args[@]}")
done

if [ "$found" -eq 0 ]; then
  echo "build-contracts: no contracts found under contracts/; nothing to build"
fi
