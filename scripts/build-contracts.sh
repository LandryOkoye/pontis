#!/usr/bin/env bash
# Builds every contract under contracts/ to wasm in target/near/<crate>/<crate>.wasm.
# Usage: scripts/build-contracts.sh [non-reproducible|reproducible|slim]
#   non-reproducible (default) -> `cargo near build non-reproducible-wasm` (needs cargo-near)
#   reproducible               -> `cargo near build reproducible-wasm` (needs cargo-near and Docker)
#   slim                       -> `cargo build` + `wasm-opt -Oz` (needs binaryen; no cargo-near).
#                                 Roughly halves the wasm, which halves the NEAR locked for storage.
set -euo pipefail

cd "$(dirname "$0")/.."

mode="${1:-non-reproducible}"
case "$mode" in
  non-reproducible) build_args=(non-reproducible-wasm) ;;
  reproducible) build_args=(reproducible-wasm) ;;
  slim) ;;
  *) echo "usage: $0 [non-reproducible|reproducible|slim]" >&2; exit 2 ;;
esac

if [ "$mode" = slim ]; then
  command -v wasm-opt >/dev/null || { echo "build-contracts: slim mode needs wasm-opt (binaryen)" >&2; exit 1; }
elif ! cargo near --version >/dev/null 2>&1; then
  echo "build-contracts: cargo-near is not installed (cargo install cargo-near --locked)" >&2
  exit 1
fi

found=0
for manifest in contracts/*/Cargo.toml; do
  [ -e "$manifest" ] || continue
  # Only crates that build a contract (cdylib); skips contracts/integration-tests.
  grep -q 'cdylib' "$manifest" || continue
  found=1
  dir=$(dirname "$manifest")
  echo "build-contracts: building $dir ($mode)"
  if [ "$mode" = slim ]; then
    name=$(sed -n 's/^name = "\(.*\)"/\1/p' "$manifest" | head -1)
    out="${name//-/_}"
    cargo build -p "$name" --target wasm32-unknown-unknown --release --locked
    mkdir -p "target/near/$out"
    wasm-opt -Oz --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int \
      --enable-mutable-globals --strip-debug --strip-producers \
      "target/wasm32-unknown-unknown/release/$out.wasm" -o "target/near/$out/$out.wasm"
  else
    (cd "$dir" && cargo near build "${build_args[@]}")
  fi
done

if [ "$found" -eq 0 ]; then
  echo "build-contracts: no contracts found under contracts/; nothing to build"
fi
