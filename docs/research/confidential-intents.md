# Confidential Intents research

- **Checked:** 2026-11-12
- **Surface:** Confidential Swaps through the official NEAR Intents 1Click API

## Verified

- The current 1Click docs support a `confidentiality` quote parameter with `basic` or `advanced`
  values. A foreign-chain-to-foreign-chain flow otherwise uses the ordinary quote/deposit/status
  flow; an embedded Confidential Intents balance uses `CONFIDENTIAL_INTENTS` deposit/recipient/
  refund types and signed-intent execution.
  [Confidential swaps](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/confidential-swaps),
  [quote API](https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote)
- NEAR announced general availability on 2026-07-07 for developers integrating through 1Click.
  However, the API terms allow confidential-swap access to be gated by developer approval,
  whitelisting, eligibility, KYB, volume or other conditions.
  [GA announcement](https://near.org/blog/announcing-general-availability-of-confidential-intents),
  [API terms](https://docs.near-intents.org/security-compliance/terms-of-service)
- Confidential execution runs on a NEAR private shard operated by independent permissioned
  validators and connected to NEAR mainnet through a TEE-based bridge. The official explainer says
  the private shard has no public RPC/API/block explorer; it describes private transaction details
  as hidden from the public chain and the overall model as trust-minimized rather than fully
  trustless. [Architecture explainer](https://www.near.org/blog/how-confidential-intents-works)
- Official documentation states user private balances/history require a separate authenticated
  User-Session token. The public 1Click partner JWT alone does not grant access to confidential
  user data. [API Keys](https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication)
- The 1Click docs state there is no testnet version. Pontis therefore implements a local encrypted
  RFQ simulator and does not claim to integrate with the live Confidential Intents service.

## Unknowns

- A staging/testnet confidential environment and partner access credentials.
- A complete confidential-route allowlist separate from live quote acceptance.
- An externally available selective-disclosure API. Earlier official material described selective
  disclosure as planned; current public docs reviewed here do not establish the API shape or access
  policy.
