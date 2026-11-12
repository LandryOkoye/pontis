# Confidential RFQ threat model

## Implemented demo behavior

Orders are sealed to an in-process matcher's X25519 public key with TweetNaCl's authenticated
`box` primitive. The service decrypts orders, matches limit prices by price-time priority, checks
expiry, replay IDs, and a configured oracle-deviation bound, then emits an off-chain settlement
instruction. A SHA-256 commitment binds the matched orders, size, price, and random salt. The same
disclosure package is separately encrypted to each participant and, when configured, an auditor.
The API returns the encrypted package and commitment. The recipient decrypts locally with its
private key and recomputes the commitment; the matcher never receives participant private keys.
The local test helper also verifies a decrypted package against the stored commitment.

Every result is `confidentiality_level: "operator_trusted"` and `simulated: true`. The demo does
not submit settlement to Pontis core, persist a commitment on-chain, batch/net settlements, or
provide TEE, threshold-matcher, or Confidential Intents verification. Consequently the commitment
is only a local proof until a later integration records it in a transaction/event and verifies it.

## Trust and leakage

The matcher operator sees every decrypted order, participant identity, timing, asset, size, and
limit. Participants learn the matched pair's disclosed terms. A public settlement, once added,
will expose token-transfer amounts, timing, and addresses even if the order book remains hidden.
The auditor can read every disclosure package addressed to its key. Theft of a participant or
auditor secret key exposes packages encrypted to that key. Matcher-key compromise exposes submitted
ciphertexts that were retained by an observer.

Mitigations in this demo are authenticated encryption, short-lived orders, replay rejection,
oracle sanity bounds, and participant/auditor-specific disclosure encryption. The matcher only
accepts synthetic `sim:` asset IDs against a fixed simulated oracle price by default. Key rotation,
retention policy, delayed or batched settlement, TEE attestation, and threshold matching are not
implemented. Do not use this local simulator for real orders or real funds.
