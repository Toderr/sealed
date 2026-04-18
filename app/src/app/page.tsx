import Link from "next/link";
import GlobalBackground from "@/components/GlobalBackground";

const PROGRAM_ID = "3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ";

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
    <header className="sticky top-0 z-40 border-b border-card-border/60 bg-background/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group" aria-label="Sealed home">
          <SealedMark />
          <span className="font-semibold tracking-tight">Sealed</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted">
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#solution" className="hover:text-foreground transition-colors">Product</a>
          <a href="#team" className="hover:text-foreground transition-colors">Team</a>
        </nav>
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 h-9 text-sm font-medium text-white hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Open app
          <ArrowRight className="w-4 h-4" />
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
          <span className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card px-3 py-1 text-xs font-medium text-muted">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 motion-safe:animate-ping"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success"></span>
            </span>
            Live on Solana devnet
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] text-white">
            People break promises.
            <br className="hidden sm:block" />
            <span className="text-accent"> Code doesn&apos;t.</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-foreground max-w-2xl leading-relaxed">
            Sealed is an AI agent that represents your business on an on-chain deal table.
            It negotiates terms, holds escrow, verifies milestones, and releases payment
            automatically, so deals close without a bank, a lawyer, or a leap of faith.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 h-12 text-[15px] font-medium text-white hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Start a deal
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#how"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-card-border bg-card px-5 h-12 text-[15px] font-medium hover:border-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              See how it works
            </a>
          </div>

          <dl className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10 max-w-2xl">
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

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dd className="text-xl sm:text-2xl font-semibold tracking-tight text-white">{value}</dd>
      <dt className="mt-1 text-xs uppercase tracking-wider text-muted">{label}</dt>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

function TrustStrip() {
  return (
    <section
      className="border-y border-card-border/60 bg-card/40"
      aria-label="Trust indicators"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted">
        <TrustItem icon={<LockIcon />} text="Funds held in program-derived escrow" />
        <TrustItem icon={<ShieldIcon />} text="Milestone release requires buyer signature" />
        <TrustItem icon={<EyeIcon />} text="Every transaction on-chain & verifiable" />
      </div>
    </section>
  );
}

function TrustItem({ icon, text }: { icon: React.ReactNode; text: string }) {
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
        "For a 20,000 USD deal, you write a 12,000 USD contract. Trust is expensive. Enforcement is slower.",
    },
  ];
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
      <SectionEyebrow>The problem</SectionEyebrow>
      <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl text-white">
        Every handshake deal breaks the same way.
      </h2>
      <p className="mt-4 text-foreground max-w-2xl">
        Business owners already use crypto rails for cross-border settlement. They
        still settle the trust layer on WhatsApp screenshots and transfer slips.
      </p>
      <div className="mt-12 grid md:grid-cols-3 gap-4">
        {items.map((i) => (
          <div
            key={i.title}
            className="rounded-2xl border border-card-border bg-card p-6"
          >
            <h3 className="font-semibold text-[15px] text-white">{i.title}</h3>
            <p className="mt-2 text-sm text-foreground leading-relaxed">{i.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Solution() {
  const features = [
    {
      icon: <ChatIcon />,
      title: "AI agent does the paperwork.",
      body:
        "Describe the deal in plain language. Indonesian or English both work. The agent extracts milestones, amounts, and counterparty details, then drafts the escrow.",
    },
    {
      icon: <VaultIcon />,
      title: "Program-held escrow.",
      body:
        "USDC sits in a Solana program-derived account. Neither side can withdraw it alone. Funds release only when the buyer confirms each milestone.",
    },
    {
      icon: <ReceiptIcon />,
      title: "Portable reputation.",
      body:
        "Every completed deal counts toward the counterparty's on-chain record. You bring your track record with you, not stuck in one platform.",
    },
  ];
  return (
    <section
      id="solution"
      className="border-t border-card-border/60 bg-card/20"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <SectionEyebrow>What Sealed does</SectionEyebrow>
        <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl text-white">
          A neutral third party, enforced by code.
        </h2>
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {features.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-card-border bg-card p-6 flex flex-col"
            >
              <div className="h-10 w-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                {f.icon}
              </div>
              <h3 className="mt-5 font-semibold text-[15px] text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-foreground leading-relaxed">{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Describe the deal.",
      body:
        "Open the chat. Say what you are buying, from whom, and how you want to pay it out. The agent asks only what it needs.",
    },
    {
      n: "02",
      title: "Fund the escrow.",
      body:
        "The agent drafts the on-chain deal. You review the milestones and sign once. USDC moves into a program-derived vault.",
    },
    {
      n: "03",
      title: "Release on delivery.",
      body:
        "When the seller ships a milestone, you confirm in one tap. The contract releases only that milestone, not the whole pot.",
    },
  ];
  return (
    <section id="how" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
      <SectionEyebrow>How it works</SectionEyebrow>
      <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl text-white">
        Three steps. One signature per milestone.
      </h2>
      <ol className="mt-12 grid md:grid-cols-3 gap-4">
        {steps.map((s) => (
          <li
            key={s.n}
            className="relative rounded-2xl border border-card-border bg-card p-6"
          >
            <span className="text-xs font-mono text-accent">{s.n}</span>
            <h3 className="mt-2 font-semibold text-[15px] text-white">{s.title}</h3>
            <p className="mt-2 text-sm text-foreground leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TeamTrust() {
  return (
    <section
      id="team"
      className="border-t border-card-border/60 bg-card/20"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid md:grid-cols-2 gap-10 md:gap-16">
        <div>
          <SectionEyebrow>Why trust us</SectionEyebrow>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Built by operators who have already lived the problem.
          </h2>
          <p className="mt-4 text-foreground leading-relaxed">
            Sealed is built in the open by two founders with direct access to the
            Indonesian pengusaha community. These are the people who send real
            business wires every week and know exactly where handshake deals fail.
          </p>
          <dl className="mt-8 space-y-5">
            <Credential
              role="Trading & valuation"
              detail="18 years across markets, crypto, and DLMM. Has priced the deals Sealed automates."
            />
            <Credential
              role="AI & protocol engineering"
              detail="Shipped an autonomous trading agent for DLMM with auto-screening and self-learning loops."
            />
          </dl>
        </div>
        <aside className="rounded-2xl border border-card-border bg-card p-6 sm:p-8 flex flex-col">
          <p className="text-xs uppercase tracking-wider text-muted">
            Verify for yourself
          </p>
          <p className="mt-2 text-sm text-foreground">
            The escrow program is deployed and upgradeable to a multisig authority.
            Inspect it on Solana devnet:
          </p>
          <div className="mt-4 rounded-lg border border-card-border bg-background px-3 py-2.5 font-mono text-xs break-all text-foreground">
            {PROGRAM_ID}
          </div>
          <a
            href={`https://solscan.io/account/${PROGRAM_ID}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card rounded"
          >
            View on Solscan
            <ExternalLinkIcon />
          </a>
          <div className="mt-6 pt-6 border-t border-card-border grid grid-cols-2 gap-4 text-sm">
            <Fact label="Program type" value="Anchor · upgradeable" />
            <Fact label="Settlement token" value="USDC (SPL)" />
            <Fact label="Escrow model" value="Milestone-based" />
            <Fact label="Release rule" value="Buyer confirms" />
          </div>
        </aside>
      </div>
    </section>
  );
}

function Credential({ role, detail }: { role: string; detail: string }) {
  return (
    <div className="flex gap-4">
      <span
        className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0"
        aria-hidden="true"
      />
      <div>
        <dt className="font-medium text-[15px] text-white">{role}</dt>
        <dd className="text-sm text-foreground mt-0.5 leading-relaxed">{detail}</dd>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-medium text-white">{value}</p>
    </div>
  );
}

function FinalCTA() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
      <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card p-8 sm:p-12">
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, var(--accent), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Your next deal closes itself.
          </h2>
          <p className="mt-4 text-foreground leading-relaxed">
            Sealed is in early access on devnet. Bring a real deal and we will
            walk you through it.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 h-12 text-[15px] font-medium text-white hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              Open the app
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:rednave2806@gmail.com?subject=Sealed%20early%20access"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-card-border bg-background px-5 h-12 text-[15px] font-medium hover:border-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              Talk to the team
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-card-border/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-sm text-muted">
        <div className="flex items-center gap-2">
          <SealedMark />
          <span className="font-medium text-foreground">Sealed</span>
          <span className="ml-2">AI-powered escrow on Solana.</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/app" className="hover:text-foreground transition-colors">
            App
          </Link>
          <a
            href={`https://solscan.io/account/${PROGRAM_ID}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Program
          </a>
          <a
            href="mailto:rednave2806@gmail.com"
            className="hover:text-foreground transition-colors"
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
    <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium">
      {children}
    </p>
  );
}


function SealedMark() {
  return (
    <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-accent/15 text-accent">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M12 2 4 6v6c0 5 3.4 9.3 8 10 4.6-.7 8-5 8-10V6l-8-4Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    </span>
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}
function VaultIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <rect width="18" height="16" x="3" y="4" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9v-.5" />
      <path d="M12 15v.5" />
      <path d="M9 12h-.5" />
      <path d="M15 12h.5" />
    </svg>
  );
}
function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2Z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}
function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}
