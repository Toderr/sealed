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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 sm:pb-24">
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
            Sealed Agent is an AI agent that represents your business on an on-chain
            deal table. It negotiates terms, holds escrow, verifies milestones,
            and releases payment automatically, so deals close without a bank,
            a lawyer, or a leap of faith.
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
        className="text-[22px] sm:text-2xl text-primary"
        style={{ fontWeight: 590, letterSpacing: "-0.012em" }}
      >
        {value}
      </dd>
      <dt className="mt-1 text-[11px] uppercase tracking-[0.12em] text-subtle">
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[12px] text-muted">
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
      title: "The buyer transfers first.",
      body:
        "Seller delays. Buyer chases on WhatsApp. Bank transfer is already gone. There is no neutral hold.",
    },
    {
      title: "The seller delivers first.",
      body:
        "Buyer disputes scope. Invoice sits unpaid for 60 days. Relationship breaks over the final milestone.",
    },
    {
      title: "Both sides hire lawyers.",
      body:
        "For a $20,000 deal, you write a $12,000 contract. Trust is expensive. Enforcement is slower.",
    },
  ];
  return (
    <section className="border-t border-card-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <SectionEyebrow>The problem</SectionEyebrow>
        <h2
          className="mt-3 text-[32px] sm:text-[40px] max-w-3xl text-primary"
          style={h2Style}
        >
          Every handshake deal breaks the same way.
        </h2>
        <p className="mt-4 text-[17px] text-foreground max-w-2xl leading-relaxed">
          Business owners already use crypto rails for cross-border settlement.
          They still settle the trust layer on WhatsApp screenshots and transfer
          slips.
        </p>
        <div className="mt-12 grid md:grid-cols-3 gap-3">
          {items.map((i) => (
            <div
              key={i.title}
              className="rounded-xl border border-card-border bg-[rgba(255,255,255,0.02)] p-6 transition-colors hover:bg-[rgba(255,255,255,0.035)]"
            >
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
      icon: <ChatIcon />,
      title: "Turns a chat into a deal.",
      body:
        "Describe what you are buying in plain language. Bahasa Indonesia or English both work. The Structurer extracts counterparty, amount, and milestones, then drafts the escrow.",
    },
    {
      role: "Negotiator",
      icon: <HandshakeIcon className="w-5 h-5" />,
      title: "Speaks for each side.",
      body:
        "Both wallets get their own Negotiator, carrying BusinessMemory (red-lines, style, past deals). The agents counter-offer until they agree, then summarize pros, cons, and risks.",
    },
    {
      role: "Verifier",
      icon: <ShieldCheckIcon />,
      title: "Reviews delivery proof.",
      body:
        "Seller submits proof per milestone. The Verifier scores confidence and recommends approve, reject, or request clarification. The buyer retains final authority.",
    },
  ];
  const primitives = [
    { label: "Program-held escrow", detail: "USDC locked in a PDA vault; neither side withdraws alone." },
    { label: "Mutual refund", detail: "2-sig partial-sign handoff. No trusted relay, no griefing vector." },
    { label: "Portable reputation", detail: "Completed-deals counter tracked per wallet, portable to the reputation PDA." },
  ];
  return (
    <section
      id="solution"
      className="border-t border-card-border bg-[rgba(255,255,255,0.025)]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <SectionEyebrow>The three agents</SectionEyebrow>
        <h2
          className="mt-3 text-[32px] sm:text-[40px] max-w-3xl text-primary"
          style={h2Style}
        >
          Three AI agents. One on-chain deal table.
        </h2>
        <p className="mt-4 text-[17px] text-foreground max-w-2xl leading-relaxed">
          Structurer, Negotiator, Verifier: one engine, different roles. Each
          one does the piece a bank or lawyer would otherwise charge you for.
        </p>
        <div className="mt-12 grid md:grid-cols-3 gap-3">
          {agents.map((a) => (
            <article
              key={a.role}
              className="rounded-xl border border-card-border bg-[rgba(255,255,255,0.02)] p-6 flex flex-col transition-colors hover:bg-[rgba(255,255,255,0.035)]"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                  {a.icon}
                </div>
                <span className="text-[11px] uppercase tracking-[0.14em] text-subtle">
                  {a.role}
                </span>
              </div>
              <h3 className="mt-5 text-[15px] text-primary" style={h3Style}>
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
    {
      n: "01",
      title: "Describe.",
      body:
        "Open the chat. Say what you are buying, from whom, how to pay it out. The Structurer drafts a deal preview.",
    },
    {
      n: "02",
      title: "Negotiate.",
      body:
        "Each side's Negotiator counter-offers with its BusinessMemory in mind. You accept the final summary when the risks make sense.",
    },
    {
      n: "03",
      title: "Fund.",
      body:
        "Sign once. USDC moves into a program-derived vault on Solana. Neither side can withdraw unilaterally.",
    },
    {
      n: "04",
      title: "Verify.",
      body:
        "Seller uploads proof per milestone. The Verifier reviews it and recommends approve, reject, or request clarification.",
    },
    {
      n: "05",
      title: "Release.",
      body:
        "You confirm delivery in one tap. The contract releases that milestone only, not the whole pot.",
    },
  ];
  return (
    <section id="how" className="border-t border-card-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
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
              className="relative rounded-xl border border-card-border bg-[rgba(255,255,255,0.02)] p-5"
            >
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
              If the deal unwinds, mutual refund returns the remaining USDC.
              Both parties partial-sign, no trusted relay, no griefing vector.
              Pre-funding deals cancel locally without touching the chain.
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid md:grid-cols-2 gap-10 md:gap-16">
        <div>
          <SectionEyebrow>Why trust us</SectionEyebrow>
          <h2
            className="mt-3 text-[32px] sm:text-[40px] text-primary"
            style={h2Style}
          >
            Built by operators who have already lived the problem.
          </h2>
          <p className="mt-4 text-[17px] text-foreground leading-relaxed">
            Sealed Agent is built in the open by two founders with direct access to
            the Indonesian pengusaha community: the people who send real
            business wires every week and know exactly where handshake deals
            fail.
          </p>
          <dl className="mt-8 space-y-5">
            <Credential
              role="Distribution & financial markets"
              detail="18 years across financial markets and marketplaces. Direct line to the target customer segment."
            />
            <Credential
              role="Marketing & agentic AI"
              detail="4+ years in digital marketing, ex Marketing Agency CCO. High proficiency in agentic AI. Previously shipped a self-learning DLMM trading agent."
            />
          </dl>
        </div>
        <aside className="rounded-xl border border-card-border bg-[rgba(255,255,255,0.02)] p-6 sm:p-8 flex flex-col">
          <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">
            Verify for yourself
          </p>
          <p className="mt-2 text-[14px] text-foreground">
            The escrow program is deployed and upgradeable to a multisig
            authority. Inspect it on Solana devnet:
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

function Credential({
  role,
  detail,
}: {
  role: string;
  detail: string;
}) {
  return (
    <div className="flex gap-4">
      <span
        className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0"
        aria-hidden="true"
      />
      <div>
        <dt
          className="text-[15px] text-primary"
          style={{ fontWeight: 510 }}
        >
          {role}
        </dt>
        <dd className="text-[14px] text-foreground mt-0.5 leading-relaxed">
          {detail}
        </dd>
      </div>
    </div>
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
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
            Sealed Agent is in early access on devnet. Bring a real deal and we will
            walk you through it.
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[13px] text-muted">
        <div className="flex items-center gap-2 text-primary">
          <SealedMark size={22} ring={false} />
          <span style={{ fontWeight: 510 }}>Sealed Agent</span>
          <span className="ml-1 text-muted">AI-powered escrow on Solana.</span>
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
function ChatIcon() {
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
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
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
function ShieldCheckIcon() {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
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
