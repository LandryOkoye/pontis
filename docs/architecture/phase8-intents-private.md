# Phase 8: Intents and private execution

Pontis uses a deterministic local Intents simulator by default. The production 1Click adapter
matches the documented `/tokens`, `/quote`, and `/status` surface and can request a non-dry quote
that creates a deposit route; it never submits a deposit. Constructing it requires an API key and
an explicit `allowMainnetCalls: true`, because the reviewed docs describe no testnet endpoint.
Supported assets are fetched dynamically. Pontis must not treat returned prices as market-pricing
inputs or route restricted Pontis assets without destination eligibility guarantees.

The API exposes `/v1/intents/tokens`, `/v1/intents/quote`, `/v1/intents/swaps`, and
`/v1/intents/status`. Status accepts an optional `depositMemo`. The API uses the simulator unless
an operator explicitly injects a production client in the app dependencies. A non-dry `/swaps`
response creates a deposit route only; users must not treat that response as confirmation of funds
transfer or settlement.

The local private RFQ matcher produces encrypted disclosures, a verifiable SHA-256 commitment,
and settlement instructions. It is an operator-trusted simulator; it does not settle through the
core contract or write commitments on-chain. Its API returns a recipient-encrypted disclosure
plus commitment; the participant/auditor decrypts locally and verifies the hash. The default API
matcher only accepts `sim:` assets at a fixed simulated oracle price. Confidential Intents can be
enabled by NEAR through 1Click but has no documented testnet and access may be gated; Pontis does
not make live confidential requests in this phase.

The matcher secret key stays process-local and is never returned by the API. Its in-memory state
is lost on restart, and the public API exposes only ciphertexts plus settlement commitments.
