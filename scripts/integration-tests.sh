#!/usr/bin/env bash
# Builds both contracts with cargo-near, then runs the near-workspaces sandbox tests.
# The first run downloads the NEAR sandbox binary. Requires cargo-near.
set -euo pipefail

cd "$(dirname "$0")/.."

scripts/build-contracts.sh
cargo test -p pontis-integration-tests --locked -- --test-threads="${TEST_THREADS:-2}" "$@"
