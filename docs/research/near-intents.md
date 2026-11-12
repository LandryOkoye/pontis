# NEAR Intents integration research

- **Checked:** 2026-11-12
- **Surface:** official 1Click Swap API

## Verified

- The official 1Click API is a production REST surface at `https://1click.chaindefuser.com/v0`.
  Its documented calls include `GET /tokens`, `POST /quote`, optional `POST /deposit/submit`,
  and `GET /status?depositAddress=...`. `dry: true` requests a quote without a deposit address or
  starting a swap. [Quickstart](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart)
- `/tokens` is the current source of truth for supported `assetId` values. The API documents
  dynamic chain/token coverage; the presence of a chain does not guarantee every asset or route is
  enabled. [Supported assets endpoint](https://docs.near-intents.org/api-reference/oneclick/get-supported-tokens),
  [chain support](https://docs.near-intents.org/resources/chain-support)
- A partner JWT comes from the Partner Dashboard and may be sent as `X-API-Key` or
  `Authorization: Bearer`. Unauthenticated non-`ANY_INPUT` quotes incur an additional 25 bps. No
  numeric rate quota was found in the public docs; this is undocumented, not unlimited.
  [Authentication](https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication)
- 1Click docs state there is no testnet version. Thus there is no compatible external testnet
  integration for Pontis's synthetic test assets. Pontis uses an offline simulator and does not
  send swap requests or deposits to the production service.
  [1Click quickstart](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart)
- The 1Click terms permit changing API/rate limits and require developer registration/KYB, end-user
  compliance checks, disclosures and flow-down terms. A future production integration needs a
  product/legal review and accepted access terms before it is enabled.
  [API terms](https://docs.near-intents.org/security-compliance/terms-of-service)

## API contract observed

Quote request shape is documented with `dry`, `swapType`, `slippageTolerance`, `originAsset`,
`depositType`, `destinationAsset`, `amount`, `recipient`, `recipientType`, `refundTo`, `refundType`,
`deadline`, and optional `confidentiality`. `GET /status` requires the quote's `depositAddress` and
may require `depositMemo`. We do not persist or use real API prices for Pontis market pricing; the
terms restrict API-data storage and use in pricing algorithms.

## Unknowns

- A partner-only staging/testnet endpoint, API key quota, and SLA were not found in public docs.
- Public documentation does not show a route-registration process for arbitrary third-party
  synthetic tokens. Pontis assets are not assumed Intents-supported.
- Route-specific confidential support remains determined by live quote validation and is not used
  in the synthetic offline demo.
