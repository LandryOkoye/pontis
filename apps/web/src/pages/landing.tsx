// Landing page. Every claim on it is true of the MVP: testnet, synthetic assets, one approved
// pair. No invented volumes, partners or totals.
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Span } from "../components/span.tsx";
import { cn } from "../lib/cn.ts";
import { CLASSIFICATION } from "../lib/copy.ts";
import { groupDigits } from "../lib/format.ts";
import { useHealth } from "../lib/queries.ts";

const PROBLEM = [
  {
    title: "A ticker is not a claim",
    body: "Two tokens can share a name and still differ in legal rights, custody, redemption and issuer obligations. Pontis records the claim separately from every token that represents it.",
  },
  {
    title: "A ratio is not equivalence",
    body: "TGOLD-A has 6 decimals, TGOLD-B has 8, and one A is ten B. That arithmetic only matters after someone has decided the two are the same claim.",
  },
  {
    title: "Equivalence is a recorded decision",
    body: "A named approver classifies each pair with a rationale and a scope. The decision is versioned, append-only and can be suspended at once.",
  },
  {
    title: "The contract checks again",
    body: "Compatibility and the allowlist are checked at quote time and again on chain, so a suspended pair cannot execute on a stale quote.",
  },
];

const CLASSES = ["DIRECT_EQUIVALENT", "ECONOMICALLY_SIMILAR", "INCOMPATIBLE", "SUSPENDED"] as const;

const CLASS_DOT: Record<(typeof CLASSES)[number], string> = {
  DIRECT_EQUIVALENT: "bg-gold",
  ECONOMICALLY_SIMILAR: "bg-similar",
  INCOMPATIBLE: "bg-danger",
  SUSPENDED: "bg-warn",
};

const STEPS = [
  {
    title: "Discover",
    body: "Browse registered representations with their issuer, canonical claim, unit definition and evidence, each labelled by who produced it.",
  },
  {
    title: "Compare",
    body: "Pick two tokens and read the classification, the rationale and the review history. If they cannot convert, you get the reason.",
  },
  {
    title: "Quote",
    body: "The API checks compatibility, the allowlist and vault inventory, then signs a quote bound to your account for 60 seconds.",
  },
  {
    title: "Sign",
    body: "Your wallet signs ft_transfer_call with the quote attached. The contract verifies everything again and pays out from the test vault, or refunds.",
  },
  {
    title: "Reconcile",
    body: "An indexer reads the contract events and a reconciler checks them against what was expected and against vault balances.",
  },
];

const NOT = [
  { title: "Not a bridge", body: "Both tokens live on NEAR Testnet. Nothing crosses chains." },
  {
    title: "Not an exchange",
    body: "There is no market price. The ratio comes from the unit multipliers of an approved pair.",
  },
  {
    title: "Not real assets",
    body: "SYN-GOLD-OZ is a fictional claim. The tokens are unbacked and have no value.",
  },
  {
    title: "Not verified",
    body: "All evidence is self-attested by the project. No third party has checked anything.",
  },
];

const LATER = [
  "Cross-chain routes",
  "Market-priced exchange",
  "Confidential execution",
  "Multiple solvers",
  "Agent-initiated transactions",
  "Real-world assets",
];

const NAV = [
  ["Why", "#problem"],
  ["Framework", "#framework"],
  ["How it works", "#how"],
  ["Guarantees", "#guarantees"],
  ["Limits", "#limits"],
] as const;

const WRAP = "mx-auto w-full max-w-[1160px] px-5 sm:px-8";
const H2 = "text-[30px] font-medium leading-[1.12] tracking-[-0.025em] sm:text-[40px]";

function Nav() {
  return (
    <header className={cn(WRAP, "flex h-[72px] items-center gap-10")}>
      <Link to="/" aria-label="Pontis home" className="shrink-0">
        {/* The supplied brand file; never redrawn. */}
        <img
          src="/brand/pontis-logo.png"
          alt="Pontis"
          width={895}
          height={252}
          className="h-8 w-auto"
        />
      </Link>
      <nav
        aria-label="Sections"
        className="hidden items-center gap-7 text-[13.5px] text-muted md:flex"
      >
        {NAV.map(([label, href]) => (
          <a key={href} href={href} className="transition-colors hover:text-text">
            {label}
          </a>
        ))}
      </nav>
      <Link
        to="/app"
        className="ml-auto inline-flex h-9 items-center rounded-md border border-line-strong bg-panel-2 px-4 text-[13.5px] font-medium transition-colors hover:bg-panel-3"
      >
        Launch app
      </Link>
    </header>
  );
}

function Section({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line">
      <div className={cn(WRAP, "py-20 sm:py-28", className)}>{children}</div>
    </section>
  );
}

function Lead({
  label,
  title,
  body,
  center,
}: {
  label: string;
  title: ReactNode;
  body?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-[620px]", center && "mx-auto text-center")}>
      <p className="text-[13.5px] text-gold">{label}</p>
      <h2 className={cn(H2, "mt-3")}>{title}</h2>
      {body && <p className="mt-4 text-[16px] leading-relaxed text-muted">{body}</p>}
    </div>
  );
}

/** A static specimen of the quote ticket, using the deployed pair's real ratio and fee. */
function TicketSpecimen() {
  return (
    <div
      className="w-full rounded-xl border border-line-strong bg-panel"
      aria-label="Example of a signed quote"
    >
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <p className="text-sm font-medium">Signed quote</p>
          <p className="mt-0.5 text-[13px] text-faint">Specimen · bound to alice.testnet</p>
        </div>
        <p className="num text-[13px] text-muted">
          Expires in <span className="text-text">42 s</span>
        </p>
      </div>
      <div className="px-6 py-5">
        <p className="text-[13px] text-faint">You receive</p>
        <p className="num mt-1 text-[32px] font-medium leading-tight tracking-tight">
          9.99 <span className="text-base font-normal text-muted">TGOLD-B</span>
        </p>
        <dl className="mt-5 divide-y divide-line border-t border-line text-[13.5px]">
          {[
            ["You send", "1 TGOLD-A"],
            ["Approved ratio", "1 A = 10 B"],
            ["Protocol fee (0.10%)", "− 0.01 TGOLD-B"],
            ["Route", "Test vault · async"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="num">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function Landing() {
  const health = useHealth();

  return (
    <div id="top" className="relative overflow-x-clip bg-ink text-text">
      <Nav />

      {/* HERO */}
      <section className={cn(WRAP, "pb-20 pt-14 sm:pb-28 sm:pt-20")}>
        <div className="mx-auto max-w-[760px] text-center">
          <h1 className="text-[40px] font-medium leading-[1.06] tracking-[-0.035em] sm:text-[64px]">
            Same claim.
            <br />
            One approved way across.
          </h1>
          <p className="mx-auto mt-6 max-w-[600px] text-[16px] leading-relaxed text-muted sm:text-[17px]">
            Pontis is a NEAR protocol for parity conversion between token representations of the
            same real-world-asset claim. Equivalence is never inferred. Someone has to approve it,
            on the record.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link
              to="/app"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-gold px-5 text-[14.5px] font-medium text-gold-ink transition-colors hover:bg-[#74dc85]"
            >
              Launch the testnet app <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a href="#how" className="link text-[14.5px]">
              How it works
            </a>
          </div>
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-faint">
            <span>NEAR Testnet</span>
            <span aria-hidden>·</span>
            <span>Synthetic assets only</span>
            {typeof health.data?.chainHeight === "number" && (
              <>
                <span aria-hidden>·</span>
                <span className="num">Block {groupDigits(String(health.data.chainHeight))}</span>
              </>
            )}
          </p>
        </div>

        <Link
          to="/app"
          aria-label="Open the Pontis app"
          className="mt-14 block overflow-hidden rounded-xl border border-line-strong bg-panel sm:mt-20"
        >
          <img
            src="/landing/app-markets.png"
            alt="The Pontis Markets screen: registered representations with synthetic market data, the open TGOLD-A to TGOLD-B route and recent conversions"
            width={2880}
            height={1800}
            className="block w-full"
          />
        </Link>
      </section>

      {/* STATEMENT */}
      <section className={cn(WRAP, "pb-20 sm:pb-28")}>
        <p className="mx-auto max-w-[820px] text-center text-[24px] font-medium leading-[1.3] tracking-[-0.02em] sm:text-[32px]">
          The same gold, issued twice, is two different tokens.{" "}
          <span className="text-faint">
            Pontis records when they are the same claim, and converts only then.
          </span>
        </p>
      </section>

      {/* PROBLEM */}
      <Section id="problem">
        <Lead
          center
          label="Why Pontis"
          title="Four things have to be true first"
          body="Tokenized assets fragment across issuers, each with its own contract, decimals and terms. Before two of them can be treated as one, this is what has to hold."
        />
        <ol className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {PROBLEM.map((item, i) => (
            <li key={item.title} className="bg-ink p-6">
              <p className="num text-[13px] text-faint">0{i + 1}</p>
              <h3 className="mt-8 text-[16px] font-medium">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* FRAMEWORK */}
      <Section id="framework">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Lead
            label="The compatibility framework"
            title="Four answers. Only one converts."
            body="Every pair of representations gets exactly one classification. A parity conversion runs only for an approved direct equivalent between two active assets, checked at quote time and again on chain."
          />
          <div className="rounded-xl border border-line bg-panel">
            <div className="px-6 pb-6 pt-8 sm:px-8">
              <Span from="TGOLD-A" to="TGOLD-B" state="DIRECT_EQUIVALENT" keystone="1 : 10" />
            </div>
            <dl className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
              {[
                ["TGOLD-A", "Synthetic Issuer A · 6 decimals"],
                ["SYN-GOLD-OZ", "One fictional troy ounce, the shared claim"],
                ["TGOLD-B", "Synthetic Issuer B · 8 decimals"],
              ].map(([t, s]) => (
                <div key={t} className="bg-panel p-4 first:rounded-bl-xl last:rounded-br-xl">
                  <dt className="num text-[13.5px] font-medium">{t}</dt>
                  <dd className="mt-1 text-[12.5px] text-faint">{s}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-14 overflow-hidden rounded-xl border border-line">
          {CLASSES.map((key) => {
            const meta = CLASSIFICATION[key];
            const converts = key === "DIRECT_EQUIVALENT";
            return (
              <div
                key={key}
                className="grid gap-x-8 gap-y-1 border-b border-line px-6 py-5 last:border-0 md:grid-cols-[220px_1fr_150px] md:items-baseline"
              >
                <h3 className="flex items-center gap-2.5 text-[15px] font-medium">
                  <span className={cn("size-2 rounded-full", CLASS_DOT[key])} aria-hidden />
                  {meta.label}
                </h3>
                <p className="text-[14px] leading-relaxed text-muted">{meta.meaning}</p>
                <p
                  className={cn(
                    "text-[13.5px] md:text-right",
                    converts ? "text-gold" : "text-faint",
                  )}
                >
                  {converts ? "Converts at parity" : "Does not convert"}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* HOW */}
      <Section id="how">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="lg:sticky lg:top-10 lg:self-start">
            <Lead
              label="How it works"
              title="From registry to reconciled receipt"
              body="Five steps, each one visible in the app. Nothing happens on your behalf: the backend holds no keys and your wallet signs everything."
            />
          </div>
          <ol className="border-t border-line">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="grid grid-cols-[40px_1fr] gap-x-4 border-b border-line py-6 sm:grid-cols-[40px_140px_1fr]"
              >
                <span className="num text-[13px] leading-6 text-faint">0{i + 1}</span>
                <h3 className="text-[16px] font-medium">{step.title}</h3>
                <p className="col-start-2 mt-1 text-[14px] leading-relaxed text-muted sm:col-start-3 sm:mt-0">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* GUARANTEES */}
      <Section id="guarantees">
        <Lead
          label="Guarantees"
          title="Boring arithmetic, on purpose"
          body="Amounts are u128 in the contract and bigint everywhere else. Output is rounded down, the fee rounded up, and the same test vectors are checked in Rust and TypeScript."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="border-b border-line px-6 py-8 sm:px-8">
              <p className="text-[13px] text-faint">Arithmetic</p>
              <p className="mt-3 font-mono text-[20px] tracking-tight sm:text-[28px]">
                net = ⌊ in × ratio ⌋ − ⌈ fee ⌉
              </p>
            </div>
            <dl className="grid gap-px bg-line sm:grid-cols-2">
              {[
                [
                  "Protocol fee, test deployment",
                  "10 bps",
                  "Taken from the output token and shown on every quote.",
                ],
                [
                  "Lifetime of a signed quote",
                  "60 s",
                  "Bound to your account, the amounts and the expiry.",
                ],
                [
                  "If anything fails",
                  "Refund",
                  "Failed validation or a failed payout returns the full input and emits an event.",
                ],
                ["Keys held by the backend", "0", "Your wallet signs every transaction."],
              ].map(([k, v, body]) => (
                <div key={k} className="bg-ink px-6 py-6 sm:px-8">
                  <dt className="text-[13px] text-faint">{k}</dt>
                  <dd className="mt-2">
                    <span className="num text-[28px] font-medium tracking-tight">{v}</span>
                    <span className="mt-1.5 block text-[14px] leading-relaxed text-muted">
                      {body}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <TicketSpecimen />
        </div>
      </Section>

      {/* LIMITS */}
      <Section id="limits">
        <Lead
          label="Limits"
          title="What Pontis is not, yet or ever"
          body="This is a first milestone that proves the accounting and the failure handling with fictional assets. It is honest about its edges."
        />
        <ul className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {NOT.map((item) => (
            <li key={item.title} className="bg-ink p-6">
              <h3 className="text-[16px] font-medium">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[14px] leading-relaxed text-faint">
          Not built in this milestone: <span className="text-muted">{LATER.join(", ")}.</span>
        </p>
      </Section>

      {/* CTA + FOOTER */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1320px] px-5 pb-16 pt-28 text-center sm:px-8">
          <h2 className="mx-auto max-w-4xl text-[48px] font-light leading-[0.98] tracking-[-0.04em] sm:text-[88px]">
            Walk the span yourself.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
            Get test tokens from the faucet, request a signed quote and watch it settle and
            reconcile.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              to="/app/convert"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-gold px-6 text-[15px] font-medium text-gold-ink transition-colors hover:bg-[#74dc85]"
            >
              Start a conversion <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              to="/app/assets"
              className="inline-flex h-12 items-center rounded-full border border-white/15 px-6 text-[15px] transition-colors hover:border-white/40"
            >
              Browse the registry
            </Link>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1320px] flex-col gap-6 border-t border-white/10 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
          <p className="max-w-xl text-[13px] text-faint">
            Testnet and synthetic assets only. Nothing here claims real backing, custody or
            verification, and nothing here is an offer of any financial product.
          </p>
          <nav aria-label="Footer" className="flex gap-6 text-sm text-muted">
            <Link to="/app" className="hover:text-white">
              App
            </Link>
            <Link to="/app/assets" className="hover:text-white">
              Registry
            </Link>
            <Link to="/app/compare" className="hover:text-white">
              Compare
            </Link>
            <a href="#top" className="hover:text-white">
              Back to top
            </a>
          </nav>
        </div>

        {/* Oversized wordmark bleeding off the bottom edge. */}
        <div className="mx-auto mt-4 max-w-[1320px] overflow-hidden px-5 sm:px-8" aria-hidden>
          <img
            src="/brand/pontis-logo.png"
            alt=""
            className="mx-auto -mb-[4%] w-full select-none opacity-95"
          />
        </div>
      </footer>
    </div>
  );
}
