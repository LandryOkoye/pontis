#!/usr/bin/env bash
# Builds the contracts and deploys them to NEAR Testnet, then seeds them.
#
#   DEPLOYER_ACCOUNT_ID=you.testnet DEPLOYER_PRIVATE_KEY=ed25519:... scripts/deploy-testnet.sh
#
# Testnet and synthetic assets only. See docs/architecture/deployments.md.
set -euo pipefail

cd "$(dirname "$0")/.."

: "${DEPLOYER_ACCOUNT_ID:?set DEPLOYER_ACCOUNT_ID (a funded testnet account)}"
if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ] && [ ! -f "$HOME/.near-credentials/${NEAR_NETWORK_ID:-testnet}/${DEPLOYER_ACCOUNT_ID}.json" ]; then
  echo "deploy-testnet: set DEPLOYER_PRIVATE_KEY or provide ~/.near-credentials/${NEAR_NETWORK_ID:-testnet}/${DEPLOYER_ACCOUNT_ID}.json" >&2
  exit 1
fi

scripts/build-contracts.sh "${1:-non-reproducible}"
pnpm --filter @pontis/scripts deploy-testnet
pnpm --filter @pontis/scripts seed
