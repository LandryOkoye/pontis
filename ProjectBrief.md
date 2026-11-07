# Project Brief v2.0: RWA Interoperability, Conversion, Cross-Chain Settlement & Confidential Execution

Project Name: Pontis
**Document status:** Consolidated product, protocol and engineering brief  
**Version:** 2.0  
**Date:** 7 November 2026  
**Working title:** Universal RWA Interoperability Protocol  
**Primary ecosystem:** NEAR Protocol  
**Initial deployment:** NEAR Testnet  
**Audience:** Product, protocol, smart-contract, backend, frontend, security, research and ecosystem teams

---

## Document purpose

This is the consolidated source of truth for the project. It combines the strongest product ideas from the two earlier briefs with a technically conservative implementation plan.

The protocol is intended to become an interoperability layer for tokenized real-world assets (RWAs), not simply another asset listing site, token issuer or unrestricted exchange. Its long-term scope includes issuer-to-issuer conversion, cross-chain movement, market-priced exchange, confidential institutional execution, confidential transfers, and developer/AI-agent access.

Those capabilities are not all part of the first release. The project must prove its asset model, compatibility decisions and settlement safety before expanding into more complex routes.

### Decisions made in this version

1. **Keep the broad product vision:** issuer interoperability, cross-chain settlement, confidential execution and API/MCP access remain part of the long-term product.
2. **Separate three different operations:**
   - **Conversion:** move between representations that have been approved as equivalent claims.
   - **Exchange:** trade one asset for a different asset at a market-determined price.
   - **Bridge/transfer:** move an asset or issuer-approved representation between networks.
3. **Do not infer equivalence from tickers, prices or unit multipliers.** Legal rights, custody, redemption, issuer obligations and transfer restrictions matter.
4. **Use an explicit compatibility framework.** Only `DIRECT_EQUIVALENT` relationships can use parity conversion.
5. **Treat bridging as a first-class capability, but not as a universal bridge.** Every chain and asset route needs an identified verification and settlement mechanism.
6. **Retain private order submission and dark-pool-style execution as a later module.** Do not assume a custom matcher can be deployed inside NEAR Confidential Intents.
7. **Retain recipient-specific confidential transfer instructions and selective disclosure as later design capabilities.** Their encryption, key management, storage and disclosure model must be specified and reviewed.
8. **Keep the MVP narrow:** two synthetic representations of one clearly defined test claim on NEAR Testnet, with a controlled conversion path.
9. **Use APIs and read-only agent tools before agent-initiated execution.** Any later execution must be explicitly authorized and constrained.
10. **Do not use real RWA assets or production funds until legal, issuer, custody, security and operational requirements have been independently addressed.**

---

# 1. Executive summary

Tokenization makes it possible to represent real-world assets and related contractual claims as blockchain tokens. It does not, by itself, make those tokens interoperable.

Different issuers can create tokenized products linked to the same underlying asset or economic exposure. Those representations may live on different networks, use different token standards, rely on different custodians, grant different legal rights, and impose different redemption or transfer conditions. A token representing one ounce of gold from Issuer A is not automatically interchangeable with a token representing one ounce of gold from Issuer B. The same is true of tokenized stocks, funds, Treasuries, credit products and other RWAs.

The project proposes a neutral interoperability and settlement protocol that helps users and applications discover supported assets, understand how their claims differ, determine which representations are genuinely compatible, obtain executable quotes, and coordinate eligible conversion or transfer operations.

The protocol is designed around NEAR. NEAR contracts provide registry, policy and protocol coordination. NEAR Intents may be integrated for supported quote and execution routes. Chain Signatures may enable NEAR accounts or contracts to sign transactions on supported external networks. A bridge or another chain-specific proof mechanism is required when external-chain state must be verified. Confidential Intents may be used for supported privacy-enabled flows, subject to the actual assets, routes and API capabilities available.

The long-term product has five primary capability areas:

1. **RWA intelligence and compatibility:** structured asset and issuer records, evidence, legal/economic attributes, transfer rules and conservative compatibility decisions.
2. **Conversion and exchange:** parity conversion between approved equivalent claims, plus separately priced exchange between different assets.
3. **Cross-chain interoperability:** controlled movement of assets or issuer-approved representations between supported networks, with verifiable settlement and recovery.
4. **Confidential execution and transfers:** private order submission, possible batch matching, recipient-specific confidential instructions and selective disclosure where supported.
5. **Developer and agent infrastructure:** APIs and MCP tools that let applications and authorized agents discover assets, compare routes, request quotes and, later, initiate bounded transactions.

A later lifecycle module can normalize access to asset-specific events such as interest, dividends, maturity, repayment, redemption, rental income, defaults and corporate actions.

**The first release is not a universal RWA marketplace.** It is a controlled technical demonstration proving that two synthetic issuer representations of the same precisely defined test claim can be registered, evaluated, quoted, converted and reconciled safely.

### One-sentence description

A NEAR-based interoperability and settlement protocol that helps compatible tokenized real-world assets be discovered, evaluated, converted, exchanged, transferred across supported networks and, where supported, settled through confidential execution.

### Core product thesis

Tokenized RWAs should not be operationally trapped by issuer-specific implementations or blockchain networks. However, interoperability must preserve the legal and economic differences between assets rather than pretending that every token with similar exposure is interchangeable.

---

# 2. Problem statement and opportunity

## 2.1 Where fragmentation occurs

1. **Issuer fragmentation:** multiple issuers create separate tokens connected to the same asset, issuer, reference price or economic exposure.
2. **Network fragmentation:** representations live on different blockchains and cannot necessarily move directly between them.
3. **Legal fragmentation:** similar-looking tokens can grant different rights, claims, recourse, redemption procedures or investor protections.
4. **Technical fragmentation:** issuers use different token standards, decimals, contract interfaces, custody arrangements, mint/burn controls and transfer policies.
5. **Liquidity fragmentation:** liquidity is distributed across issuers, networks, venues and market makers.
6. **Information fragmentation:** users cannot easily compare custody, backing evidence, fees, eligibility, redemption and issuer risk in a consistent format.
7. **Lifecycle fragmentation:** dividends, interest, maturity, repayments, rental income, redemptions, freezes and corporate actions are handled through different issuer processes.
8. **Execution privacy:** large or sensitive orders can reveal intent, size, counterparties or strategy when submitted through public transaction paths.

## 2.2 Why existing tokenization is not enough

A token contract can establish that a token exists and that a transfer occurred. It does not independently prove that the underlying asset exists, that a custodian holds it, that a legal claim is enforceable, that redemption will be honored, or that two issuer products provide the same rights.

Likewise, a bridge can move a token or message between networks without establishing that the destination representation is legally equivalent to the source claim.

The protocol must therefore combine technical interoperability with structured asset information, issuer-specific adapters, conservative compatibility rules and explicit settlement assumptions.

## 2.3 Opportunity

Create a shared infrastructure layer that:

- Gives every supported token representation a structured identity.
- Separates the underlying asset or claim from its token representation.
- Makes issuer, custody, legal, redemption and transfer information comparable.
- Distinguishes direct equivalence from similar exposure.
- Exposes issuer-specific functionality through adapters.
- Quotes and coordinates approved conversion and exchange routes.
- Supports cross-chain operations only where the required verification and settlement path exists.
- Offers privacy-enabled execution for supported flows without promising absolute anonymity.
- Exposes consistent APIs and agent tools.

## 2.4 What the protocol is not

The protocol is not, by default:

- An issuer of gold, securities, property, debt or fund tokens.
- A custodian or guarantor of the underlying assets.
- A guarantee that a token is backed, redeemable or legally equivalent to another token.
- A universal bridge that can move any token to any network.
- A substitute for issuer due diligence, legal advice, audits or regulatory authorization.
- A privacy mixer or mechanism for bypassing KYC, sanctions, investor eligibility or lawful disclosure.
- A guarantee of liquidity or continuous executable prices.

---

# 3. Product goals, non-goals and principles

## 3.1 Long-term goals

- Build a structured registry of supported issuers, assets and token representations.
- Establish a defensible compatibility framework for direct conversion.
- Support issuer-specific adapters for transfer, redemption, eligibility and lifecycle operations.
- Provide quotes and execution for approved parity conversions.
- Support market-priced exchange as a distinct operation.
- Add selected cross-chain routes with explicit proof and recovery models.
- Support confidential execution and transfers where the underlying infrastructure permits.
- Provide APIs and MCP tools for applications and authorized agents.
- Expand to additional RWA categories through asset-specific models rather than one generic assumption.

## 3.2 Non-goals for the first release

- Live securities, funds, credit products or other regulated RWAs.
- Unrestricted permissionless asset registration.
- A universal bridge or universal token wrapper.
- A complex AMM or a new matching engine.
- Market-priced exchange between different asset classes.
- Custom private-shard execution without confirmed infrastructure support.
- Fully autonomous AI-agent transaction execution.
- A protocol governance or incentive token.
- Claims that the protocol verifies real-world backing merely because an asset is registered.

## 3.3 Product principles

1. **Rights before tickers:** matching symbols or prices do not establish equivalence.
2. **Conservative compatibility:** uncertain pairs must not receive parity conversion.
3. **Evidence with provenance:** distinguish issuer-provided statements, third-party attestations and independently verified facts.
4. **Issuer rules are first-class:** eligibility, freezes, lockups, geography and transfer restrictions must be enforced.
5. **Operations must be explicit:** show whether a transaction is atomic, asynchronous, bridge-dependent, issuer-dependent or subject to manual recovery.
6. **Transparent execution economics:** quotes must expose fees, spreads, network costs, slippage assumptions and expiry.
7. **Privacy is not anonymity:** screening, monitoring and lawful disclosure may still apply.
8. **Minimize custody:** avoid discretionary custody; where contracts hold assets, apply strict controls.
9. **Adapters over special cases:** add issuers through explicit adapter interfaces.
10. **Human authorization first:** agent execution must be bounded by explicit user permissions.
11. **No false universality:** support is declared per asset, chain, issuer and route.
12. **Lifecycle-aware design:** the protocol must not assume all RWAs behave like fungible spot tokens.

---

# 4. Users and priority use cases

## 4.1 Target users

- **RWA holders and investors:** compare supported representations and move between eligible products.
- **Institutions and asset managers:** route assets under issuer, eligibility and operational constraints.
- **Issuers and tokenization platforms:** expose token representations and supported operations through adapters.
- **Liquidity providers and market makers:** quote eligible conversions and exchanges.
- **Wallets and DeFi applications:** integrate discovery, quotes and transaction flows.
- **Developers:** use the registry and execution APIs.
- **AI-agent developers:** use read-only discovery and quote tools first, with constrained execution added later.

## 4.2 Priority use cases

### MVP — same-claim, same-chain conversion

A user holds synthetic Test Gold A and wants synthetic Test Gold B. Both are test representations of the same precisely defined synthetic claim. The protocol checks registration, compatibility, unit ratio, user eligibility and available inventory; returns a quote; executes a controlled conversion; and reconciles the result.

### Later — same-claim, cross-chain movement

A user wants to move a supported token representation or issuer-approved equivalent from one network to another. The protocol coordinates source-side locking or burning, external-state verification, destination-side minting or release, and recovery if a step fails.

### Later — different-asset exchange

A user wants to exchange tokenized gold for a tokenized Treasury product. This is not parity conversion. It requires a market price, executable liquidity, asset-specific eligibility and clear disclosure of spreads and risks.

### Later — confidential institutional execution

An institution wants to submit a large order without exposing all order details publicly before execution. The protocol may offer a private submission or matching route where the execution environment and settlement integration are supported.

### Later — confidential recipient transfer

A user or institution wants to send an asset together with recipient-specific encrypted instructions or supporting information. The transfer design must identify which data is public, encrypted, stored off-chain, visible to the issuer or available for lawful disclosure.

---

# 5. Product capability architecture

The product is organized into six modules. The first four are core protocol capabilities; developer access spans the platform; lifecycle infrastructure is a later expansion.

## 5.1 Module A — RWA intelligence and compatibility

Responsibilities:

- Issuer registry.
- Canonical underlying asset/claim records.
- Token representation registry.
- Asset and issuer metadata.
- Evidence and attestation references.
- Compatibility relationships and approval history.
- Eligibility and transfer-policy metadata.
- Status, suspension and risk flags.

This module determines what an asset is claimed to represent and what evidence supports that claim. It does not automatically guarantee backing or legal enforceability.

## 5.2 Module B — Conversion and exchange

Two distinct execution paths:

**Parity conversion** is available only for `DIRECT_EQUIVALENT` representations and uses an approved unit ratio, subject to fees and execution constraints.

**Market-priced exchange** is for different assets or economically different claims. It requires price discovery, liquidity, spread/slippage controls and separate risk disclosures.

Possible liquidity sources include controlled inventory, issuer-supported redemption/minting, liquidity providers, market makers and supported NEAR Intents routes. A route is executable only after the asset and integration have been confirmed.

## 5.3 Module C — Cross-chain interoperability

Responsibilities:

- Chain and token representation adapters.
- Source and destination transaction coordination.
- Lock/release or burn/mint flows where issuer-authorized.
- Chain-specific proof verification.
- Nonce and replay protection.
- Finality tracking.
- Asynchronous settlement states.
- Refund, compensation or manual recovery procedures where possible.

The protocol must not assume that all chains support the same bridge mechanism or trust model.

## 5.4 Module D — Confidential trading and settlement

Long-term capabilities:

- Private order submission.
- Confidential quote requests.
- Dark-pool-style matching or batch auction, if a suitable execution environment is available.
- Confidential transfer instructions.
- Recipient-specific encryption.
- Selective disclosure and authorized viewing.
- Privacy-aware audit and compliance workflows.

A commit/reveal batch auction is one possible matching design, not a requirement for the MVP. Its suitability depends on latency, order privacy, manipulation resistance, cancellation rules, settlement guarantees and the execution environment.

NEAR Confidential Intents must be treated as a supported integration path for documented flows, not as proof that arbitrary custom matcher code can be deployed inside a private shard. Validate the exact capability before implementation.

## 5.5 Module E — Developer and AI-agent infrastructure

Provide a stable API and later MCP tools for asset discovery, comparison, route evaluation, quotes, transaction status and authorized execution.

Initial agent access should be read-only. Later execution permissions must be explicit, revocable, limited by method, amount, asset, recipient, expiry and transaction count, and require user approval according to the risk level.

## 5.6 Module F — RWA lifecycle infrastructure

Later support for asset-specific events:

- Dividends and distributions.
- Interest accrual and coupon payments.
- Maturity and redemption.
- Loan repayment, delinquency and default.
- Rental income and property-fund distributions.
- Corporate actions, splits and conversions.
- Freezes, recalls and issuer actions.

Do not force all lifecycle events into one generic contract. Normalize the interface while preserving asset-class-specific logic and evidence.

---

# 6. Asset model and compatibility framework

This is the most important domain model in the protocol.

## 6.1 Canonical claim vs. token representation

Maintain separate records for:

**Underlying asset or claim:** the economic or legal entitlement being represented. Example: a defined beneficial claim to one troy ounce of allocated gold under a specified custody and legal arrangement.

**Token representation:** the particular issuer's on-chain token that records or enables access to that claim. Example: `TEST-GOLD-A` on NEAR or `TEST-GOLD-B` on NEAR.

A canonical claim identifier does not prove that two tokens are legally identical. The compatibility assessment must evaluate the actual rights and obligations.

## 6.2 Issuer record

Suggested fields:

- `issuer_id`
- Legal entity name and jurisdiction
- Public website and official documentation references
- Issuer status
- Authorized asset categories
- Issuer-controlled contracts and administrative roles
- Custodian and relevant service providers
- Audit/attestation providers
- Contact and incident information
- Evidence references and timestamps
- Review status and reviewer history

## 6.3 Canonical asset/claim record

Suggested fields:

- `canonical_asset_id`
- Name and asset category
- Underlying instrument or claim description
- Unit definition
- Currency or denomination where applicable
- Economic rights
- Legal claim structure
- Jurisdiction
- Redemption and settlement terms
- Relevant valuation/NAV method
- Lifecycle model
- Eligibility restrictions
- Risk disclosures
- Evidence references
- Record status

## 6.4 Token representation record

Suggested fields:

- `representation_id`
- `canonical_asset_id` (candidate association, not automatic equivalence)
- `issuer_id`
- Chain/network identifier
- Contract address/account ID
- Token standard and interface
- Symbol and decimals
- Smallest-unit conversion
- Canonical unit multiplier as a rational numerator/denominator
- Mint, burn, pause, freeze and admin capabilities
- Custody and backing description
- Redemption mechanism
- Transfer policy and eligibility method
- Bridge/wrapper status
- Supported adapter version
- Evidence and verification status
- Last reviewed timestamp
- Status: active, restricted, paused, deprecated or rejected

Use rational arithmetic for unit conversions. Avoid floating-point arithmetic in contract accounting.

## 6.5 Compatibility classifications

| Classification | Meaning | Permitted action |
|---|---|---|
| `DIRECT_EQUIVALENT` | Claims are approved as equivalent for the specified conversion scope and unit | Parity conversion may be enabled |
| `ECONOMICALLY_SIMILAR` | Assets share exposure or reference value but differ in rights, structure or risk | No parity conversion; market-priced exchange may be considered |
| `INCOMPATIBLE` | Claims or operational conditions are materially different | No direct route |
| `SUSPENDED` | Previously supported relationship is paused pending review | No execution |

Compatibility is scoped. A pair may be equivalent for a narrow conversion operation under defined conditions without being identical in every legal or operational respect.

## 6.6 Compatibility assessment

A compatibility review should evaluate:

1. Underlying asset or reference.
2. Legal claim and holder rights.
3. Issuer obligations and recourse.
4. Custody and backing arrangements.
5. Unit definition and quantity.
6. Redemption rights, windows, fees and settlement.
7. Fees, deductions and economic leakage.
8. Transfer restrictions and investor eligibility.
9. Freeze, clawback, recall and administrative powers.
10. Insolvency, default and dispute procedures.
11. Valuation method and material timing differences.
12. Corporate actions and lifecycle treatment.
13. Jurisdictional and regulatory differences.
14. Evidence quality, age and provenance.

A unit multiplier alone is never sufficient to approve parity conversion.

## 6.7 Compatibility governance

- New relationships begin as proposed.
- Evidence and review requirements are recorded.
- Approval requires designated authority and a recorded rationale.
- Every change is versioned and auditable.
- A relationship can be suspended immediately if evidence becomes stale or a material event occurs.
- Conversion routes must check the current compatibility status at quote and execution time.
- The UI must explain why a pair is or is not directly convertible.

---

# 7. Conversion, exchange and pricing

## 7.1 Parity conversion

For approved direct equivalents, conversion uses a defined unit ratio.

Example:

- Representation A: 1 token = 1.0 canonical unit.
- Representation B: 1 token = 0.1 canonical unit.
- The approved ratio is therefore 1 A = 10 B before fees.

This is illustrative only. The protocol must use the registered rational conversion values and approved conversion scope.

A parity conversion quote should include:

- Input and output representation.
- Input amount.
- Expected output amount.
- Unit ratio.
- Protocol fee.
- Liquidity or inventory fee, if any.
- Network cost.
- Any issuer redemption or minting cost.
- Slippage or imbalance adjustment, if applicable.
- Quote expiry.
- Route and settlement model.
- Compatibility status and warnings.

## 7.2 Inventory and imbalance management

For an initial conversion demonstration, use a controlled, pre-funded inventory or test vault. Do not introduce a complex AMM before proving the asset and accounting model.

Later options include:

- Inventory-based conversion.
- Issuer redemption and reissuance.
- Liquidity-provider quotes.
- Market-maker/solver competition.
- AMM-style liquidity, only where asset behavior and legal structure support it.

An imbalance fee may be considered for inventory risk, but its formula, caps, disclosure and governance must be explicit. It must not disguise a market-priced trade as a 1:1 conversion.

## 7.3 Market-priced exchange

Exchange between different assets must use a distinct pricing and execution path.

Required elements:

- Price source and timestamp.
- Quote methodology.
- Executable liquidity.
- Spread and slippage.
- Fees and network costs.
- NAV or valuation caveats for illiquid assets.
- Eligibility checks for both sides.
- Quote expiry and minimum output.
- Clear disclosure that this is not a parity conversion.

A recent NAV is not necessarily an executable market price.

## 7.4 Quote lifecycle

Suggested quote states:

`REQUESTED → ROUTED → QUOTED → ACCEPTED → SUBMITTED → SETTLED`

Terminal or exception states:

`EXPIRED`, `REJECTED`, `CANCELLED`, `FAILED`, `REQUIRES_RECONCILIATION`.

Quotes must be bound to the intended user/wallet, asset pair, amount, route, expiry and relevant policy version. Execution must reject expired or altered quotes.

---

# 8. Cross-chain interoperability and settlement

## 8.1 Design principle

Cross-chain transfer is not the same as parity conversion. A bridge moves or recreates a representation across networks; conversion changes which issuer representation the user holds. A route may combine both operations, but the protocol must model each step separately.

## 8.2 Supported bridge models

Depending on the issuer and asset, a route may use:

- Lock on source and release on destination.
- Burn on source and mint on destination.
- Issuer-operated redemption and reissuance.
- A supported third-party bridge or interoperability protocol.
- A solver/market-maker route that settles through NEAR Intents.

The selected model must be authorized by the issuer and consistent with the token's legal and technical design. Do not wrap or mint a substitute representation without explicit authority.

## 8.3 Verification responsibilities

- **NEAR Chain Signatures:** can enable NEAR accounts/contracts to sign transactions on supported external networks using MPC. They are not, by themselves, a universal mechanism for verifying inbound transfers or external-chain state.
- **Omni Bridge or another bridge/proof system:** may provide verification and message/asset transfer functionality for specific supported networks. Verification assumptions differ by chain and route.
- **NEAR Intents:** can coordinate supported intent-based routes and solver settlement. Do not assume custom RWA assets are automatically supported.
- **Issuer adapters:** may call issuer systems or contracts where the issuer authorizes such operations.

For every route, document who observes the source event, who verifies it, what proof is accepted, who controls destination release, what finality threshold applies and what happens if a dependency fails.

## 8.4 Asynchronous settlement state machine

Suggested states:

`INITIATED → SOURCE_PENDING → SOURCE_CONFIRMED → PROOF_PENDING → PROOF_VERIFIED → DESTINATION_PENDING → COMPLETED`

Exception states:

`SOURCE_FAILED`, `PROOF_REJECTED`, `DESTINATION_FAILED`, `REFUND_PENDING`, `MANUAL_REVIEW`, `CANCELLED` (only where safe and permitted).

The system must not present cross-chain settlement as atomic unless the specific route genuinely provides atomic guarantees.

## 8.5 Required safety controls

- Unique operation IDs and nonces.
- Replay protection.
- Idempotent event processing.
- Source-chain finality rules.
- Destination mint/release authorization.
- Proof verification.
- Rate and value limits.
- Pausable routes and assets.
- Monitoring and alerting.
- Recovery and reconciliation procedures.
- Clear user-facing status.
- No duplicate mint/release on retries.

---

# 9. Confidential trading, transfers and selective disclosure

This module is strategically valuable, but it is technically and operationally more complex than registry and conversion.

## 9.1 Confidential order submission

Goal: reduce public exposure of sensitive order details before execution.

Potential approaches:

- Private submission to an execution environment.
- Commit/reveal order submission.
- Batch auctions that match compatible buy and sell orders at a clearing price.
- Solver-mediated execution where order details are disclosed only to required parties.
- Supported confidential execution infrastructure.

A commit/reveal batch auction can reduce some forms of order leakage, but it does not automatically provide full privacy or prevent every form of manipulation. It needs precise rules for commitment, reveal, cancellation, minimum order size, clearing price, unmatched orders, fees, anti-spam and settlement failure.

## 9.2 Dark-pool-style matching

The product may eventually support a private matching venue for eligible tokenized assets. The matching system must not imply that two economically similar assets are interchangeable. Orders should be matched only when the asset pair, legal eligibility and settlement route are approved.

Unmatched order remainder may be routed to a market maker or another venue only with explicit user authorization and clear price/fee disclosure.

## 9.3 NEAR Confidential Intents integration boundary

Confidential Intents is a potential integration for supported privacy-enabled flows through the NEAR Intents ecosystem and its documented API path. It must not be described as a general-purpose private smart-contract runtime.

Before committing to a custom dark pool, validate:

- Whether the desired assets are supported.
- Whether the exact order/settlement flow is supported.
- Which components execute in the confidential environment.
- What data is hidden from public observers and from operators/validators.
- What remains visible at deposits, withdrawals and external boundaries.
- What guarantees are provided for ordering, censorship, availability and settlement.
- Whether custom logic is supported or whether only documented routes can be integrated.

If custom matching is not supported, use a separately evaluated execution architecture rather than forcing the design into Confidential Intents.

## 9.4 Confidential recipient transfers

Potential design:

1. Public transaction carries only the minimum data required for settlement.
2. Recipient-specific instructions or documents are encrypted to the intended recipient.
3. Encrypted payload is stored in a suitable storage layer.
4. Recipient retrieves and decrypts it using their authorized key.
5. Access and disclosure events are auditable where appropriate.

The protocol must define key generation, rotation, recovery, revocation, encryption format, metadata leakage, storage availability, retention and lawful disclosure.

## 9.5 Selective disclosure

Selective disclosure can allow an authorized party to prove or reveal a required fact without exposing every private detail. Possible mechanisms include viewing keys, scoped decryption, signed attestations or zero-knowledge proofs, depending on the use case.

Do not promise selective disclosure until the exact proof system, verifier, threat model and integration have been selected and tested.

## 9.6 Privacy boundaries

Confidential execution is not anonymity. Data may remain visible to issuers, wallets, solvers, service providers, compliance systems, endpoints or parties at chain boundaries. The product must publish a plain-language privacy model that states what is hidden, from whom, under which assumptions and what may still be disclosed.

---

# 10. Developer APIs and AI-agent access

## 10.1 API principles

- Keep protocol execution and API orchestration separate.
- Never expose issuer or infrastructure secrets to clients.
- Use authenticated, rate-limited endpoints for privileged actions.
- Return structured errors and explicit route status.
- Include quote expiry, policy version and settlement status.
- Make all write operations idempotent where possible.
- Maintain audit logs without unnecessarily collecting sensitive data.

## 10.2 Initial REST API surface

Illustrative endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/v1/issuers` | List registered issuers |
| `GET` | `/v1/issuers/{id}` | Issuer detail |
| `GET` | `/v1/assets` | List supported assets |
| `GET` | `/v1/assets/{id}` | Asset representation detail |
| `GET` | `/v1/assets/{id}/compatibility` | Compatibility relationships |
| `POST` | `/v1/routes/compare` | Compare supported routes |
| `POST` | `/v1/quotes` | Request a quote |
| `GET` | `/v1/quotes/{id}` | Quote status and details |
| `POST` | `/v1/conversions` | Submit an approved conversion |
| `POST` | `/v1/transfers` | Initiate a supported transfer |
| `GET` | `/v1/transactions/{id}` | Transaction and settlement status |

Endpoints for market exchange, private orders, confidential sends and agent authorization are later additions, not MVP requirements.

## 10.3 MCP tool roadmap

Potential tools:

- `list_issuers`
- `list_assets`
- `get_asset_details`
- `compare_assets`
- `get_compatibility`
- `compare_routes`
- `check_liquidity`
- `request_quote`
- `get_quote`
- `get_transaction_status`
- Later: `convert_asset`, `bridge_asset`, `request_exchange_quote`, `submit_private_order`, `confidential_send`, `get_portfolio`

The first MCP release should be read-only. Write-capable tools must not be enabled merely because an agent can call them.

## 10.4 Agent authorization model

NEAR function-call access keys may be useful for scoped permissions, but they do not automatically enforce every policy the product needs.

The application and contracts must enforce:

- Allowed methods/contracts.
- Allowed assets and recipients.
- Maximum amount per transaction.
- Maximum cumulative spend.
- Expiry.
- Transaction count or rate limits.
- Revocation.
- User approval requirements.
- Policy version and audit trail.

Never give an agent unrestricted access to a user's wallet or signing authority. Keep signing material out of the backend.

---

# 11. RWA category expansion strategy

The protocol can expand across RWA categories, but each category needs its own claim model, lifecycle, evidence and eligibility requirements.

| Category | Typical representation | Important differences and constraints | Protocol treatment |
|---|---|---|---|
| Tokenized stocks | Shares, depositary or contractual exposure | Voting rights, dividends, corporate actions, issuer structure, jurisdiction and trading hours | Do not equate tokens solely by ticker or price |
| ETFs | Fund units or exposure | Fund domicile, share class, fees, NAV, distribution policy and creation/redemption | Compare share-class rights and fund structure |
| Commodities | Allocated/unallocated claim, warehouse receipt or commodity exposure | Custody, location, quality, insurance, redemption, delivery and unit | Potential early category if claim and unit are precise |
| Treasuries/MMFs | Fund shares or debt claims | Issuer, fund structure, yield, NAV, redemption windows, settlement and eligibility | Treat as fund/debt claims, not cash equivalents |
| Private credit | Loan participation, fund interest or receivable | Borrower risk, seniority, collateral, repayment, default, servicing and transfer limits | Requires asset-specific lifecycle and risk metadata |
| Real estate | Fund/share, SPV interest or property-linked claim | Title, SPV, jurisdiction, valuation, rental income, liquidity and transfer rights | Do not describe a token as direct property ownership unless legally accurate |
| Bonds | Debt security or fund interest | Seniority, coupon, maturity, covenants, default and settlement | Preserve instrument-specific terms |
| Pre-IPO/private shares | Equity or contractual exposure | Transfer restrictions, valuation uncertainty, issuer consent and investor eligibility | Restricted support; no assumed open liquidity |

## 11.1 Expansion rule

Add a new category only when the team can answer:

- What exactly does the token holder own or have a claim against?
- Who is legally obligated to the holder?
- What evidence supports custody, backing or issuer obligations?
- How is the asset valued?
- How can it be redeemed or transferred?
- What happens on default, insolvency or corporate action?
- Which investors are eligible?
- What adapter and lifecycle operations are required?

The registry can support many categories before the protocol can safely execute transactions for them. Discovery support must not be confused with execution support.

---

# 12. NEAR architecture and integration strategy

## 12.1 High-level architecture

**NEAR on-chain layer**
- Issuer registry.
- Asset registry.
- Compatibility registry.
- Policy/eligibility controls.
- Conversion manager for the MVP.
- Settlement coordinator for later cross-chain flows.
- Optional escrow or controlled inventory vault.

**Off-chain services**
- API gateway.
- Issuer adapter services.
- Quote and routing engine.
- Evidence/metadata service.
- Indexer and transaction reconciler.
- Risk and eligibility integrations.
- Solver/market-maker integration.
- MCP server.
- Monitoring and operational tooling.

**External integrations**
- NEAR Intents and 1Click API, where supported.
- Chain Signatures for supported outbound external-chain signing.
- Omni Bridge or another route-specific proof/bridge mechanism.
- Confidential Intents for supported privacy-enabled flows.
- Issuer APIs, custody attestations, oracles and external chain RPCs.

## 12.2 NEAR components and correct responsibilities

### NEAR smart contracts

Use contracts for protocol state that needs on-chain enforcement: registrations, compatibility status, policy checks, conversion accounting, authorization and settlement state.

Do not put every metadata document, legal file or external evidence payload directly on-chain. Store references and integrity hashes where appropriate.

### NEAR Intents

NEAR Intents may provide solver competition and settlement for supported assets and routes. It is not safe to assume every custom RWA token can be added without integration work. Validate the target token, route, quote model, settlement path and operational requirements first.

### Chain Signatures

Use Chain Signatures where NEAR-controlled accounts/contracts need to sign transactions on supported external networks. Signing is not equivalent to independently verifying an inbound transaction. Pair it with the appropriate proof, bridge or external-state verification mechanism.

### Omni Bridge and other bridges

Evaluate each chain route independently. Record the bridge's verification method, validators/relayers, finality assumptions, upgrade authority, pause controls, token mapping and recovery model. Do not describe all routes as having identical trust assumptions.

### Confidential Intents

Treat as an optional integration for supported flows. Validate asset support, API behavior, privacy boundary and settlement compatibility. Do not assume custom arbitrary contracts or a bespoke dark-pool matcher can execute within the private shard.

## 12.3 Adapter architecture

Define interfaces for:

- `AssetMetadataAdapter`
- `EligibilityAdapter`
- `TransferAdapter`
- `MintBurnAdapter`
- `RedemptionAdapter`
- `ValuationAdapter`
- `LifecycleAdapter`
- `BridgeVerificationAdapter`
- `SettlementAdapter`

An issuer may implement only a subset. The protocol must represent unsupported operations explicitly rather than returning success or silently substituting another route.

---

# 13. Smart-contract design

## 13.1 Suggested contract boundaries

For a monorepo, contracts can initially be separate crates or modules. Do not split into many independently deployed contracts until there is a clear security or upgradeability reason.

Suggested logical components:

1. **Issuer registry:** issuer records, roles and status.
2. **Asset registry:** canonical claims and token representations.
3. **Compatibility registry:** pair relationships, ratio, scope, evidence references and approvals.
4. **Policy module:** allowlists, eligibility and transfer constraints.
5. **Conversion manager:** quote acceptance and controlled conversion execution.
6. **Settlement manager:** later asynchronous cross-chain state.
7. **Vault/inventory module:** controlled test inventory for the MVP.

## 13.2 Contract responsibilities

- Validate caller permissions.
- Validate asset and compatibility status.
- Validate unit ratio and integer arithmetic.
- Enforce quote expiry and amount limits.
- Prevent replay and duplicate execution.
- Emit events for indexers.
- Support emergency pause.
- Enforce narrowly scoped administrative roles.
- Preserve auditable state transitions.

## 13.3 Contract non-responsibilities

Contracts cannot independently prove off-chain custody, legal enforceability, issuer solvency or the truth of external attestations. They should record evidence references, approval decisions and status, while clearly distinguishing on-chain enforcement from off-chain due diligence.

## 13.4 Security invariants

- No conversion unless both representations are active and approved.
- No parity conversion unless relationship is `DIRECT_EQUIVALENT`.
- No output amount may exceed the approved ratio after fees.
- No execution using an expired quote.
- No duplicate settlement for one operation ID.
- No unauthorized mint, burn, lock or release.
- Paused assets and routes cannot execute.
- Administrative changes are permissioned and evented.
- All amounts use safe integer/rational arithmetic.

---

# 14. Backend services and data model

## 14.1 Suggested services

- **API service:** authentication, request validation, public and privileged endpoints.
- **Registry service:** issuer/asset metadata, evidence and compatibility views.
- **Adapter service:** issuer-specific API and contract integration.
- **Quote service:** route discovery, fee calculation and quote lifecycle.
- **Execution coordinator:** transaction submission and settlement orchestration.
- **Indexer:** NEAR events and relevant external-chain events.
- **Reconciler:** compare expected operations with observed on-chain state.
- **MCP service:** read-only tools initially, then constrained write tools.
- **Monitoring service:** alerts, route health, stuck operations and risk signals.

## 14.2 Suggested data entities

- `Issuer`
- `CanonicalAsset`
- `AssetRepresentation`
- `AssetEvidence`
- `CompatibilityRelationship`
- `CompatibilityReview`
- `IssuerAdapter`
- `TransferPolicy`
- `EligibilityDecision`
- `LiquidityProvider`
- `Route`
- `Quote`
- `Conversion`
- `CrossChainTransfer`
- `SettlementEvent`
- `PrivateOrder` (later)
- `ConfidentialPayloadReference` (later)
- `AgentAuthorization` (later)
- `LifecycleEvent` (later)
- `AuditLog`

## 14.3 Data and event requirements

Every quote and execution should retain:

- User/wallet identifier.
- Input/output representations.
- Amounts and unit ratio.
- Fee breakdown.
- Route and adapter versions.
- Compatibility relationship version.
- Policy/eligibility decision reference.
- Quote expiry.
- Transaction hashes and chain identifiers.
- Settlement state and timestamps.
- Failure reason and recovery action.

Avoid storing private keys, raw sensitive documents or unnecessary personal data in application logs.

---

# 15. User experience and transaction flows

## 15.1 Asset discovery

1. User opens the asset catalog.
2. Protocol shows issuer, chain, token representation, underlying claim, unit and status.
3. User can compare two representations.
4. UI displays compatibility classification and the reason for it.
5. UI distinguishes registered information from verified evidence and issuer-provided claims.

## 15.2 Parity conversion

1. User selects source and destination representations.
2. Backend checks current compatibility status.
3. Eligibility and transfer policies are evaluated.
4. Quote engine checks inventory/liquidity and computes amount/fees.
5. User sees output, fees, expiry, route and warnings.
6. User approves and signs.
7. Conversion manager executes the controlled test flow.
8. Indexer observes events.
9. Reconciler verifies expected balances and records completion.
10. UI shows transaction receipt and final state.

## 15.3 Cross-chain transfer

1. User selects source, destination and amount.
2. Route engine confirms a supported issuer/chain route.
3. Eligibility and policy checks run.
4. Quote displays bridge/solver costs and expected timing assumptions.
5. User approves the operation.
6. Source transaction is submitted.
7. Source finality is observed.
8. Route-specific proof is generated and verified.
9. Destination action is submitted.
10. Destination state is observed and reconciled.
11. If any step fails, state machine enters a safe recovery or manual-review path.

## 15.4 Private order flow (later)

1. User selects a supported asset and order parameters.
2. System confirms eligibility and private route support.
3. Order is submitted through the selected confidential mechanism.
4. Matching/solver process executes according to published rules.
5. Settlement is submitted through an approved route.
6. User receives a receipt and privacy disclosure.

The system must explain what information remains visible and who can access it.

## 15.5 Confidential send flow (later)

1. Sender selects recipient and asset.
2. Sender creates a recipient-specific encrypted message or instruction.
3. The system stores only the encrypted payload and necessary reference.
4. Asset transfer executes through a supported settlement path.
5. Recipient retrieves and decrypts the message.
6. Authorized disclosure follows the documented policy.

---

# 16. Security, compliance and operational risk

## 16.1 Asset and issuer risk

Review:

- Issuer identity and authority.
- Legal rights represented by the token.
- Custody arrangements.
- Audit/attestation provider and scope.
- Redemption terms and history.
- Freeze, blacklist, clawback and recall powers.
- Issuer insolvency and default procedures.
- Conflicts of interest and administrative control.

Do not use “verified” without stating exactly what was checked, by whom, when and within what limits.

## 16.2 Smart-contract and protocol security

- Threat model before implementation.
- Unit, integration, property and invariant tests.
- Access-control review.
- Reentrancy and arithmetic review where applicable.
- Upgrade and admin-key controls.
- Pause and emergency procedures.
- External audit before mainnet or real assets.
- Capped pilot and monitoring.

## 16.3 Cross-chain security

- Verify each bridge's trust model.
- Confirm source finality and proof semantics.
- Protect against replay and duplicate events.
- Enforce destination mint/release authorization.
- Model relayer, validator and MPC failures.
- Test partial completion and recovery.
- Maintain route-specific pause controls.

## 16.4 Confidentiality and data protection

- Confidentiality is not anonymity.
- Avoid leaking order details through logs, analytics or error messages.
- Define key custody, recovery, rotation and revocation.
- Minimize personal data and encrypted payload metadata.
- Document operator, validator, issuer and endpoint visibility.
- Establish retention and lawful disclosure policies.

## 16.5 Compliance and legal workstream

Before any real RWA launch, obtain qualified legal advice for each target jurisdiction and asset class. Review at minimum:

- Securities and investment-product classification.
- Whether the operator may be acting as broker, dealer, exchange, transfer agent, investment adviser, custodian or payment service.
- KYC/KYB, AML, sanctions and transaction monitoring.
- Investor eligibility and transfer restrictions.
- Lockups, geography restrictions and whitelisting.
- Marketing and disclosure requirements.
- Data protection and lawful disclosure.
- Custody, escrow, insolvency and dispute resolution.

The MVP should use synthetic test assets and testnet funds only. A technical demonstration is not authorization to handle real securities or other regulated assets.

## 16.6 Operational controls

- Incident response plan and security contact.
- Monitoring for unexpected mint/release, stuck settlements, unusual volume, stale valuations, issuer pauses and adapter failures.
- Named owner for paused or stuck transfers.
- Runbooks for quote expiry, failed deposits, duplicate events, bridge downtime, issuer API outages and manual reconciliation.
- Backups and tested database restoration.
- Administrative action logs and multisig review.
- Clear escalation path for issuer and infrastructure incidents.

---

# 17. Limitations and hard problems

1. **The token is not the underlying asset.** On-chain records cannot independently prove physical backing, title, repayment or custodian solvency.
2. **Same exposure does not mean same legal claim.** Similar prices or reference assets do not establish parity.
3. **Transfer restrictions can block otherwise valid routes.** Eligibility, jurisdiction, sanctions and lockups must be enforced.
4. **Cross-chain settlement is not automatically atomic.** Source finality, proof systems, relayers, MPC signing and destination execution can fail independently.
5. **Liquidity is not automatic.** A registry does not create market makers or executable prices.
6. **Valuation can be stale or subjective.** NAV and appraisal values are not necessarily executable prices.
7. **Confidential execution has trust boundaries.** Some metadata and boundary events may remain visible to issuers, operators, validators or service providers.
8. **NEAR integrations are not plug-and-play for every RWA.** Each asset and route must be onboarded and tested.
9. **Lifecycle logic is asset-specific.** A property fund, Treasury product, stock and private loan have different event models.
10. **Issuer cooperation may be essential.** Some mint, burn, redemption and transfer actions cannot be performed without issuer authorization.
11. **Regulatory obligations may apply even when settlement is on-chain.** Technical decentralization does not automatically remove legal responsibilities.
12. **Private matching is a separate engineering problem.** Confidential execution infrastructure may not provide the custom order book or matching semantics the product wants.

---

# 18. MVP scope and roadmap

## 18.1 MVP objective

Prove that two synthetic token representations of one precisely defined test claim can be registered, assessed as directly equivalent, quoted, converted and reconciled on NEAR Testnet with correct accounting and safe failure handling.

## 18.2 MVP scope

**Build:**

- NEAR Testnet deployment.
- Two synthetic NEP-141 test representations.
- One canonical synthetic asset/claim definition.
- Issuer registry.
- Asset representation registry.
- Compatibility registry.
- `DIRECT_EQUIVALENT` approval for the test pair.
- Rational unit conversion.
- Simple allowlist eligibility.
- Controlled, pre-funded test inventory/vault.
- Quote API with fees, expiry and output.
- Conversion execution.
- Transaction history and status.
- Indexer and reconciliation.
- Minimal frontend for discovery, comparison, quote and conversion.
- Automated tests and demo documentation.

**Do not build in MVP:**

- Real RWA tokens or production funds.
- Cross-chain bridge.
- Market-priced exchange between different asset classes.
- Custom dark-pool matcher.
- Confidential transfer payload infrastructure.
- Multi-solver market.
- Agent-initiated transactions.
- Full lifecycle engine.
- Protocol governance token.

## 18.3 Roadmap

### Phase 0 — Technical discovery

- Confirm NEAR contract framework and tooling.
- Validate NEP-141 test-token flow.
- Define synthetic claim and unit.
- Confirm account, wallet and deployment assumptions.
- Decide contract boundaries and event model.
- Document what is deliberately mocked.

**Exit criteria:** architecture decision record, threat model draft, local dev environment and successful test contract deployment.

### Phase 1 — Same-chain MVP

- Implement issuer, asset and compatibility registries.
- Implement conversion manager and controlled inventory.
- Build API, indexer and frontend.
- Implement quote and conversion flow.
- Add tests for invalid, expired, suspended and unauthorized operations.

**Exit criteria:** two synthetic representations can be converted with correct accounting and reconciled end to end.

### Phase 2 — One external-chain proof of concept

- Select one external chain only after route support is confirmed.
- Choose the exact bridge/proof and signing mechanisms.
- Implement one route with explicit state transitions.
- Test source finality, proof verification, destination execution and recovery.

**Exit criteria:** one test asset route works end to end with replay protection and fault recovery.

### Phase 3 — Solver and NEAR Intents integration

- Confirm custom asset onboarding requirements.
- Integrate quote discovery for a supported route.
- Compare controlled inventory with solver-provided liquidity.
- Add route health and quote expiry handling.

**Exit criteria:** one supported route can be quoted and settled through the selected integration.

### Phase 4 — Confidential execution pilot

- Confirm supported Confidential Intents assets and flows.
- Define privacy threat model and visibility matrix.
- Prototype confidential order submission or transfer only where supported.
- Evaluate whether custom matching requires a separate architecture.

**Exit criteria:** documented privacy boundaries and a working, narrowly scoped supported flow.

### Phase 5 — RWA category and lifecycle expansion

- Add one new asset category at a time.
- Define claim schema and issuer adapter.
- Add category-specific eligibility, valuation and lifecycle rules.
- Conduct legal and operational review.

### Phase 6 — Institutional and agent infrastructure

- Add institutional roles and policy controls.
- Add read-only MCP tools.
- Add user-approved, bounded agent execution only after authorization and security review.
- Add monitoring, reporting and institutional operational controls.

---

# 19. Acceptance criteria

## 19.1 Registry

- Issuers and representations can be registered with required metadata.
- Canonical claim and token representation remain separate entities.
- Evidence source, timestamp and review status are visible.
- Unsupported or incomplete records cannot be marked executable.

## 19.2 Compatibility

- Compatibility status and rationale are stored.
- Only `DIRECT_EQUIVALENT` pairs can use parity conversion.
- Ratios use safe rational/integer arithmetic.
- Suspended or stale relationships block new execution.
- Compatibility changes are auditable.

## 19.3 Quotes and conversion

- Quote contains input, output, ratio, fees, expiry and route.
- Expired or altered quotes are rejected.
- User eligibility and asset policy are checked.
- Output amount follows the approved ratio and fee rules.
- Duplicate execution is prevented.
- Transaction status reconciles with on-chain events.

## 19.4 Cross-chain phase

- Each route documents its trust model and verification method.
- Source finality is enforced.
- Replay protection and idempotency work.
- Destination mint/release cannot happen without accepted proof.
- Failed operations enter a documented recovery state.

## 19.5 Confidential phase

- Privacy boundaries are documented.
- No absolute anonymity claims are made.
- Key management and disclosure policies are specified.
- Only confirmed supported assets and flows are enabled.

## 19.6 Developer access

- API schemas and errors are documented.
- Read-only MCP tools expose only supported data.
- Write-capable agent permissions are bounded, revocable and auditable.

---

# 20. Testing strategy

## 20.1 Smart contracts

- Unit tests for registration, compatibility, ratios, fees and authorization.
- Property tests for arithmetic and conversion invariants.
- Negative tests for expired quotes, paused assets and unauthorized callers.
- Duplicate/replay tests.
- Pause and recovery tests.

## 20.2 Backend

- Adapter contract tests.
- Quote calculation tests.
- API authorization and rate-limit tests.
- Idempotency tests.
- Indexer reorg/retry tests.
- Reconciliation tests.
- Failure injection for RPC, issuer API and bridge outages.

## 20.3 Frontend

- Asset detail and comparison tests.
- Compatibility explanation tests.
- Quote display and expiry behavior.
- Wallet rejection and transaction failure.
- Pending, failed, completed and manual-review states.

## 20.4 Cross-chain

- Source confirmation delay.
- Invalid proof.
- Duplicate proof.
- Destination failure.
- Relayer downtime.
- Partial settlement.
- Refund/compensation path.

## 20.5 Security review

Before mainnet or real-asset use:

- Independent contract audit.
- Threat model review.
- Key-management review.
- Bridge/adapter trust review.
- API authorization review.
- Privacy/logging review.
- Operational recovery drill.

---

# 21. Team workstreams and ownership

| Workstream | Responsibilities | Deliverables |
|---|---|---|
| Product/protocol design | Requirements, user journeys, asset model, scope and risk decisions | Product spec, flows, decision log |
| RWA/issuer research | Claim structure, custody, issuer terms, eligibility and evidence | Issuer/asset dossiers |
| NEAR smart contracts | Registries, compatibility, policy, conversion and settlement state | Rust contracts, tests, deployment scripts |
| Backend/integrations | API, adapters, quote engine, indexer, reconciler and later solver integration | Services, OpenAPI, adapter contracts |
| Frontend | Wallet, catalog, comparison, quote, conversion and status UI | Working web app |
| Security/QA | Threat model, tests, invariant review, fault testing and release gates | Test reports and security checklist |
| Confidentiality research | Confidential execution, encryption, selective disclosure and privacy model | Architecture decision and prototype |

## Suggested initial task split

**Smart-contract engineer**
- Create NEAR workspace and CI.
- Implement issuer and asset registry.
- Implement compatibility registry.
- Implement conversion manager.
- Write unit and invariant tests.

**Backend engineer**
- Define database schema and OpenAPI specification.
- Implement catalog and compatibility APIs.
- Implement quote service and controlled test inventory.
- Implement indexer and transaction status endpoints.

**Frontend engineer**
- Build wallet connection.
- Build asset list and detail screens.
- Build comparison and compatibility status.
- Build quote preview and conversion confirmation.
- Build transaction status/history.

**Product/research owner**
- Define synthetic test asset units.
- Document issuer and transfer rules.
- Create issuer/asset dossier template.
- Maintain integration decision log and scope control.

**Security/QA owner**
- Define threat model and trust boundaries.
- Create negative and failure test cases.
- Review admin permissions and recovery paths.
- Gate release on acceptance criteria.

---

# 22. Suggested repository structure

A monorepo is recommended for the first team release because contracts, API types and frontend flows will evolve together.

```text
rwa-interoperability/
├── apps/
│   ├── web/                     # React + TypeScript frontend
│   ├── api/                     # REST API
│   ├── indexer/                 # NEAR event and transaction indexer
│   └── mcp/                     # Later: MCP server
│
├── contracts/
│   ├── registry/                # Issuer and asset registry
│   ├── compatibility/           # Compatibility relationships
│   ├── conversion/              # MVP parity conversion
│   ├── vault/                   # Controlled test inventory
│   └── settlement/               # Later: cross-chain state machine
│
├── packages/
│   ├── domain/                  # Shared domain types
│   ├── near-client/             # NEAR contract interaction
│   ├── adapters/                # Issuer/chain adapter interfaces
│   ├── quote-engine/             # Quote and fee calculations
│   └── api-types/               # Shared API schemas
│
├── docs/
│   ├── architecture/
│   ├── decisions/
│   ├── asset-dossiers/
│   ├── threat-model/
│   └── runbooks/
│
├── scripts/
├── tests/
└── README.md
```

The structure is illustrative. Keep the initial deployment and operational complexity small; add services and contract boundaries when there is a real need.

---

# 23. Technical stack direction

The exact stack should be finalized during Phase 0. A practical starting point:

| Layer | Direction | Notes |
|---|---|---|
| Smart contracts | Rust on NEAR | Use current NEAR-supported Rust tooling and standards |
| Frontend | React + TypeScript | Wallet integration and transaction status |
| Backend API | TypeScript/Node.js or Java/Spring Boot | Choose based on team capability; keep domain contracts language-neutral |
| Database | PostgreSQL | Registry metadata, quotes, audit and transaction state |
| Indexing | NEAR event/indexing infrastructure plus custom worker | Must support retries and reconciliation |
| Agent interface | TypeScript MCP server | Read-only first |
| External execution | NEAR Intents, Chain Signatures, bridge integrations | Only for validated routes |
| Confidential execution | Confidential Intents or separately evaluated confidential architecture | No assumed custom matcher support |
| Storage | Appropriate object/content storage for non-sensitive evidence and encrypted payload references | Define retention and integrity requirements |

Do not select a bridge, oracle, encryption scheme or storage network solely because it is available. Select it based on the exact trust and operational requirements of the use case.

---

# 24. Key decisions to resolve

The team should record a written decision for each item.

1. **Synthetic asset:** use test gold units or another simple claim with an unambiguous unit definition.
2. **Initial chain:** begin with two NEAR Testnet NEP-141 representations.
3. **Conversion model:** use a controlled, pre-funded test vault rather than an AMM.
4. **Admin model:** define who can register issuers, approve compatibility and pause assets.
5. **Eligibility:** use a simple allowlist in the MVP; preserve an adapter interface for future issuer checks.
6. **Evidence:** mark synthetic test assets as synthetic and unverified by design.
7. **Pricing:** use the approved unit ratio for direct equivalents; defer cross-asset market pricing.
8. **Liquidity:** decide who funds test inventory and how it is replenished.
9. **External chain:** choose only after bridge, signing and proof support have been verified.
10. **NEAR Intents:** keep optional until target assets and routes are confirmed supported.
11. **Confidentiality:** defer until the standard route works and a supported integration is confirmed.
12. **MCP:** begin read-only; define authorization before write operations.
13. **Protocol token:** no token is required for the MVP.
14. **Legal scope:** no live RWA activity until jurisdiction- and asset-specific legal review is complete.

---

# 25. Definition of done — first team milestone

The first milestone is ready for demonstration when:

- The repository builds from a clean checkout using documented commands.
- NEAR Testnet contracts deploy using environment-specific configuration.
- Two synthetic test representations and one compatibility relationship are registered.
- The web app displays both assets and explains their synthetic status and unit definition.
- A user can request a quote and see ratio, fees, expected output, expiry and warnings.
- A user can sign and execute a conversion.
- Output amounts match the configured ratio and fee rules.
- Unsupported, expired, suspended and unauthorized conversions are rejected.
- Transaction history and status reconcile with contract events.
- Automated tests cover normal, invalid and failure cases.
- A demo script, architecture diagram, known limitations and local setup guide are committed.

---

# 26. Risks and mitigations

| Risk | Why it matters | Initial mitigation |
|---|---|---|
| False asset equivalence | User may receive a materially different claim | Conservative compatibility classes, evidence and approval |
| Issuer failure or misrepresentation | Backing or redemption may fail | Due diligence, status labels and no backing guarantee |
| Transfer restriction mismatch | Recipient may not be eligible | Policy engine and issuer adapters |
| Cross-chain proof failure | Destination assets could be released incorrectly | Route-specific proofs, nonces, state machine and pause controls |
| Low liquidity | Quotes may be poor or unavailable | Controlled MVP inventory; honest no-route response |
| Stale pricing | User may receive poor execution | Timestamped sources, expiry and slippage limits |
| Confidentiality overclaim | Users misunderstand visibility | Plain-language privacy model |
| Contract vulnerability | Funds or state may be compromised | Testing, audit, least privilege and capped pilot |
| Regulatory uncertainty | Product may require authorization | Synthetic test assets until legal review |
| Over-scoping | Many incomplete modules delay proof | Phase gates and narrow MVP |
| Issuer integration failure | Core operations may not be available | Adapter capability discovery and explicit unsupported states |
| Agent misuse | Agent may initiate unintended transactions | Read-only first, bounded permissions and human approval |

---

# 27. Reference architecture and documentation

The following are starting points for technical discovery. Re-check current documentation, supported networks, API parameters, fees, service status and security assumptions before implementation.

## NEAR infrastructure

- [NEAR Developer Documentation](https://docs.near.org/)
- [NEAR Chain Signatures](https://docs.near.org/chain-abstraction/chain-signatures)
- [NEAR Omni Bridge Overview](https://docs.near.org/chain-abstraction/omnibridge/overview)
- [NEAR Intents Documentation](https://docs.near-intents.org/)
- [NEAR Intents Market Makers](https://docs.near-intents.org/integration/market-makers/introduction)
- [NEAR Intents Risk & Compliance](https://docs.near-intents.org/security-compliance/risk-and-compliance)
- [Confidential Intents](https://intents.near.org/confidential)
- [NEAR Confidential Intents — General Availability announcement](https://www.near.org/blog/announcing-general-availability-of-confidential-intents)
- [How Confidential Intents Works](https://www.near.org/blog/how-confidential-intents-works)

## Reference project

- [Unison](https://github.com/nichar3232/unison) — use the exact repository URL and license file identified by the team before relying on its implementation or licensing. The design inspiration to investigate includes parity conversion, inventory-aware pricing, confidential order matching and agent-facing interfaces. Do not assume its architecture maps directly onto NEAR.

## Integration facts that must remain explicit

- Chain Signatures provide external-chain transaction signing, not universal inbound-state verification.
- Bridge verification and trust assumptions vary by supported chain and route.
- NEAR Intents quote and settlement support must be confirmed for each custom RWA asset and route.
- Confidential Intents supports documented flows; arbitrary custom RWA assets and custom dark-pool logic must not be assumed.
- Confidential execution does not remove issuer restrictions, compliance obligations or legal review.
- A token's presence in the registry does not prove its backing, redemption or legal status.

---

# 28. Final product direction

Build a **NEAR-native RWA interoperability and settlement protocol** with a long-term vision across issuer compatibility, conversion, exchange, cross-chain movement, confidential execution and developer/agent access.

The protocol's defensibility should come from:

- A rigorous asset and issuer information model.
- A conservative, evidence-based compatibility framework.
- Reusable issuer and chain adapters.
- Reliable quote and settlement coordination.
- Explicit route trust assumptions and recovery.
- Carefully scoped privacy capabilities.
- A consistent API for applications and authorized agents.

Do not try to demonstrate every capability in the first release. First prove that two synthetic representations of the same precisely defined claim can be safely registered, compared, quoted, converted and reconciled.

Then add one external-chain route, one issuer adapter, one solver integration and one new asset category at a time. Confidential trading, confidential transfers, lifecycle services and agent execution should be introduced only after their dependencies, security assumptions and legal requirements are understood.

**The protocol should make legitimate RWA interoperability easier without pretending that different assets, issuers, legal claims or networks are interchangeable.**
