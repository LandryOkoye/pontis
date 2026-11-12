# Phase 8 research: NEAR Intents and Confidential Intents

**Research checked:** 2026-11-12 (UTC). Sources below are first-party NEAR/NEAR Intents documentation or official NEAR announcements. Dynamic asset support can change; query the API at integration/runtime rather than treating a static list as authoritative.

## Verified

### NEAR Intents integration surface

- The documented distribution API is the **1Click Swap REST API**, production base `https://1click.chaindefuser.com/v0`. Its documented lifecycle is `GET /tokens`, `POST /quote`, optional `POST /deposit/submit`, and `GET /status?depositAddress=...`. API references/specs are linked from the official [documentation index](https://docs.near-intents.org/llms.txt), which lists the [OpenAPI spec](https://1click.chaindefuser.com/docs/v0/openapi.yaml). The [1Click overview](https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api) says it automates routing/settlement via market makers and that assets go to quote-specific deposit addresses; it says 1Click does not custody them.
- Supported tokens are dynamic: the API's `/v0/tokens` response gives asset IDs; docs direct integrators to fetch it. Supported chain names/address/signing coverage is documented in the living [chain support page](https://docs.near-intents.org/resources/chain-support). That page explicitly says supported chains keep expanding and cautions that Zcash is only partially supported (transparent addresses only); Cardano is listed as partially supported. Exact path and asset eligibility should be taken from current API responses, not inferred from chain presence.
- Official API-key docs say partners can obtain a JWT from the [Partner Dashboard](https://partners.near-intents.org/). Send it as `X-API-Key` or `Authorization: Bearer`. The docs state unauthenticated non-`ANY_INPUT` quotes incur an extra 25 bps platform fee; authenticated traffic gets the partner fee schedule. This authenticates the integration, not an end user’s private data. Confidential account reads require a separate User-Session token obtained by user-signed data; token refresh is documented. See [API Keys](https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication).
- **Rate limits:** no numeric rate limit/quota or published throttling policy was found in the official docs/API references reviewed. Treat this as undocumented, not unlimited; confirm partner quota with NEAR.
- No dedicated testnet endpoint or testnet status is described in the 1Click integration docs/spec index reviewed. **Unknown:** whether there is a partner-only/staging environment; obtain confirmation before assuming production endpoints are safely testable.

### Confidential Intents

- Current official docs support confidential swaps through 1Click’s quote flow by setting `confidentiality` to `basic` or `advanced`. For foreign-chain to foreign-chain swaps, the rest of the quote/deposit/settle flow is the standard flow. For an embedded Confidential Intents balance, docs require the relevant `CONFIDENTIAL_INTENTS` deposit/recipient/refund types and signed-intent execution. See [Confidential Swaps](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/confidential-swaps) and [Making a Request](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request).
- The official [July 7, 2026 GA announcement](https://near.org/blog/announcing-general-availability-of-confidential-intents) says Confidential Intents is publicly available to all developers through the existing 1Click Swap API. The integration documentation has live parameter shapes and production endpoint references. This is **not described as testnet-only or beta**. No public testnet-specific endpoint/status was found.
- Official architecture description: a NEAR private shard connected to NEAR mainnet by a bridge, operated by independent **permissioned** validators. The official [architecture explainer](https://www.near.org/blog/how-confidential-intents-works) states there is no public RPC/API/block explorer for the private shard; validator consensus is PBFT with ~200 ms finality; private-shard tokens are burned on withdrawal. It says private balances/history are encrypted with the wallet key and public chain transaction details are hidden, while the boundary uses ingress screening. The article describes the model as trust-minimized rather than fully trustless (validator/bridge trust is therefore a material assumption).
- The May explainer says selective disclosure was planned; the July GA announcement and current marketing/docs describe confidential execution but do not establish an externally available key-sharing/disclosure API. **Unknown:** shipped selective-disclosure product/API and its operational details. Do not promise it based only on planned/marketing language.
- **Asset/chain limitations:** the public supported-token endpoint is the source of truth for swap assets. Official docs show foreign-to-foreign confidentiality as an API option but do not provide a complete separate confidentiality-specific asset/route matrix in the pages reviewed. Do not assume every listed chain/token or route supports confidential execution; quote validation/current API responses determine eligibility. Confidential account balance/history APIs exist, but the docs index says transaction history is invite-only at present.

## Unknown or needing confirmation

1. Numeric partner rate limits, burst quotas, and production SLA.
2. Availability/credentials for a staging or testnet 1Click environment.
3. A definitive confidential-route allowlist independent of live quote validation; use `/v0/tokens` and quote responses and confirm edge cases with NEAR.
4. Whether selective disclosure is shipped to partners, and any supported interface/policy.

## Primary sources

- [NEAR Intents documentation index and OpenAPI links](https://docs.near-intents.org/llms.txt)
- [1Click Swap API overview](https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api)
- [API Keys and user-session authentication](https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication)
- [Making a Request](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request)
- [Confidential Swaps](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/confidential-swaps)
- [Supported Chains](https://docs.near-intents.org/resources/chain-support)
- [Confidential Intents GA announcement, July 7 2026](https://near.org/blog/announcing-general-availability-of-confidential-intents)
- [Confidential Intents architecture explainer, May 27 2026](https://www.near.org/blog/how-confidential-intents-works)
