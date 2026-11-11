# Pontis EVM bridge contracts

This directory contains the local-Anvil, **synthetic-test-only** EVM side of Phase 6. It does not
represent a real-world asset, custody arrangement, production bridge or deployed testnet route.

`PermissionedBridgeToken` is a deliberately compact ERC-20 representation with these controls:

- only the configured bridge can mint;
- an issuer-managed allowlist restricts both transfer parties and bridge mint recipients;
- issuer and protocol pauses are independent, and either stops transfers and bridge flows;
- the issuer-controlled cap bounds EVM supply;
- `bridgeOut(recipientNear, amount)` burns the caller's EVM representation and emits a monotonic
  nonce that a future relayer/NEAR attestation path must bind to its chain ID and token address.

Run its local tests with:

```bash
cd contracts-evm
forge test
```

The token deliberately has no relayer, signing authority, route configuration, refund process or
real testnet deployment yet. Those are separate Phase 6 slices after issuer/attester and NEAR
bridge-state-machine interfaces are available. The planned external-integration research is in
[`docs/research/phase6-near-evm-bridge.md`](../docs/research/phase6-near-evm-bridge.md).
