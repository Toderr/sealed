import Link from "next/link";
import GlobalBackground from "@/components/GlobalBackground";
import { SealedMark } from "@/components/SealedLogo";

const PROGRAM_ID = "3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ";

// Linear display-scale inline styles. Weights and tracking don't fit neatly
// into Tailwind utilities, so we keep them as typed style objects per section.
const headlineStyle: React.CSSProperties = {
  fontWeight: 510,
  letterSpacing: "-0.044em", // ≈ -2.1px at 48px
  lineHeight: 1.02,
};
const h2Style: React.CSSProperties = {
  fontWeight: 510,
  letterSpacing: "-0.022em",
  lineHeight: 1.08,
};
const h3Style: React.CSSProperties = {
  fontWeight: 590,
  letterSpacing: "-0.012em",
  lineHeight: 1.25,
};

export default function Landing() {
  return (
    <div className="relative min-h-screen bg-background text-foreground isolate">
      <GlobalBackground />
      <div className="relative z-10">
        <SiteHeader />
        <main>
          <Hero />
          <TrustStrip />
          <Problem />
          <Solution />
          <HowItWorks />
          <TeamTrust />
          <FinalCTA />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-card-border-subtle bg-panel/85 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 group text-primary"
          aria-label="Sealed Agent home"
        >
          <SealedMark size={28} />
          <span
            className="text-[15px] tracking-tight"
            style={{ fontWeight: 510 }}
          >
            Sealed Agent
          </span>
        </Link>
        <nav
          className="hidden md:flex items-center gap-6 text-[13px] text-muted"
          style={{ fontWeight: 510 }}
        >
          <a href="#how" className="hover:text-primary transition-colors">
            How it works
          </a>
          <a href="#solution" className="hover:text-primary transition-colors">
            Product
          </a>
          <a href="#team" className="hover:text-primary transition-colors">
            Team
          </a>
        </nav>
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 h-8 text-[13px] text-white hover:bg-accent-hover transition-colors"
          style={{ fontWeight: 510 }}
        >
          Open app
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 pt-10 sm:pt-14 pb-10 sm:pb-14">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-card-border bg-[rgba(255,255,255,0.02)] px-3 py-1 text-[12px] text-foreground"
            style={{ fontWeight: 510 }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 motion-safe:animate-ping"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success"></span>
            </span>
            Live on Solana devnet
          </span>
          <h1
            className="mt-6 text-4xl sm:text-5xl md:text-[64px] text-primary"
            style={headlineStyle}
          >
            Don&apos;t trust promises.
            <br className="hidden sm:block" />
            <span className="text-accent"> Seal the deal.</span>
          </h1>
          <p className="mt-6 text-[17px] sm:text-[18px] text-foreground max-w-2xl leading-relaxed">
            An AI agent negotiates, escrows, and releases payment for your
            business deals on Solana. No bank. No lawyer. No leap of faith.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 h-11 text-[14px] text-white hover:bg-accent-hover transition-colors"
              style={{ fontWeight: 510 }}
            >
              Start a deal
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-card-border bg-[rgba(255,255,255,0.02)] px-5 h-11 text-[14px] text-primary hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              style={{ fontWeight: 510 }}
            >
              See how it works
            </a>
          </div>

          <dl className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 max-w-2xl">
            <Stat label="Smart contract" value="Anchor" hint="Audited pattern" />
            <Stat label="Settlement" value="USDC" hint="Stablecoin rails" />
            <Stat label="Chain" value="Solana" hint="~400ms finality" />
            <Stat label="Custody" value="Non-custodial" hint="Wallet-owned" />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <dd
        className="text-[22px] sm:text-2xl text-primary whitespace-nowrap"
        style={{ fontWeight: 590, letterSpacing: "-0.012em" }}
      >
        {value}
      </dd>
      <dt className="mt-1 text-[11px] uppercase tracking-[0.12em] text-foreground">
        {label}
      </dt>
      <p className="mt-0.5 text-[12px] text-muted">{hint}</p>
    </div>
  );
}

function TrustStrip() {
  return (
    <section
      className="border-t border-card-border bg-[rgba(255,255,255,0.025)]"
      aria-label="Trust indicators"
    >
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 py-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[12px] text-muted">
        <TrustItem
          icon={<LockIcon />}
          text="Funds held in program-derived escrow"
        />
        <TrustItem
          icon={<ShieldIcon />}
          text="Buyer confirms each milestone release"
        />
        <TrustItem
          icon={<HandshakeIcon />}
          text="Refund requires both signatures"
        />
        <TrustItem
          icon={<EyeIcon />}
          text="Every transaction on Solana devnet"
        />
      </div>
    </section>
  );
}

function TrustItem({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-accent">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function Problem() {
  const items = [
    {
      title: "Buyer pays first.",
      body: "Seller stalls. The wire is gone, the chase is on WhatsApp.",
      Art: ArtBuyerPaysFirst,
    },
    {
      title: "Seller delivers first.",
      body: "Scope dispute. Invoice unpaid 60 days. Relationship broken.",
      Art: ArtSellerDeliversFirst,
    },
    {
      title: "Both hire lawyers.",
      body: "A $12k contract for a $20k deal. Trust priced as overhead.",
      Art: ArtBothHireLawyers,
    },
  ];
  return (
    <section className="border-t border-card-border">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 py-12 sm:py-16">
        <SectionEyebrow>The problem</SectionEyebrow>
        <h2
          className="mt-3 text-[32px] sm:text-[40px] max-w-3xl text-primary"
          style={h2Style}
        >
          Every handshake deal breaks the same way.
        </h2>
        <div className="mt-10 grid md:grid-cols-3 gap-3">
          {items.map((i) => (
            <div
              key={i.title}
              className="group rounded-xl border border-card-border bg-[rgba(255,255,255,0.02)] p-6 transition-colors hover:bg-[rgba(255,255,255,0.035)] overflow-hidden"
            >
              <div className="h-[104px] -mx-6 -mt-6 mb-5 px-6 flex items-center justify-center border-b border-card-border-subtle bg-[rgba(255,255,255,0.015)] overflow-hidden">
                <i.Art />
              </div>
              <h3 className="text-[15px] text-primary" style={h3Style}>
                {i.title}
              </h3>
              <p className="mt-2 text-[14px] text-foreground leading-relaxed">
                {i.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Solution() {
  const agents = [
    {
      role: "Structurer",
      Art: ArtStructurer,
      title: "Chat in, deal out.",
      body: "Describe the deal in plain language. EN or ID. It drafts the escrow.",
    },
    {
      role: "Negotiator",
      Art: ArtNegotiator,
      title: "Speaks for each side.",
      body: "Both wallets get an agent with red-lines and history. They counter until they agree.",
    },
    {
      role: "Verifier",
      Art: ArtVerifier,
      title: "Reviews delivery proof.",
      body: "Seller uploads proof. Verifier scores it. You approve.",
    },
  ];
  const primitives = [
    { label: "Program-held escrow", detail: "USDC locked in a PDA. Neither side withdraws alone." },
    { label: "Mutual refund", detail: "Both sign to unwind. No relay, no griefing." },
    { label: "Portable reputation", detail: "Completed-deals counter, on-chain per wallet." },
  ];
  return (
    <section
      id="solution"
      className="border-t border-card-border bg-[rgba(255,255,255,0.025)]"
    >
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 py-12 sm:py-16">
        <SectionEyebrow>The three agents</SectionEyebrow>
        <h2
          className="mt-3 text-[32px] sm:text-[40px] max-w-3xl text-primary"
          style={h2Style}
        >
          Three AI agents. One on-chain deal table.
        </h2>
        <p className="mt-4 text-[17px] text-foreground max-w-2xl leading-relaxed">
          One engine, three roles. Each does the work a bank or lawyer would charge for.
        </p>
        <div className="mt-12 grid md:grid-cols-3 gap-3">
          {agents.map((a) => (
            <article
              key={a.role}
              className="group rounded-xl border border-card-border bg-[rgba(255,255,255,0.02)] p-6 flex flex-col transition-colors hover:bg-[rgba(255,255,255,0.035)] overflow-hidden"
            >
              <div className="h-[112px] -mx-6 -mt-6 mb-4 px-6 flex items-center justify-center border-b border-card-border-subtle bg-[rgba(255,255,255,0.02)] overflow-hidden">
                <a.Art />
              </div>
              <span className="text-[11px] uppercase tracking-[0.14em] text-foreground">
                {a.role}
              </span>
              <h3 className="mt-2 text-[15px] text-primary" style={h3Style}>
                {a.title}
              </h3>
              <p className="mt-2 text-[14px] text-foreground leading-relaxed">
                {a.body}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-12 rounded-xl border border-card-border-subtle bg-[rgba(255,255,255,0.015)] p-6 sm:p-7">
          <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">
            Under the hood
          </p>
          <dl className="mt-4 grid md:grid-cols-3 gap-x-8 gap-y-4">
            {primitives.map((p) => (
              <div key={p.label}>
                <dt
                  className="text-[13px] text-primary"
                  style={{ fontWeight: 510 }}
                >
                  {p.label}
                </dt>
                <dd className="mt-1 text-[13px] text-muted leading-relaxed">
                  {p.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Describe.", body: "Chat the deal in plain language.", Art: ArtStepDescribe },
    { n: "02", title: "Negotiate.", body: "Agents counter on both sides. You accept the summary.", Art: ArtStepNegotiate },
    { n: "03", title: "Fund.", body: "One signature. USDC enters the on-chain vault.", Art: ArtStepFund },
    { n: "04", title: "Verify.", body: "Seller uploads proof. Verifier scores it.", Art: ArtStepVerify },
    { n: "05", title: "Release.", body: "One tap. That milestone pays. Not the pot.", Art: ArtStepRelease },
  ];
  return (
    <section id="how" className="border-t border-card-border">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 py-12 sm:py-16">
        <SectionEyebrow>How it works</SectionEyebrow>
        <h2
          className="mt-3 text-[32px] sm:text-[40px] max-w-3xl text-primary"
          style={h2Style}
        >
          Five steps. One signature per milestone.
        </h2>
        <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="group relative rounded-xl border border-card-border bg-[rgba(255,255,255,0.02)] p-5 overflow-hidden"
            >
              <div className="h-[68px] -mx-5 -mt-5 mb-3 flex items-center justify-center border-b border-card-border-subtle bg-[rgba(255,255,255,0.02)] overflow-hidden">
                <s.Art />
              </div>
              <span
                className="text-[12px] font-mono text-accent"
                style={{ fontWeight: 510 }}
              >
                {s.n}
              </span>
              <h3 className="mt-2 text-[15px] text-primary" style={h3Style}>
                {s.title}
              </h3>
              <p className="mt-2 text-[13.5px] text-foreground leading-relaxed">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-6 rounded-xl border border-card-border-subtle bg-[rgba(255,255,255,0.015)] p-5 sm:p-6 flex items-start gap-4">
          <span className="mt-0.5 text-accent shrink-0">
            <RefundIcon />
          </span>
          <div>
            <p
              className="text-[13px] text-primary"
              style={{ fontWeight: 510 }}
            >
              Recovery path, also shipped.
            </p>
            <p className="mt-1 text-[13.5px] text-muted leading-relaxed">
              Mutual refund returns the remaining USDC when both sides sign. Pre-funding deals cancel off-chain.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamTrust() {
  return (
    <section
      id="team"
      className="border-t border-card-border bg-[rgba(255,255,255,0.025)]"
    >
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 py-12 sm:py-16 grid md:grid-cols-2 gap-10 md:gap-16">
        <div>
          <SectionEyebrow>Why trust us</SectionEyebrow>
          <h2
            className="mt-3 text-[32px] sm:text-[40px] text-primary"
            style={h2Style}
          >
            Built by operators who have already lived the problem.
          </h2>
        </div>
        <aside className="rounded-xl border border-card-border bg-[rgba(255,255,255,0.02)] p-6 sm:p-8 flex flex-col">
          <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">
            Verify for yourself
          </p>
          <p className="mt-2 text-[14px] text-foreground">
            Escrow program live on Solana devnet. Inspect it:
          </p>
          <div className="mt-4 rounded-md border border-card-border-subtle bg-background px-3 py-2.5 font-mono text-[12px] break-all text-foreground">
            {PROGRAM_ID}
          </div>
          <a
            href={`https://solscan.io/account/${PROGRAM_ID}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-accent hover:text-accent-hover transition-colors rounded"
            style={{ fontWeight: 510 }}
          >
            View on Solscan
            <ExternalLinkIcon />
          </a>
          <div className="mt-6 pt-6 border-t border-card-border-subtle grid grid-cols-2 gap-4 text-[13px]">
            <Fact label="Program type" value="Anchor · upgradeable" />
            <Fact label="Settlement token" value="USDC (SPL)" />
            <Fact label="Escrow model" value="Milestone-based" />
            <Fact label="Release rule" value="Buyer confirms" />
            <Fact label="Negotiation" value="Dual-agent" />
            <Fact label="Refund" value="Buyer + seller sign" />
          </div>
        </aside>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted uppercase tracking-[0.1em]">{label}</p>
      <p
        className="mt-1 text-[13px] text-primary"
        style={{ fontWeight: 510 }}
      >
        {value}
      </p>
    </div>
  );
}

function FinalCTA() {
  return (
    <section className="border-t border-card-border">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 py-12 sm:py-16">
        <div className="relative overflow-hidden rounded-2xl border border-card-border bg-[rgba(255,255,255,0.02)] p-8 sm:p-12">
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, var(--accent), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative max-w-2xl">
          <h2
            className="text-[32px] sm:text-[40px] text-primary"
            style={h2Style}
          >
            Your next deal closes itself.
          </h2>
          <p className="mt-4 text-[17px] text-foreground leading-relaxed">
            Early access on devnet. Bring a real deal. We&apos;ll walk you through it.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 h-11 text-[14px] text-white hover:bg-accent-hover transition-colors"
              style={{ fontWeight: 510 }}
            >
              Open the app
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:rednave2806@gmail.com?subject=Sealed%20Agent%20early%20access"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-card-border bg-[rgba(255,255,255,0.02)] px-5 h-11 text-[14px] text-primary hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              style={{ fontWeight: 510 }}
            >
              Talk to the team
            </a>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-card-border bg-[rgba(255,255,255,0.025)]">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 lg:px-10 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[13px] text-muted">
        <div className="flex items-center gap-2 text-primary">
          <SealedMark size={22} ring={false} />
          <span style={{ fontWeight: 510 }}>Sealed Agent</span>
          <span className="ml-1 text-muted">Escrow on Solana.</span>
        </div>
        <div className="flex items-center gap-5" style={{ fontWeight: 510 }}>
          <Link href="/app" className="hover:text-primary transition-colors">
            App
          </Link>
          <a
            href={`https://solscan.io/account/${PROGRAM_ID}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            Program
          </a>
          <a
            href="mailto:rednave2806@gmail.com"
            className="hover:text-primary transition-colors"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] uppercase tracking-[0.16em] text-accent"
      style={{ fontWeight: 510 }}
    >
      {children}
    </p>
  );
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function HandshakeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m11 17 2 2a1 1 0 0 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 0 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 0 1-1.41 0l-2.62-2.62a1 1 0 0 0-1.41 0L3 10.5" />
      <path d="m21 3-3 3" />
      <path d="M3 21v-4.5" />
    </svg>
  );
}
function RefundIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  );
}
function ExternalLinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

/* --- Card illustrations ---
 * Mono-violet, thin-stroke, GPU-cheap. Trigger: parent card has class `group`.
 * Tailwind transitions on transform/opacity; looping motions use `.sealed-loop-*`
 * keyframes from globals.css (paused → running on group-hover, off when reduced).
 */

const ART_TRACK = "rgba(255,255,255,0.18)";
const ART_DIM = "rgba(255,255,255,0.28)";
const ART_LINE = "rgba(255,255,255,0.4)";

function ArtBuyerPaysFirst() {
  return (
    <svg viewBox="0 0 220 100" className="w-full h-full" aria-hidden="true">
      <rect x="14" y="36" width="44" height="28" rx="4" stroke={ART_DIM} fill="none" strokeWidth="1.4" />
      <line x1="22" y1="46" x2="50" y2="46" stroke={ART_TRACK} strokeWidth="1.4" />
      <line x1="22" y1="54" x2="42" y2="54" stroke={ART_TRACK} strokeWidth="1.4" />
      <line x1="64" y1="50" x2="206" y2="50" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3 4" />
      <rect x="170" y="36" width="40" height="28" rx="4" stroke={ART_TRACK} fill="none" strokeWidth="1.2" strokeDasharray="3 3" />
      <circle
        cx="74"
        cy="50"
        r="6.5"
        fill="var(--accent)"
        className="transition-all duration-700 ease-out group-hover:translate-x-[140px] group-hover:opacity-0"
      />
    </svg>
  );
}

function ArtSellerDeliversFirst() {
  return (
    <svg viewBox="0 0 220 100" className="w-full h-full" aria-hidden="true">
      {/* invoice */}
      <rect x="22" y="22" width="58" height="60" rx="3" stroke={ART_DIM} fill="none" strokeWidth="1.4" />
      <line x1="30" y1="34" x2="72" y2="34" stroke={ART_LINE} strokeWidth="1.4" />
      <line x1="30" y1="42" x2="68" y2="42" stroke={ART_TRACK} strokeWidth="1.4" />
      <line x1="30" y1="50" x2="60" y2="50" stroke={ART_TRACK} strokeWidth="1.4" />
      <line x1="30" y1="64" x2="56" y2="64" stroke="rgba(255,255,255,0.12)" strokeWidth="1.4" strokeDasharray="2 3" />
      <line x1="30" y1="72" x2="64" y2="72" stroke="rgba(255,255,255,0.12)" strokeWidth="1.4" strokeDasharray="2 3" />

      {/* clock */}
      <circle cx="160" cy="52" r="26" stroke={ART_DIM} fill="none" strokeWidth="1.4" />
      <circle cx="160" cy="52" r="2" fill="var(--accent)" />
      <line x1="160" y1="52" x2="170" y2="52" stroke={ART_LINE} strokeWidth="1.4" strokeLinecap="round" />
      <line
        x1="160"
        y1="52"
        x2="160"
        y2="32"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="sealed-loop sealed-loop-spin"
        style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
      />
    </svg>
  );
}

function ArtBothHireLawyers() {
  return (
    <svg viewBox="0 0 220 100" className="w-full h-full" aria-hidden="true">
      {/* coin (bottom, gets squashed) */}
      <ellipse
        cx="110"
        cy="86"
        rx="22"
        ry="9"
        fill="var(--accent)"
        className="transition-transform duration-500 ease-out group-hover:scale-y-[0.3]"
        style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
      />
      {/* paper stack */}
      <rect x="68" y="70" width="84" height="9" rx="2" fill="rgba(15,16,17,0.95)" stroke={ART_DIM} strokeWidth="1.2"
        className="transition-transform duration-500 ease-out group-hover:-translate-y-[6px]" />
      <rect x="64" y="60" width="92" height="9" rx="2" fill="rgba(15,16,17,0.95)" stroke={ART_DIM} strokeWidth="1.2"
        className="transition-transform duration-500 ease-out delay-75 group-hover:-translate-y-[16px]" />
      <rect x="60" y="50" width="100" height="9" rx="2" fill="rgba(15,16,17,0.95)" stroke={ART_DIM} strokeWidth="1.2"
        className="transition-transform duration-500 ease-out delay-150 group-hover:-translate-y-[28px]" />
      <rect x="56" y="40" width="108" height="9" rx="2" fill="rgba(15,16,17,0.95)" stroke="var(--accent)" strokeWidth="1.2"
        className="opacity-0 transition-all duration-500 ease-out delay-200 group-hover:opacity-100 group-hover:-translate-y-[38px]" />
    </svg>
  );
}

function ArtStructurer() {
  return (
    <svg viewBox="0 0 220 120" className="w-full h-full" aria-hidden="true">
      {/* chat bubbles — fade out left */}
      <g className="transition-all duration-500 ease-out group-hover:opacity-0 group-hover:-translate-x-[16px]">
        <rect x="18" y="22" width="60" height="18" rx="9" stroke={ART_DIM} fill="rgba(113,112,255,0.08)" strokeWidth="1.2" />
        <rect x="32" y="50" width="54" height="18" rx="9" stroke={ART_TRACK} fill="rgba(113,112,255,0.06)" strokeWidth="1.2" />
        <rect x="22" y="78" width="58" height="18" rx="9" stroke={ART_TRACK} fill="rgba(113,112,255,0.04)" strokeWidth="1.2" />
      </g>
      {/* arrow */}
      <path d="M 96 60 L 124 60 M 118 56 L 124 60 L 118 64"
        stroke="var(--accent)" fill="none" strokeWidth="1.2" strokeLinecap="round"
        className="opacity-30 transition-opacity duration-500 group-hover:opacity-100" />
      {/* doc — fade in right */}
      <g className="opacity-30 transition-all duration-500 ease-out group-hover:opacity-100 group-hover:translate-x-[6px]">
        <rect x="138" y="18" width="68" height="84" rx="3" stroke={ART_LINE} fill="rgba(113,112,255,0.05)" strokeWidth="1.3" />
        <line x1="146" y1="32" x2="198" y2="32" stroke="var(--accent)" strokeWidth="1.6" />
        <line x1="146" y1="44" x2="190" y2="44" stroke={ART_LINE} strokeWidth="1.2" />
        <line x1="146" y1="54" x2="194" y2="54" stroke={ART_LINE} strokeWidth="1.2" />
        <line x1="146" y1="64" x2="180" y2="64" stroke={ART_LINE} strokeWidth="1.2" />
        <line x1="146" y1="82" x2="170" y2="82" stroke={ART_TRACK} strokeWidth="1.2" strokeDasharray="2 3" />
        <line x1="146" y1="90" x2="186" y2="90" stroke={ART_TRACK} strokeWidth="1.2" strokeDasharray="2 3" />
      </g>
    </svg>
  );
}

function ArtNegotiator() {
  return (
    <svg viewBox="0 0 220 100" className="w-full h-full" aria-hidden="true">
      <line x1="20" y1="50" x2="200" y2="50" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="2 3" />
      {/* left arrow */}
      <path d="M 24 50 L 76 50 M 70 44 L 76 50 L 70 56"
        stroke="var(--accent)" fill="none" strokeWidth="1.6" strokeLinecap="round"
        className="transition-transform duration-700 ease-in-out group-hover:translate-x-[26px]" />
      {/* right arrow */}
      <path d="M 196 50 L 144 50 M 150 44 L 144 50 L 150 56"
        stroke="var(--accent)" fill="none" strokeWidth="1.6" strokeLinecap="round"
        className="transition-transform duration-700 ease-in-out group-hover:-translate-x-[26px]" />
      {/* meeting dot */}
      <circle
        cx="110"
        cy="50"
        r="6"
        fill="var(--accent)"
        className="scale-0 transition-transform duration-300 ease-out delay-500 group-hover:scale-100"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </svg>
  );
}

function ArtVerifier() {
  return (
    <svg viewBox="0 0 220 120" className="w-full h-full" aria-hidden="true">
      <rect x="64" y="14" width="92" height="92" rx="3" stroke={ART_LINE} fill="rgba(113,112,255,0.04)" strokeWidth="1.3" />
      <line x1="74" y1="28" x2="146" y2="28" stroke={ART_LINE} strokeWidth="1.2" />
      <line x1="74" y1="38" x2="138" y2="38" stroke={ART_DIM} strokeWidth="1.2" />
      <line x1="74" y1="48" x2="142" y2="48" stroke={ART_DIM} strokeWidth="1.2" />
      <circle
        cx="110"
        cy="78"
        r="18"
        stroke="var(--accent)"
        fill="rgba(113,112,255,0.04)"
        strokeWidth="1.4"
        className="opacity-50 transition-opacity duration-500 group-hover:opacity-100"
      />
      <path
        d="M 100 78 L 108 86 L 122 72"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1}
        className="transition-[stroke-dashoffset] duration-700 ease-out delay-200 group-hover:[stroke-dashoffset:0]"
      />
    </svg>
  );
}

function ArtStepDescribe() {
  return (
    <svg viewBox="0 0 160 60" className="w-full h-full" aria-hidden="true">
      <line x1="20" y1="20" x2="100" y2="20" stroke={ART_LINE} strokeWidth="1.6"
        className="scale-x-0 transition-transform duration-500 ease-out group-hover:scale-x-100"
        style={{ transformBox: "fill-box", transformOrigin: "left center" }} />
      <line x1="20" y1="32" x2="120" y2="32" stroke={ART_DIM} strokeWidth="1.6"
        className="scale-x-0 transition-transform duration-500 ease-out delay-150 group-hover:scale-x-100"
        style={{ transformBox: "fill-box", transformOrigin: "left center" }} />
      <line x1="20" y1="44" x2="80" y2="44" stroke={ART_DIM} strokeWidth="1.6"
        className="scale-x-0 transition-transform duration-500 ease-out delay-300 group-hover:scale-x-100"
        style={{ transformBox: "fill-box", transformOrigin: "left center" }} />
      <line x1="124" y1="40" x2="124" y2="48" stroke="var(--accent)" strokeWidth="1.6" className="sealed-loop-blink" />
    </svg>
  );
}

function ArtStepNegotiate() {
  return (
    <svg viewBox="0 0 160 60" className="w-full h-full" aria-hidden="true">
      <line x1="40" y1="30" x2="120" y2="30" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="2 3" />
      <circle cx="40" cy="30" r="5" fill="var(--accent)" className="sealed-loop sealed-loop-png-r" />
      <circle cx="120" cy="30" r="5" fill="var(--accent)" className="sealed-loop sealed-loop-png-l" />
    </svg>
  );
}

function ArtStepFund() {
  return (
    <svg viewBox="0 0 160 80" className="w-full h-full" aria-hidden="true">
      <rect x="58" y="38" width="44" height="34" rx="3" stroke={ART_LINE} fill="rgba(113,112,255,0.05)" strokeWidth="1.4" />
      <circle cx="80" cy="56" r="5" stroke={ART_DIM} fill="none" strokeWidth="1.2" />
      <line x1="72" y1="38" x2="88" y2="38" stroke="var(--accent)" strokeWidth="2" />
      <circle
        cx="80"
        cy="14"
        r="5"
        fill="var(--accent)"
        className="transition-all duration-700 ease-in group-hover:translate-y-[28px] group-hover:opacity-0"
      />
    </svg>
  );
}

function ArtStepVerify() {
  return (
    <svg viewBox="0 0 160 80" className="w-full h-full overflow-hidden" aria-hidden="true">
      <rect x="50" y="14" width="60" height="56" rx="3" stroke={ART_LINE} fill="none" strokeWidth="1.3" />
      <line x1="58" y1="26" x2="100" y2="26" stroke={ART_LINE} strokeWidth="1.2" />
      <line x1="58" y1="36" x2="92" y2="36" stroke={ART_DIM} strokeWidth="1.2" />
      <line x1="58" y1="46" x2="98" y2="46" stroke={ART_DIM} strokeWidth="1.2" />
      <line x1="58" y1="56" x2="86" y2="56" stroke={ART_DIM} strokeWidth="1.2" />
      <rect x="50" y="14" width="60" height="2" fill="var(--accent)" className="sealed-loop sealed-loop-scan" />
    </svg>
  );
}

function ArtStepRelease() {
  return (
    <svg viewBox="0 0 160 80" className="w-full h-full" aria-hidden="true">
      <rect x="60" y="38" width="40" height="34" rx="4" stroke={ART_LINE} fill="rgba(113,112,255,0.05)" strokeWidth="1.4" />
      <circle cx="80" cy="56" r="3" stroke={ART_DIM} fill="none" strokeWidth="1.2" />
      <path
        d="M 68 38 V 30 A 12 12 0 0 1 92 30 V 38"
        stroke="var(--accent)"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
        className="transition-transform duration-500 ease-out group-hover:rotate-[-30deg]"
        style={{ transformBox: "fill-box", transformOrigin: "100% 100%" }}
      />
      <circle
        cx="80"
        cy="56"
        r="5"
        fill="var(--accent)"
        className="opacity-0 transition-all duration-700 ease-out delay-200 group-hover:opacity-100 group-hover:-translate-y-[34px]"
      />
    </svg>
  );
}
