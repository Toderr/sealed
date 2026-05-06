// Sealed — FINAL mark
// Dense tapered whiskers (>  <) + solid dot + subtle outer ring.
// Based on user's reference: variant C proportions with ring added.

const INK = '#0B1220';
const PAPER = '#F4F1EA';
const MUTED = '#6B7280';
const ACCENT = '#D97757';

// ─────────────────────────────────────────────────────────────
// Final mark — tapered double-line whiskers mimicking > / <
// Each whisker is rendered as TWO short stacked lines (a chevron feel)
// Matches the user's reference exactly.
// ─────────────────────────────────────────────────────────────
function SealedMark({ size = 120, color = INK, ring = true, accent = false }) {
  const cx = 60, cy = 60;
  const dotR = 13;
  const stroke = 3;

  // Three clean single strokes per side. Middle is horizontal; top/bottom
  // angle outward to form a tapered triple-line (like the reference's
  // `≡`/`>`-shaped cluster).
  // Inner end stays close to the dot; outer end fans vertically outward.
  const xIn = dotR + 7;
  const xOut = dotR + 24;
  // Wide vertical gaps so strokes never overlap at stroke-width 3 + round caps.
  // Outer ends fan slightly beyond inner ends for a gentle taper.
  const strokes = [
    { yIn: -12, yOut: -15 }, // top — angles up-out
    { yIn:   0, yOut:   0 }, // middle — horizontal
    { yIn:  12, yOut:  15 }, // bottom — angles down-out
  ];

  const whisker = (side, s, key) => {
    const sign = side;
    return (
      <line key={key}
        x1={cx + sign * xIn}  y1={cy + s.yIn}
        x2={cx + sign * xOut} y2={cy + s.yOut}
        stroke={color} strokeWidth={stroke} strokeLinecap="round" />
    );
  };

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {ring && (
        <circle cx={cx} cy={cy} r="54" fill="none" stroke={color} strokeWidth="2.5" opacity="0.85" />
      )}
      {strokes.map((s, i) => whisker(1, s, `r${i}`))}
      {strokes.map((s, i) => whisker(-1, s, `l${i}`))}
      <circle cx={cx} cy={cy} r={dotR} fill={accent ? ACCENT : color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Wordmark + lockups
// ─────────────────────────────────────────────────────────────
function Wordmark({ size = 28, color = INK, weight = 600, letterSpacing = -0.6 }) {
  return (
    <div style={{
      fontFamily: 'Inter Tight, system-ui, sans-serif',
      fontWeight: weight, fontSize: size, letterSpacing, color, lineHeight: 1,
    }}>Sealed Agent</div>
  );
}

function Lockup({ markSize = 48, wordSize = 28, color = INK, gap = 14, ring = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <SealedMark size={markSize} color={color} ring={ring} />
      <Wordmark size={wordSize} color={color} />
    </div>
  );
}

// Agent pill — dark capsule with mark + "Sealed Agent" wordmark (compact horizontal variant)
function AgentPill({ height = 40, dark = true }) {
  const bg = dark ? INK : PAPER;
  const fg = dark ? PAPER : INK;
  const padX = height * 0.4;
  const markSize = height * 0.7;
  const fontSize = height * 0.46;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: height * 0.28,
      background: bg, color: fg,
      padding: `${height * 0.18}px ${padX}px ${height * 0.18}px ${padX * 0.7}px`,
      borderRadius: height,
      fontFamily: 'Inter Tight, system-ui, sans-serif',
      fontWeight: 600, fontSize, letterSpacing: -0.02 * fontSize, lineHeight: 1,
    }}>
      <SealedMark size={markSize} color={fg} ring={true} />
      <span>Sealed Agent</span>
    </div>
  );
}

function StackedLockup({ markSize = 100, wordSize = 26, color = INK, gap = 16 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
      <SealedMark size={markSize} color={color} />
      <Wordmark size={wordSize} color={color} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────
function HeroCard() {
  return (
    <DCArtboard label="★ Final mark" width={900} height={500}>
      <div style={{
        width: '100%', height: '100%', background: PAPER,
        display: 'grid', gridTemplateColumns: '1.1fr 1fr',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRight: '1px solid rgba(11,18,32,0.08)',
        }}>
          <SealedMark size={300} />
        </div>
        <div style={{ padding: '48px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: 1.4,
            textTransform: 'uppercase', color: MUTED,
          }}>Sealed Agent · Primary mark · v1.0</div>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.7, color: INK, lineHeight: 1.1 }}>
            A face.<br />A signal.<br />Sealed Agent.
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: '#2A3140' }}>
            Dense tapered whiskers on both sides of a solid dot, held inside a quiet ring.
            Reads at once as the seal's face and as a broadcast — the agent speaking
            and listening on your behalf.
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 24 }}>
            <SealedMark size={20} />
            <SealedMark size={32} />
            <SealedMark size={52} />
            <SealedMark size={80} />
          </div>
        </div>
      </div>
    </DCArtboard>
  );
}

function ConstructionCard() {
  return (
    <DCArtboard label="Construction" width={420} height={420}>
      <div style={{
        width: '100%', height: '100%', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {/* gridlines */}
        <svg width="300" height="300" viewBox="0 0 120 120" style={{ position: 'absolute' }}>
          <circle cx="60" cy="60" r="54" fill="none" stroke={ACCENT} strokeWidth="0.3" strokeDasharray="1 1" />
          <circle cx="60" cy="60" r="13" fill="none" stroke={ACCENT} strokeWidth="0.3" strokeDasharray="1 1" />
          <line x1="0" y1="60" x2="120" y2="60" stroke={ACCENT} strokeWidth="0.3" strokeDasharray="1 1" />
          <line x1="60" y1="0" x2="60" y2="120" stroke={ACCENT} strokeWidth="0.3" strokeDasharray="1 1" />
        </svg>
        <SealedMark size={300} />
      </div>
    </DCArtboard>
  );
}

function SpecsCard() {
  return (
    <DCArtboard label="Specs" width={320} height={420}>
      <div style={{
        width: '100%', height: '100%', background: '#fff', padding: '28px 28px',
        boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14,
        fontFamily: 'JetBrains Mono', fontSize: 11, color: INK, lineHeight: 1.7,
      }}>
        <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: MUTED }}>
          Tokens
        </div>
        <div>
          INK &nbsp; <span style={{ color: MUTED }}>{INK}</span>
          <div style={{ display: 'inline-block', width: 10, height: 10, background: INK, marginLeft: 6, verticalAlign: 'middle' }} />
        </div>
        <div>
          PAPER &nbsp; <span style={{ color: MUTED }}>{PAPER}</span>
          <div style={{ display: 'inline-block', width: 10, height: 10, background: PAPER, border: '1px solid rgba(0,0,0,0.1)', marginLeft: 6, verticalAlign: 'middle' }} />
        </div>
        <div>
          ACCENT &nbsp; <span style={{ color: MUTED }}>{ACCENT}</span>
          <div style={{ display: 'inline-block', width: 10, height: 10, background: ACCENT, marginLeft: 6, verticalAlign: 'middle' }} />
        </div>
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 14, marginTop: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>
            Grid
          </div>
          viewBox &nbsp; <span style={{ color: MUTED }}>120 × 120</span><br />
          dot &nbsp; <span style={{ color: MUTED }}>r = 13</span><br />
          ring &nbsp; <span style={{ color: MUTED }}>r = 54 · 2.5w · 85% op</span><br />
          whisker &nbsp; <span style={{ color: MUTED }}>3 strokes/side, tapered</span><br />
          stroke &nbsp; <span style={{ color: MUTED }}>3 · linecap round</span>
        </div>
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>
            Type
          </div>
          family &nbsp; <span style={{ color: MUTED }}>Inter Tight</span><br />
          weight &nbsp; <span style={{ color: MUTED }}>600</span><br />
          tracking &nbsp; <span style={{ color: MUTED }}>−0.02em</span>
        </div>
      </div>
    </DCArtboard>
  );
}

function ScaleRow() {
  return (
    <DCArtboard label="Scale — 14 / 20 / 32 / 56 / 96 / 160 px" width={720} height={180}>
      <div style={{
        width: '100%', height: '100%', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      }}>
        {[14, 20, 32, 56, 96, 160].map(s => <SealedMark key={s} size={s} />)}
      </div>
    </DCArtboard>
  );
}

function LockupCard({ label, children, bg = PAPER, color = INK }) {
  return (
    <DCArtboard label={label} width={420} height={200}>
      <div style={{
        width: '100%', height: '100%', background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {children}
      </div>
    </DCArtboard>
  );
}

function InContextStrip() {
  return (
    <>
      {/* Browser tab */}
      <DCArtboard label="Browser · favicon + header" width={420} height={220}>
        <div style={{
          width: '100%', height: '100%', background: '#D9D5CC',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ height: 38, padding: '0 10px', display: 'flex', alignItems: 'flex-end' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fff', padding: '6px 12px',
              borderTopLeftRadius: 8, borderTopRightRadius: 8,
              fontSize: 12, fontFamily: 'Inter Tight', color: INK,
            }}>
              <SealedMark size={14} ring={false} />
              <span>Sealed Agent — Deals</span>
              <span style={{ marginLeft: 6, color: MUTED, fontSize: 11 }}>×</span>
            </div>
          </div>
          <div style={{ flex: 1, background: '#fff', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Lockup markSize={22} wordSize={16} />
            <div style={{
              fontFamily: 'JetBrains Mono', fontSize: 10, color: MUTED,
              padding: '3px 8px', border: `1px solid ${MUTED}`, borderRadius: 3,
            }}>devnet</div>
          </div>
        </div>
      </DCArtboard>

      {/* App icon dark */}
      <DCArtboard label="App icon · dark" width={240} height={240}>
        <div style={{
          width: '100%', height: '100%', background: '#E7E3DA',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 170, height: 170, background: INK, borderRadius: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
          }}>
            <SealedMark size={120} color={PAPER} />
          </div>
        </div>
      </DCArtboard>

      {/* App icon light */}
      <DCArtboard label="App icon · light" width={240} height={240}>
        <div style={{
          width: '100%', height: '100%', background: '#E7E3DA',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 170, height: 170, background: PAPER, borderRadius: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(0,0,0,0.10)',
          }}>
            <SealedMark size={120} color={INK} />
          </div>
        </div>
      </DCArtboard>

      {/* Business card */}
      <DCArtboard label="Business card" width={420} height={240}>
        <div style={{
          width: '100%', height: '100%', background: PAPER,
          padding: '28px', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <Lockup markSize={30} wordSize={20} />
          <div style={{ fontFamily: 'Inter Tight', fontSize: 12, color: INK, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600 }}>hello@sealed.xyz</div>
            <div style={{ color: MUTED, marginTop: 2 }}>Jakarta · Solana devnet</div>
          </div>
        </div>
      </DCArtboard>

      {/* Loading */}
      <DCArtboard label="Loading state" width={240} height={240}>
        <div style={{
          width: '100%', height: '100%', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="sealed-pulse">
            <SealedMark size={100} />
          </div>
          <style>{`
            .sealed-pulse { animation: sealedPulse 1.8s ease-in-out infinite; transform-origin: center; }
            @keyframes sealedPulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.55; transform: scale(0.94); }
            }
          `}</style>
        </div>
      </DCArtboard>

      {/* Chat message */}
      <DCArtboard label="Chat avatar" width={420} height={240}>
        <div style={{
          width: '100%', height: '100%', background: '#fff',
          padding: '22px', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <SealedMark size={22} color={PAPER} ring={false} />
            </div>
            <div style={{
              background: '#F1EEE7', padding: '10px 14px', borderRadius: 12,
              fontSize: 13, color: INK, lineHeight: 1.5, maxWidth: 280,
            }}>
              I've structured the deal into 3 milestones. Review before funding?
            </div>
          </div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: MUTED, paddingLeft: 42 }}>
            Sealed Agent · just now
          </div>
        </div>
      </DCArtboard>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────
function App() {
  return (
    <DesignCanvas>
      <DCSection
        title="Sealed Agent · Final mark"
        subtitle="Locked. Dense tapered whiskers + solid dot + subtle ring. Face and signal in one gesture."
      >
        <HeroCard />
      </DCSection>

      <DCSection title="Construction & tokens" subtitle="Everything lives on a 120 grid. One ink, one paper, one accent.">
        <ConstructionCard />
        <SpecsCard />
      </DCSection>

      <DCSection title="Scale" subtitle="Works from favicon to hero.">
        <ScaleRow />
      </DCSection>

      <DCSection title="Agent pill" subtitle='Compact "Sealed Agent" horizontal variant — for chat avatars, attribution badges, AI-action labels.'>
        <LockupCard label="Agent pill · dark" bg={INK}>
          <AgentPill height={56} dark={true} />
        </LockupCard>
        <LockupCard label="Agent pill · light">
          <AgentPill height={56} dark={false} />
        </LockupCard>
        <LockupCard label="Agent pill · sizes" bg="#fff">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
            <AgentPill height={28} />
            <AgentPill height={40} />
            <AgentPill height={56} />
          </div>
        </LockupCard>
        <LockupCard label="Agent pill · inline use" bg="#fff">
          <div style={{
            fontFamily: 'Inter Tight', fontSize: 14, color: INK, lineHeight: 1.7,
            maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start',
          }}>
            <AgentPill height={26} />
            <span style={{ color: MUTED, fontSize: 12 }}>structured your deal · 2m ago</span>
          </div>
        </LockupCard>
      </DCSection>

      <DCSection title="Lockups" subtitle="Horizontal, stacked, inverted.">
        <LockupCard label="Horizontal · light">
          <Lockup markSize={60} wordSize={38} />
        </LockupCard>
        <LockupCard label="Horizontal · dark" bg={INK}>
          <Lockup markSize={60} wordSize={38} color={PAPER} />
        </LockupCard>
        <LockupCard label="Stacked">
          <StackedLockup markSize={110} wordSize={28} />
        </LockupCard>
        <LockupCard label="Mark only · ringless" bg="#fff">
          <SealedMark size={140} ring={false} />
        </LockupCard>
      </DCSection>

      <DCSection title="In context" subtitle="Browser, app icons, card, loading, chat avatar.">
        <InContextStrip />
      </DCSection>
    </DesignCanvas>
  );
}

Object.assign(window, { App, SealedMark, Wordmark, Lockup, AgentPill });
