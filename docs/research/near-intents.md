# Research: NEAR Intents

- **Status:** NOT YET VERIFIED. Nothing below is a finding. This file lists what must be read and recorded before any Intents code is written (phase 8, [ADR 0014](../decisions/0014-scope-expansion-beyond-mvp.md) section 3).
- **Used by:** the `IntentsClient` adapter (`getQuote` dry run, `createSwap`, `getStatus`, `supportedAssets`), the `IntentsSolver` liquidity source and the `IntentsPriceFeed`.
- **Last verified:** never.

## Questions to answer from the current official documentation

Record each answer with the URL and the date it was read. Mark anything that could not be confirmed `UNVERIFIED`.

| #   | Question                                                                                              | Answer | Source URL | Date read |
| --- | ----------------------------------------------------------------------------------------------------- | ------ | ---------- | --------- |
| 1   | Is there an HTTP quote and swap API, what is its base URL, and is there a testnet or sandbox variant? |        |            |           |
| 2   | Authentication, API keys, rate limits and fees.                                                       |        |            |           |
| 3   | Request and response shapes for a dry-run quote, a swap and a status read, copied from the docs.      |        |            |           |
| 4   | Which assets and chains are supported, and where is the machine-readable list?                        |        |            |           |
| 5   | Do any supported assets carry transfer restrictions, and can the system enforce eligibility for them? |        |            |           |
| 6   | Can a third party register its own token as an Intents-routable asset? If yes, what is the process?   |        |            |           |
| 7   | Refund and failure semantics for an expired or unfilled intent.                                       |        |            |           |
| 8   | Is a price or reference-rate feed available that can back `IntentsPriceFeed`?                         |        |            |           |

## Design consequences to record once answered

- Which use cases are real: reference prices and liquidity discovery first, then a cross-chain settlement leg, then registration of Pontis representations (only if question 6 is yes).
- A Pontis-controlled asset is never routed through a solver without the same safety semantics (bound quote, refund path, eligibility at both ends). Where question 5 is no, the route is refused for restricted assets with `INTENTS_ELIGIBILITY_UNSUPPORTED`.
- Which tests are opt-in and env-gated against a real surface, and which run against `SimulatedIntentsClient` in CI.

## What is real and what is simulated

To be filled in when the adapter exists. Until then nothing in this repository uses NEAR Intents.
