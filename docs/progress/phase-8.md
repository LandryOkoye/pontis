# Phase 8 report (in progress)

## Shipped in this branch so far

- Verified current 1Click and Confidential Intents documentation and recorded sources in
  `docs/research/` (checked 2026-11-12).
- Added `@pontis/intents-private` with a typed 1Click adapter, deterministic offline client,
  encrypted in-memory RFQ matcher, oracle deviation and expiry guards, replay rejection,
  encrypted participant/auditor disclosures, and matched-order commitments.
- Exposed the Intents client through simulator-default API endpoints for tokens, dry quotes,
  deposit-route creation, and status.
- Exposed encrypted RFQ order submission, matcher public key, and participant/auditor-encrypted
  disclosure retrieval through simulator API routes; published the shared schemas and OpenAPI.
- Added package/API tests and documented the confidentiality trust model.

## What is simulated or opt-in

- The local Intents client is simulated. The 1Click adapter targets production only, requires an
  API key plus explicit opt-in, and is not invoked by the demo. It does not submit deposits.
- RFQ matching is operator-trusted and simulated. Instructions are not submitted to core, and
  commitments are not yet persisted on-chain. No public amounts, addresses, or timings are claimed
  to be hidden once settlement is integrated.
- Confidential Intents is not called because there is no documented testnet and access can be
  gated. Its confidentiality option is represented in the adapter request type.

## Open before Phase 8 is complete

- Connect eligible matched instructions to a core settlement path and record commitments on-chain;
  implement the demo flow against the sandbox, including auditor-key disclosure verification.
- Persist orders/matches and add a recipient-side disclosure verification flow without sending
  participant private keys to the server.
- Add opt-in live smoke coverage only after a safe partner environment and access are confirmed.
- Keep production 1Click disabled in the demo until a partner environment and compliance review
  are available; no documented Intents testnet exists.

## Verification

- Passed API-types tests (38), API route tests (6), and private package tests (6).
- Passed API, API-types, and private package lint and typecheck.
- OpenAPI was regenerated from the shared endpoint schemas.
