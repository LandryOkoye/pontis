// Landing page. Every claim on it is true of the MVP: testnet, synthetic assets, one approved
// pair. No invented volumes, partners or totals.
import {
  ArrowRight,
  ArrowUpRight,
  Ban,
  FileCheck2,
  KeyRound,
  RefreshCcw,
  Scale,
  ShieldCheck,
  Timer,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn.ts";
import { CLASSIFICATION } from "../lib/copy.ts";
import { groupDigits } from "../lib/format.ts";
import { useHealth } from "../lib/queries.ts";
import { useReveal } from "../lib/use-reveal.ts";

const PROBLEM = [
  {
    n: "01",
    icon: FileCheck2,
    title: "A ticker is not a claim",
    body: "Two tokens can share a name and still differ in legal rights, custody, redemption and issuer obligations. Pontis records the claim separately from every token that represents it.",
  },
  {
    n: "02",
    icon: Scale,
    title: "A ratio is not equivalence",
    body: "TGOLD-A has 6 decimals, TGOLD-B has 8, and one A is ten B. That arithmetic only matters after someone has decided the two are the same claim.",
  },
  {
    n: "03",
    icon: ShieldCheck,
    title: "Equivalence is a recorded decision",
    body: "A named approver classifies each pair with a rationale and a scope. The decision is versioned, append-only and can be suspended at once.",
  },
  {
    n: "04",
    icon: RefreshCcw,
    title: "The contract checks again",
    body: "Compatibility and the allowlist are checked at quote time and again on chain, so a suspended pair cannot execute on a stale quote.",
  },
];

const CLASSES = ["DIRECT_EQUIVALENT", "ECONOMICALLY_SIMILAR", "INCOMPATIBLE", "SUSPENDED"] as const;

const CLASS_ACCENT: Record<(typeof CLASSES)[number], string> = {
  DIRECT_EQUIVALENT: "text-em-400 border-em-400/40 bg-em-400/10",
  ECONOMICALLY_SIMILAR: "text-[#b7a4ff] border-[#b7a4ff]/35 bg-[#b7a4ff]/10",
  INCOMPATIBLE: "text-[#f27a63] border-[#f27a63]/35 bg-[#f27a63]/10",
  SUSPENDED: "text-[#f2ae52] border-[#f2ae52]/35 bg-[#f2ae52]/10",
};

const STEPS = [
  {
    icon: FileCheck2,
    title: "Discover",
    body: "Browse registered representations with their issuer, canonical claim, unit definition and evidence, each labelled by who produced it.",
  },
  {
    icon: Scale,
    title: "Compare",
    body: "Pick two tokens and read the classification, the rationale and the review history. If they cannot convert, you get the reason.",
  },
  {
    icon: Timer,
    title: "Quote",
    body: "The API checks compatibility, the allowlist and vault inventory, then signs a quote bound to your account for 60 seconds.",
  },
  {
    icon: KeyRound,
    title: "Sign",
    body: "Your wallet signs ft_transfer_call with the quote attached. The contract verifies everything again and pays out from the test vault, or refunds.",
  },
  {
    icon: RefreshCcw,
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

/** The mark and the full logo are the supplied brand files; never redrawn. */
function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/pontis-logo.png"
      alt="Pontis"
      width={895}
      height={252}
      className={cn("h-9 w-auto", className)}
    />
  );
}

function Nav() {
  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-5 pt-5 sm:px-8">
        <Link to="/" aria-label="Pontis home">
          <Logo />
        </Link>
        <nav
          aria-label="Sections"
          className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] p-1 text-[13px] text-em-100/70 backdrop-blur-xl lg:flex"
        >
          {NAV.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>
        <Link
          to="/app"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-em-400 px-5 text-[13px] font-medium text-forest transition hover:bg-em-300"
        >
          Launch app <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </header>
  );
}

/** A glass slab in the hero cluster. Position and tilt come from the caller. */
function Slab({
  className,
  style,
  delay = 0,
}: {
  className?: string;
  style?: CSSProperties;
  delay?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn("slab absolute animate-float", className)}
      style={{ animationDelay: `${delay}s`, ...style }}
    />
  );
}

function HeroArt() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[7%] mx-auto h-[62%] max-w-[1100px]"
      aria-hidden
    >
      <div className="absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(94_212_114/0.28),transparent)] blur-3xl" />
      {/* back row */}
      <Slab className="left-[12%] top-[6%] h-28 w-52 -rotate-[18deg] opacity-70" delay={0.4} />
      <Slab className="right-[10%] top-[2%] h-32 w-56 rotate-[14deg] opacity-80" delay={1.2} />
      <Slab className="left-[28%] top-[34%] h-24 w-44 rotate-[28deg] opacity-60" delay={2} />
      {/* front row */}
      <Slab className="left-[3%] top-[52%] h-32 w-60 rotate-[12deg]" delay={0.8} />
      <Slab className="right-[4%] top-[48%] h-28 w-52 -rotate-[22deg]" delay={1.6} />
      <Slab className="right-[26%] top-[66%] h-20 w-40 rotate-[8deg] opacity-80" delay={2.4} />
      <div className="absolute left-1/2 top-1/2 w-[min(46vw,340px)] -translate-x-1/2 -translate-y-1/2">
        <img
          src="/brand/pontis-mark.png"
          alt=""
          width={319}
          height={299}
          className="w-full animate-float drop-shadow-[0_30px_80px_rgb(94_212_114/0.5)]"
        />
      </div>
    </div>
  );
}

function HeroStat({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-[190px]", className)}>
      <p className="num text-2xl font-light text-white sm:text-3xl">{value}</p>
      <p className="mt-1 text-[12px] leading-snug text-em-100/55">{label}</p>
    </div>
  );
}

/** Light rounded panel stacked on the dark page, like the inspiration's white sheets. */
function Sheet({
  id,
  tone,
  children,
  className,
}: {
  id?: string;
  tone: "light" | "dark";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative mx-2 scroll-mt-4 overflow-hidden rounded-[32px] sm:mx-4 sm:rounded-[44px]",
        tone === "light" ? "bg-mist text-forest" : "border border-em-400/10 bg-forest-2 text-white",
        className,
      )}
    >
      <div className="mx-auto max-w-[1320px] px-5 py-20 sm:px-10 sm:py-28">{children}</div>
    </section>
  );
}

function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.18em]",
        light ? "text-em-700" : "text-em-400",
      )}
    >
      <span aria-hidden>( </span>
      {children}
      <span aria-hidden> )</span>
    </p>
  );
}

/** An arch in the logo's greens linking two token piers. Specimen, not live data. */
function ParityArch() {
  return (
    <svg
      viewBox="0 0 600 220"
      role="img"
      aria-label="TGOLD-A linked to TGOLD-B at 1 to 10"
      className="h-auto w-full"
    >
      <defs>
        <linearGradient id="arch-g" x1="0" x2="1">
          <stop offset="0" stopColor="#20905e" />
          <stop offset="0.5" stopColor="#7be495" />
          <stop offset="1" stopColor="#20905e" />
        </linearGradient>
        <radialGradient id="arch-glow">
          <stop offset="0" stopColor="#5ed472" stopOpacity="0.35" />
          <stop offset="1" stopColor="#5ed472" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="300" cy="80" rx="230" ry="90" fill="url(#arch-glow)" />
      <path d="M40 160H560" stroke="#3daf67" strokeOpacity="0.35" />
      <path
        d="M90 160C90 30 510 30 510 160"
        fill="none"
        stroke="url(#arch-g)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M90 160C90 30 510 30 510 160"
        fill="none"
        stroke="#d9f7e2"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="4 44"
        className="animate-flow"
      />
      {[90, 510].map((x, i) => (
        <g key={x}>
          <rect
            x={x - 6}
            y="160"
            width="12"
            height="36"
            rx="3"
            fill="#0f5233"
            stroke="#3daf67"
            strokeOpacity="0.6"
          />
          <circle cx={x} cy="160" r="7" fill="#040806" stroke="#7be495" strokeWidth="2" />
          <text
            x={x}
            y="214"
            textAnchor="middle"
            fill="#d9f7e2"
            fontSize="13"
            className="font-mono"
          >
            {i === 0 ? "TGOLD-A" : "TGOLD-B"}
          </text>
        </g>
      ))}
      <rect
        x="246"
        y="52"
        width="108"
        height="32"
        rx="16"
        fill="#040806"
        stroke="#7be495"
        strokeOpacity="0.7"
      />
      <text x="300" y="73" textAnchor="middle" fill="#7be495" fontSize="14" className="font-mono">
        1 : 10
      </text>
    </svg>
  );
}

/** A static specimen of the quote ticket, using the deployed pair's real ratio and fee. */
function TicketSpecimen() {
  return (
    <div
      className="relative w-full max-w-sm rotate-[1.5deg] overflow-hidden rounded-[28px] border border-em-400/25 bg-forest text-white shadow-[0_60px_100px_-40px_rgb(7_60_40/0.9)]"
      aria-label="Example of a signed quote"
    >
      <div
        className="absolute -right-16 -top-16 size-48 rounded-full bg-em-400/25 blur-3xl"
        aria-hidden
      />
      <div className="relative flex items-center justify-between p-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-em-400">
            Signed quote · specimen
          </p>
          <p className="mt-1 text-[13px] text-em-100/60">Bound to alice.testnet</p>
        </div>
        <svg viewBox="0 0 48 48" className="size-14 -rotate-90" aria-label="42 seconds left">
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="#15683f"
            strokeWidth="3"
            strokeOpacity="0.5"
          />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="#5ed472"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${(42 / 60) * 125.66} 125.66`}
          />
        </svg>
      </div>
      <div className="mx-6 h-px bg-[linear-gradient(to_right,rgb(94_212_114/0.4)_50%,transparent_50%)] bg-[length:10px_1px]" />
      <div className="relative p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-em-100/50">
          You receive
        </p>
        <p className="num mt-1 text-[34px] font-light leading-tight">
          9<span className="text-em-400">.99</span>{" "}
          <span className="text-base text-em-100/60">TGOLD-B</span>
        </p>
        <dl className="mt-5 space-y-2.5 text-[13px]">
          {[
            ["You send", "1 TGOLD-A"],
            ["Approved ratio", "1 A = 10 B"],
            ["Protocol fee (0.10%)", "− 0.01 TGOLD-B"],
            ["Route", "Test vault · async"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-em-100/55">{k}</dt>
              <dd className="num">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Stat({
  eyebrow,
  value,
  unit,
  body,
  className,
}: {
  eyebrow: string;
  value: string;
  unit?: string;
  body: string;
  className?: string;
}) {
  return (
    <div className={cn("reveal rounded-[28px] border border-em-900/10 bg-white p-7", className)}>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-em-700">{eyebrow}</p>
      <p className="mt-5 text-[72px] font-light leading-none tracking-tight text-em-900">
        {value}
        {unit && <span className="ml-1 text-2xl text-em-600">{unit}</span>}
      </p>
      <p className="mt-4 text-[15px] text-forest/65">{body}</p>
    </div>
  );
}

export function Landing() {
  const root = useReveal<HTMLDivElement>();
  const health = useHealth();

  return (
    <div id="top" ref={root} className="relative overflow-x-clip bg-forest pb-2 text-white sm:pb-4">
      {/* HERO */}
      <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        <div
          className="em-grid absolute inset-0 -z-10 [mask-image:radial-gradient(75%_65%_at_50%_35%,black,transparent)]"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-[linear-gradient(to_top,rgb(15_82_51/0.45),transparent)]"
          aria-hidden
        />
        <Nav />
        <HeroArt />

        <div className="relative mx-auto flex w-full max-w-[1320px] flex-1 flex-col justify-between px-5 pb-10 pt-28 sm:px-8 sm:pb-14">
          <div className="flex items-start justify-between">
            <HeroStat value="0" label="Keys held by the backend. Your wallet signs everything." />
            <HeroStat
              value="60 s"
              label="Lifetime of a signed quote, bound to your account"
              className="text-right"
            />
          </div>

          <div className="mt-[44vh] flex flex-col justify-between gap-10 lg:mt-[40vh] lg:flex-row lg:items-end">
            <h1 className="animate-rise text-[52px] font-light leading-[0.95] tracking-[-0.04em] sm:text-[84px] lg:text-[112px]">
              Same claim.
              <br />
              <span className="text-em-grad">One approved way across.</span>
            </h1>
            <div className="max-w-sm animate-rise pb-2 [animation-delay:120ms]">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-em-400/30 bg-em-400/10 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-em-300">
                <span className="size-1.5 animate-pulse-soft rounded-full bg-em-400" aria-hidden />
                NEAR Testnet · synthetic assets only
              </div>
              <p className="text-[15px] leading-relaxed text-em-100/65">
                Pontis is a NEAR protocol for parity conversion between token representations of the
                same real-world-asset claim. It never infers equivalence from a ticker, a price or a
                unit ratio. Someone has to approve it, on the record.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/app"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-em-400 px-6 text-[15px] font-medium text-forest transition hover:bg-em-300"
                >
                  Launch the testnet app <ArrowRight className="size-4" aria-hidden />
                </Link>
                <a
                  href="#how"
                  className="inline-flex h-12 items-center rounded-full border border-white/15 px-6 text-[15px] transition hover:border-em-400/60"
                >
                  How it works
                </a>
              </div>
            </div>
          </div>

          <p className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-em-100/45">
            <span className="flex items-center gap-2">
              <span className="size-1.5 animate-pulse-soft rounded-full bg-em-400" aria-hidden />
              pontis-core.pontis.testnet
            </span>
            {typeof health.data?.chainHeight === "number" && (
              <span>block {groupDigits(String(health.data.chainHeight))}</span>
            )}
            <span>TGOLD-A ⇄ TGOLD-B · DIRECT_EQUIVALENT · approved</span>
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:gap-4">
        {/* PROBLEM */}
        <Sheet id="problem" tone="light">
          <div className="reveal flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <Eyebrow light>Why Pontis</Eyebrow>
              <h2 className="mt-5 text-[40px] font-light leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
                The same gold, issued twice, is{" "}
                <span className="text-em-600">two different tokens.</span>
              </h2>
            </div>
            <p className="max-w-sm text-forest/65">
              Tokenized assets fragment across issuers, each with its own contract, decimals and
              terms. Before two of them can be treated as one, these things have to be true.
            </p>
          </div>
          <ol className="mt-14 grid overflow-hidden rounded-[28px] border border-em-900/10 bg-em-900/10 sm:grid-cols-2 gap-px">
            {PROBLEM.map((item, i) => (
              <li
                key={item.n}
                className="reveal flex min-h-[280px] flex-col justify-between bg-mist p-7 sm:p-9"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="flex items-start justify-between">
                  <span className="font-mono text-xs text-em-700">({item.n})</span>
                  <span className="slab grid size-14 place-items-center !rounded-2xl text-white">
                    <item.icon className="size-6" aria-hidden />
                  </span>
                </div>
                <div className="mt-10">
                  <h3 className="text-2xl font-medium tracking-tight">{item.title}</h3>
                  <p className="mt-3 max-w-md text-[15px] text-forest/65">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Sheet>

        {/* FRAMEWORK */}
        <Sheet id="framework" tone="dark">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="reveal">
              <Eyebrow>The compatibility framework</Eyebrow>
              <h2 className="mt-5 text-[40px] font-light leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
                Four answers. <span className="text-em-grad">Only one converts.</span>
              </h2>
              <p className="mt-6 max-w-lg text-em-100/65">
                Every pair of representations gets exactly one classification. A parity conversion
                runs only for an approved direct equivalent between two active assets, checked at
                quote time and again on chain.
              </p>
            </div>
            <div className="reveal glass-card p-6 sm:p-10">
              <ParityArch />
              <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-em-400/15 bg-em-400/15 text-left sm:grid-cols-3">
                {[
                  ["TGOLD-A", "Synthetic Issuer A · 6 decimals"],
                  ["SYN-GOLD-OZ", "One fictional troy ounce, the shared claim"],
                  ["TGOLD-B", "Synthetic Issuer B · 8 decimals"],
                ].map(([t, s]) => (
                  <div key={t} className="bg-forest-2 p-4">
                    <p className="num text-sm">{t}</p>
                    <p className="mt-1 text-xs text-em-100/50">{s}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {CLASSES.map((key, i) => {
              const meta = CLASSIFICATION[key];
              return (
                <article
                  key={key}
                  className="reveal glass-card flex flex-col p-6"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <span
                    className={cn(
                      "inline-flex h-7 w-fit items-center rounded-full border px-3 text-[11.5px] font-medium",
                      CLASS_ACCENT[key],
                    )}
                  >
                    {meta.short}
                  </span>
                  <h3 className="mt-6 text-xl font-medium">{meta.label}</h3>
                  <p className="mt-2 text-sm text-em-100/60">{meta.meaning}</p>
                </article>
              );
            })}
          </div>
        </Sheet>

        {/* HOW */}
        <Sheet
          id="how"
          tone="dark"
          className="bg-[radial-gradient(80%_60%_at_50%_100%,rgb(15_82_51/0.55),transparent),var(--color-forest)]"
        >
          <div className="reveal mx-auto max-w-3xl text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-5 text-[40px] font-light leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
              From registry to <span className="text-em-grad">reconciled receipt.</span>
            </h2>
          </div>
          <div className="relative mt-20">
            <div
              className="absolute inset-x-0 top-[46px] hidden h-px bg-[linear-gradient(90deg,transparent,rgb(94_212_114/0.7),transparent)] lg:block"
              aria-hidden
            />
            <ol className="grid gap-5 lg:grid-cols-5">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className={cn("reveal relative", i % 2 === 1 && "lg:mt-16")}
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <span className="slab mb-5 grid size-[92px] place-items-center !rounded-[26px] text-white">
                    <step.icon className="size-7" aria-hidden />
                  </span>
                  <div className="glass-card p-5">
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-em-400">
                      Step {i + 1}
                    </p>
                    <h3 className="mt-2 text-xl font-medium">{step.title}</h3>
                    <p className="mt-2 text-[14px] text-em-100/60">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Sheet>

        {/* GUARANTEES */}
        <Sheet id="guarantees" tone="light">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
            <div>
              <div className="reveal max-w-2xl">
                <Eyebrow light>Guarantees</Eyebrow>
                <h2 className="mt-5 text-[40px] font-light leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
                  Boring arithmetic. <span className="text-em-600">On purpose.</span>
                </h2>
              </div>
              <div className="mt-12 grid gap-4 sm:grid-cols-2">
                <div className="reveal rounded-[28px] bg-em-900 p-7 text-white sm:col-span-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-em-400">
                    Arithmetic
                  </p>
                  <p className="mt-4 text-[32px] font-light leading-tight tracking-tight sm:text-[48px]">
                    net = ⌊ in × ratio ⌋ − ⌈ fee ⌉
                  </p>
                  <p className="mt-4 max-w-xl text-em-100/65">
                    Amounts are u128 in the contract and bigint everywhere else. Output is rounded
                    down, the fee rounded up, and the same test vectors are checked in Rust and
                    TypeScript.
                  </p>
                </div>
                <Stat
                  eyebrow="Protocol fee, test deployment"
                  value="10"
                  unit="bps"
                  body="Taken from the output token and shown on every quote."
                />
                <Stat
                  eyebrow="If anything fails"
                  value="Refund"
                  body="Failed validation or a failed payout returns the full input and emits an event."
                />
              </div>
            </div>
            <div className="reveal flex justify-center lg:sticky lg:top-8">
              <TicketSpecimen />
            </div>
          </div>
        </Sheet>

        {/* LIMITS */}
        <Sheet id="limits" tone="dark">
          <div className="reveal max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#f2ae52]">
              ( Read this part )
            </p>
            <h2 className="mt-5 text-[40px] font-light leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
              What Pontis is not, <span className="text-em-grad">yet or ever.</span>
            </h2>
            <p className="mt-6 text-lg text-em-100/65">
              This is a first milestone that proves the accounting and the failure handling with
              fictional assets. It is honest about its edges.
            </p>
          </div>
          <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {NOT.map((item, i) => (
              <li
                key={item.title}
                className="reveal rounded-[28px] border border-dashed border-[#f2ae52]/35 bg-[#f2ae52]/[0.04] p-6"
                style={{ transitionDelay: `${i * 70}ms` }}
              >
                <Ban className="size-5 text-[#f2ae52]" aria-hidden />
                <h3 className="mt-4 text-lg font-medium">{item.title}</h3>
                <p className="mt-2 text-sm text-em-100/60">{item.body}</p>
              </li>
            ))}
          </ul>
          <div className="reveal mt-10 flex flex-wrap items-center gap-2">
            <span className="mr-2 font-mono text-[11px] uppercase tracking-[0.16em] text-em-100/45">
              Not built in this milestone
            </span>
            {LATER.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 px-3 py-1 text-[12px] text-em-100/70"
              >
                {item}
              </span>
            ))}
          </div>
        </Sheet>
      </div>

      {/* CTA + FOOTER */}
      <footer className="relative isolate mt-2 overflow-hidden sm:mt-4">
        <div
          className="absolute inset-x-0 top-0 -z-10 mx-auto h-[560px] w-[900px] max-w-full rounded-full bg-[radial-gradient(closest-side,rgb(94_212_114/0.22),transparent)] blur-2xl"
          aria-hidden
        />
        <div className="reveal mx-auto max-w-[1320px] px-5 pb-16 pt-28 text-center sm:px-8">
          <h2 className="mx-auto max-w-4xl text-[48px] font-light leading-[0.98] tracking-[-0.04em] sm:text-[88px]">
            Walk the span <span className="text-em-grad">yourself.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-em-100/65">
            Get test tokens from the faucet, request a signed quote and watch it settle and
            reconcile.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              to="/app/convert"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-em-400 px-6 text-[15px] font-medium text-forest transition hover:bg-em-300"
            >
              Start a conversion <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              to="/app/assets"
              className="inline-flex h-12 items-center rounded-full border border-white/15 px-6 text-[15px] transition hover:border-em-400/60"
            >
              Browse the registry
            </Link>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1320px] flex-col gap-6 border-t border-white/10 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
          <p className="max-w-xl text-[13px] text-em-100/45">
            Testnet and synthetic assets only. Nothing here claims real backing, custody or
            verification, and nothing here is an offer of any financial product.
          </p>
          <nav aria-label="Footer" className="flex gap-6 text-sm text-em-100/65">
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

        {/* Oversized wordmark bleeding off the bottom edge, as in the inspiration. */}
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
