// Sealed Agent — Philosophy page
// Editorial brand-book style. Uses SealedMark from logo-final.jsx.

const INK = '#0B1220';
const PAPER = '#F4F1EA';
const ACCENT = '#D6A852';
const MUTED = '#6B7280';

// ─────────────────────────────────────────────────────────────
// Annotated mark — circle / dot / whiskers callouts
// ─────────────────────────────────────────────────────────────
function AnnotatedMark({ size = 520 }) {
  const cx = 60, cy = 60, dotR = 13;
  const xIn = dotR + 7, xOut = dotR + 24;
  const strokes = [{ yIn: -12, yOut: -15 }, { yIn: 0, yOut: 0 }, { yIn: 12, yOut: 15 }];
  const whiskers = [];
  for (const sign of [1, -1]) {
    for (const s of strokes) {
      whiskers.push(
        <line key={`${sign}${s.yIn}`}
          x1={cx + sign * xIn} y1={cy + s.yIn}
          x2={cx + sign * xOut} y2={cy + s.yOut}
          stroke={INK} strokeWidth="3" strokeLinecap="round" />
      );
    }
  }

  // Callout line + label helper. (x1,y1) on the artwork; (x2,y2) tip; label at (lx,ly).
  const Callout = ({ x1, y1, x2, y2, lx, ly, label, sub, anchor = 'start' }) => (
    <g>
      <circle cx={x1} cy={y1} r="1.4" fill={ACCENT} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT} strokeWidth="0.4" />
      <line x1={x2} y1={y2} x2={x2 + (anchor === 'end' ? -10 : 10)} y2={y2} stroke={ACCENT} strokeWidth="0.4" />
      <text x={x2 + (anchor === 'end' ? -12 : 12)} y={y2 - 1.5} fill={INK}
        fontFamily="JetBrains Mono, monospace" fontSize="3" letterSpacing="0.3"
        textAnchor={anchor} fontWeight="600">{label}</text>
      <text x={x2 + (anchor === 'end' ? -12 : 12)} y={y2 + 3} fill={MUTED}
        fontFamily="Inter Tight, system-ui, sans-serif" fontSize="2.6"
        textAnchor={anchor}>{sub}</text>
    </g>
  );

  return (
    <svg width={size} height={size * 0.85} viewBox="0 0 200 170" fill="none" style={{ overflow: 'visible' }}>
      {/* Faint baseline */}
      <line x1="0" y1="85" x2="200" y2="85" stroke={ACCENT} strokeWidth="0.2" strokeDasharray="0.8 0.8" opacity="0.5" />
      {/* Centered mark group at (100, 85) */}
      <g transform="translate(40, 25)">
        <circle cx={cx} cy={cy} r="54" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.85" />
        {whiskers}
        <circle cx={cx} cy={cy} r={dotR} fill={INK} />

        {/* Callouts (in mark's local coords) */}
        {/* Circle */}
        <Callout x1={60 + 54 * Math.cos(-Math.PI/2.6)} y1={60 + 54 * Math.sin(-Math.PI/2.6)}
          x2={120} y2={-8} lx={120} ly={-10} label="01 · CIRCLE" sub="A wax seal — authenticity & finality" anchor="start" />
        {/* Dot */}
        <Callout x1={60 + dotR} y1={60} x2={130} y2={62} lx={130} ly={62}
          label="02 · DOT" sub="The agent — one entity, the center" anchor="start" />
        {/* Whiskers */}
        <Callout x1={60 - (dotR + 24)} y1={60 - 15} x2={-24} y2={20}
          lx={-24} ly={20} label="03 · WHISKERS" sub="Sensors — symmetry of two parties" anchor="end" />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Big editorial number
// ─────────────────────────────────────────────────────────────
function Num({ children }) {
  return (
    <div style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 13, letterSpacing: 2,
      color: ACCENT, fontWeight: 600,
    }}>{children}</div>
  );
}

function Kicker({ children, color = MUTED }) {
  return (
    <div style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: 2.4,
      textTransform: 'uppercase', color, fontWeight: 500,
    }}>{children}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section style={{
      minHeight: '100vh', padding: '64px 80px 80px', background: PAPER, color: INK,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      borderBottom: `1px solid rgba(11,18,32,0.08)`,
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <SealedMark size={32} />
          <div style={{ fontWeight: 600, fontSize: 18, letterSpacing: -0.4 }}>Sealed Agent</div>
        </div>
        <Kicker>Brand Philosophy · Vol. 01 · 2025</Kicker>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 80, alignItems: 'center', margin: '40px 0' }}>
        <div>
          <Kicker color={ACCENT}>The mark, decoded</Kicker>
          <h1 style={{
            fontSize: 'clamp(56px, 7vw, 112px)', fontWeight: 600, letterSpacing: -3.5, lineHeight: 0.95,
            margin: '24px 0 32px',
          }}>
            An animal<br />
            built to navigate<br />
            uncertain waters.
          </h1>
          <p style={{
            fontSize: 22, lineHeight: 1.55, color: '#2A3140', maxWidth: 580, margin: 0,
            textWrap: 'pretty',
          }}>
            The mark carries a dual meaning of <i>seal</i>: the animal,
            and the act of sealing a deal. One symbol. Two truths.
            Both about <b>protection</b>, <b>finality</b>, and <b>trust</b>.
          </p>
        </div>
        <div style={{
          background: '#fff', border: '1px solid rgba(11,18,32,0.08)', borderRadius: 8,
          padding: '40px 32px', position: 'relative', overflow: 'visible',
        }}>
          <AnnotatedMark size={520} />
        </div>
      </div>

      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Kicker>Read time · 3 min</Kicker>
        <Kicker>↓ Scroll</Kicker>
      </footer>
    </section>
  );
}

function PillarSection({ num, title, accent, lead, body, side, children }) {
  const isLeft = side === 'left';
  return (
    <section style={{
      minHeight: '90vh', padding: '120px 80px', background: PAPER, color: INK,
      borderBottom: `1px solid rgba(11,18,32,0.08)`,
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: isLeft ? '1fr 1fr' : '1fr 1fr',
        gap: 100, alignItems: 'center',
      }}>
        {isLeft && (
          <div style={{
            background: '#fff', border: '1px solid rgba(11,18,32,0.08)', borderRadius: 8,
            padding: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 480,
          }}>
            {children}
          </div>
        )}
        <div>
          <Num>{num}</Num>
          <div style={{ marginTop: 16 }}>
            <Kicker color={ACCENT}>{accent}</Kicker>
          </div>
          <h2 style={{
            fontSize: 88, fontWeight: 600, letterSpacing: -2.8, lineHeight: 1,
            margin: '24px 0 28px',
          }}>{title}</h2>
          <p style={{
            fontSize: 26, lineHeight: 1.45, color: INK, fontWeight: 500,
            margin: '0 0 28px', maxWidth: 580, textWrap: 'pretty',
          }}>{lead}</p>
          <p style={{
            fontSize: 18, lineHeight: 1.65, color: '#2A3140', margin: 0, maxWidth: 580,
            textWrap: 'pretty',
          }}>{body}</p>
        </div>
        {!isLeft && (
          <div style={{
            background: '#fff', border: '1px solid rgba(11,18,32,0.08)', borderRadius: 8,
            padding: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 480,
          }}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Visualizations for each pillar
// ─────────────────────────────────────────────────────────────
function CircleVisual() {
  return (
    <svg width="380" height="380" viewBox="0 0 120 120" fill="none">
      {/* Concentric rings → wax seal stamping rings */}
      <circle cx="60" cy="60" r="54" fill="none" stroke={INK} strokeWidth="2.5" opacity="0.95" />
      <circle cx="60" cy="60" r="46" fill="none" stroke={INK} strokeWidth="0.6" opacity="0.5" />
      <circle cx="60" cy="60" r="38" fill="none" stroke={INK} strokeWidth="0.4" opacity="0.3" />
      <circle cx="60" cy="60" r="30" fill="none" stroke={INK} strokeWidth="0.3" opacity="0.2" />
      {/* Tick marks at cardinal points */}
      {[0, 90, 180, 270].map(a => {
        const rad = (a - 90) * Math.PI / 180;
        const x1 = 60 + 54 * Math.cos(rad);
        const y1 = 60 + 54 * Math.sin(rad);
        const x2 = 60 + 58 * Math.cos(rad);
        const y2 = 60 + 58 * Math.sin(rad);
        return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ACCENT} strokeWidth="1" strokeLinecap="round" />;
      })}
      <text x="60" y="64" textAnchor="middle"
        fontFamily="JetBrains Mono" fontSize="4.5" fill={MUTED} letterSpacing="0.4">SEALED</text>
    </svg>
  );
}

function DotVisual() {
  // The agent dot — surrounded by faint pulsing concentric rings (signal radiating)
  return (
    <svg width="380" height="380" viewBox="0 0 120 120" fill="none">
      {[60, 48, 36, 26, 18].map((r, i) => (
        <circle key={r} cx="60" cy="60" r={r} fill="none" stroke={INK}
          strokeWidth="0.5" opacity={0.06 + i * 0.06} strokeDasharray="2 2" />
      ))}
      <circle cx="60" cy="60" r="13" fill={INK} />
      {/* Small label */}
      <text x="60" y="100" textAnchor="middle"
        fontFamily="JetBrains Mono" fontSize="4" fill={MUTED} letterSpacing="0.4">ONE · CENTER · ALL</text>
    </svg>
  );
}

function WhiskersVisual() {
  // Just the whiskers — emphasized, no dot, no ring. Symmetry exposed.
  const cx = 60, cy = 60, dotR = 13;
  const xIn = dotR + 7, xOut = dotR + 24;
  const strokes = [{ yIn: -12, yOut: -15 }, { yIn: 0, yOut: 0 }, { yIn: 12, yOut: 15 }];
  return (
    <svg width="420" height="380" viewBox="0 0 120 120" fill="none">
      {/* Subtle vertical axis */}
      <line x1="60" y1="20" x2="60" y2="100" stroke={ACCENT} strokeWidth="0.3" strokeDasharray="1 1" />
      {/* Two-party labels */}
      <text x="14" y="60" textAnchor="middle"
        fontFamily="JetBrains Mono" fontSize="4" fill={MUTED} letterSpacing="0.3">PARTY A</text>
      <text x="106" y="60" textAnchor="middle"
        fontFamily="JetBrains Mono" fontSize="4" fill={MUTED} letterSpacing="0.3">PARTY B</text>
      {/* Whiskers */}
      {[1, -1].map(sign => strokes.map((s, i) => (
        <line key={`${sign}-${i}`}
          x1={cx + sign * xIn} y1={cy + s.yIn}
          x2={cx + sign * xOut} y2={cy + s.yOut}
          stroke={INK} strokeWidth="3" strokeLinecap="round" />
      )))}
      {/* Faint dot ghost */}
      <circle cx={cx} cy={cy} r={dotR} fill="none" stroke={INK} strokeWidth="0.4" strokeDasharray="0.6 0.6" opacity="0.5" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Together — closing
// ─────────────────────────────────────────────────────────────
function TogetherSection() {
  return (
    <section style={{
      minHeight: '100vh', padding: '120px 80px', background: INK, color: PAPER,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <Kicker color="rgba(244,241,234,0.55)">04 · Together</Kicker>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
        <div>
          <h2 style={{
            fontSize: 'clamp(64px, 8vw, 128px)', fontWeight: 600, letterSpacing: -3.8, lineHeight: 0.95,
            margin: '0 0 40px', color: PAPER,
          }}>
            A guardian<br />
            for every deal.
          </h2>
          <p style={{
            fontSize: 26, lineHeight: 1.5, color: 'rgba(244,241,234,0.85)',
            margin: 0, maxWidth: 580, textWrap: 'pretty',
          }}>
            An animal built to navigate uncertain environments
            becomes the guardian that <b style={{ color: ACCENT }}>watches</b>, <b style={{ color: ACCENT }}>senses</b>,
            and <b style={{ color: ACCENT }}>locks</b> every deal to completion.
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 40,
        }}>
          <div style={{
            width: 480, height: 480, borderRadius: '50%',
            border: `1px solid rgba(244,241,234,0.12)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: -1, borderRadius: '50%',
              border: `1px solid ${ACCENT}`, opacity: 0.25,
              animation: 'sealedRing 3.4s ease-out infinite',
            }} />
            <SealedMark size={300} color={PAPER} />
            <style>{`
              @keyframes sealedRing {
                0% { transform: scale(1); opacity: 0.4; }
                100% { transform: scale(1.18); opacity: 0; }
              }
            `}</style>
          </div>
        </div>
      </div>

      <footer style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        paddingTop: 80, borderTop: '1px solid rgba(244,241,234,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <SealedMark size={28} color={PAPER} />
          <Kicker color="rgba(244,241,234,0.55)">Sealed Agent · Brand Philosophy v1.0</Kicker>
        </div>
        <div style={{ display: 'flex', gap: 32 }}>
          <Kicker color="rgba(244,241,234,0.55)">hello@sealed.xyz</Kicker>
          <Kicker color="rgba(244,241,234,0.55)">Jakarta · Solana</Kicker>
        </div>
      </footer>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────
function PhilosophyApp() {
  return (
    <div style={{ background: PAPER, color: INK, minHeight: '100vh' }}>
      <HeroSection />
      <PillarSection
        num="01 / 03"
        accent="The Circle"
        title="A wax seal."
        side="right"
        lead="The ancient symbol of authenticity and finality."
        body="A deal that is sealed is binding, complete, and protected. The circle is not decoration — it is a contract pressed into the page. What is inside it cannot be undone."
      >
        <CircleVisual />
      </PillarSection>
      <PillarSection
        num="02 / 03"
        accent="The Dot"
        title="The agent."
        side="left"
        lead="One autonomous entity, sitting at the center of every deal."
        body="The dot is the seal's nose — and the agent itself. Not many agents in a swarm. One. Centered. Watching from the inside, executing on behalf of both sides without leaving the loop."
      >
        <DotVisual />
      </PillarSection>
      <PillarSection
        num="03 / 03"
        accent="The Whiskers"
        title="The senses."
        side="right"
        lead="Continuously detecting movement in dark, murky waters."
        body="A seal's whiskers are its primary sensors — feeling the smallest disturbances when sight fails. Here, they sense milestones, verify deliverables, and detect changes from both sides. Their symmetry is intentional: balance between two parties."
      >
        <WhiskersVisual />
      </PillarSection>
      <TogetherSection />
    </div>
  );
}

Object.assign(window, { PhilosophyApp });
