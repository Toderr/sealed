// Sealed — logo exploration v2
// Round 2: bolder, fresher metaphors. Less stamp/handshake, more agentic + animal in unexpected ways.
// Still: one ink on warm paper, primitives only, no decorative SVG.

const INK = '#0B1220';
const PAPER = '#F4F1EA';
const MUTED = '#6B7280';
const ACCENT = '#D97757';

// ─────────────────────────────────────────────────────────────
// 07 — Seal as bracket / parenthesis
// The arched body of a seal IS a `(` curve. Two of them = `( )` = scope, structure, code.
// Reads as a programmer's bracket AND a seal silhouette pair.
// ─────────────────────────────────────────────────────────────
function Mark07({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* left bracket-seal: thick arc with head bump */}
      <path d="M 44 28 Q 24 60 44 92" stroke={color} strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="44" cy="26" r="5.5" fill={color} />
      {/* right bracket-seal */}
      <path d="M 76 28 Q 96 60 76 92" stroke={color} strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="76" cy="26" r="5.5" fill={color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 08 — Diving seal (downward arc into escrow)
// The seal's diving motion — funds going down into the vault. Single sweeping arc.
// ─────────────────────────────────────────────────────────────
function Mark08({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* arc trajectory — dive */}
      <path d="M 18 36 Q 42 24 60 56 T 102 96"
        stroke={color} strokeWidth="3" strokeLinecap="round" fill="none"
        strokeDasharray="0.1 6" />
      {/* the seal head (entry point) */}
      <circle cx="18" cy="36" r="7" fill={color} />
      {/* the body — falling into the vault */}
      <ellipse cx="60" cy="58" rx="11" ry="6" fill={color} transform="rotate(38 60 58)" />
      {/* the vault — solid square at bottom-right */}
      <rect x="86" y="84" width="20" height="20" rx="2" fill={color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 09 — Single dot + tail (agent cursor / blink)
// The seal as a single confident dot with a short trailing arc — like a cursor pulse.
// Most reductive option. Pure agentic.
// ─────────────────────────────────────────────────────────────
function Mark09({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* trailing arc */}
      <path d="M 24 60 Q 50 50 72 60"
        stroke={color} strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.25" />
      <path d="M 40 60 Q 56 54 72 60"
        stroke={color} strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.55" />
      {/* the dot */}
      <circle cx="84" cy="60" r="13" fill={color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 10 — Modular grid seal (Swiss / Braun style)
// Seal built strictly on a 6×6 grid. Architectural, not cute. Premium feel.
// ─────────────────────────────────────────────────────────────
function Mark10({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* body — large half-circle on a baseline */}
      <path d="M 20 80 A 40 40 0 0 1 100 80 Z" fill={color} />
      {/* head — smaller circle perched on top-right of body */}
      <circle cx="86" cy="48" r="14" fill={color} />
      {/* eye — negative dot */}
      <circle cx="90" cy="46" r="2.2" fill={PAPER} />
      {/* baseline — the surface */}
      <line x1="14" y1="84" x2="106" y2="84" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 11 — Wordmark with sealed-tittle
// Pure typographic logo. The dot of "i"... wait, no i. Instead: the bowl of the "e"
// is closed (sealed) — a tiny solid wedge fills the e's aperture. Subtle, smart.
// ─────────────────────────────────────────────────────────────
function Mark11({ size = 120, color = INK }) {
  // Render "Se" with the e sealed; for use as a square mark, just the S with a sealed terminal
  const px = size;
  return (
    <div style={{
      width: px, height: px, display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative',
    }}>
      <div style={{
        fontFamily: 'Inter Tight, system-ui, sans-serif',
        fontWeight: 700,
        fontSize: px * 0.78,
        letterSpacing: -0.06 * px,
        color, lineHeight: 1, position: 'relative',
      }}>S</div>
      {/* sealing wedge — fills the bottom inner curve of the S */}
      <div style={{
        position: 'absolute',
        width: px * 0.13, height: px * 0.13,
        background: color,
        right: px * 0.18, bottom: px * 0.18,
        borderRadius: px * 0.02,
        transform: 'rotate(45deg)',
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 12 — Negative-space seal in a circle
// A solid disc with the seal cut out as negative space. Wax-seal energy without the cliché.
// The seal is just two ovals + a dot — but reading them through negative space feels premium.
// ─────────────────────────────────────────────────────────────
function Mark12({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <defs>
        <mask id="seal-mask-12">
          <rect width="120" height="120" fill="white" />
          {/* body cutout */}
          <ellipse cx="56" cy="68" rx="26" ry="11" fill="black" transform="rotate(-10 56 68)" />
          {/* head cutout */}
          <circle cx="78" cy="54" r="9" fill="black" />
          {/* tail flipper cutout */}
          <path d="M 30 64 Q 22 60 26 54" stroke="black" strokeWidth="4" strokeLinecap="round" fill="none" />
        </mask>
      </defs>
      <circle cx="60" cy="60" r="52" fill={color} mask="url(#seal-mask-12)" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 13 — Two stacked half-circles (lock / capsule / sealed pod)
// Top half = lid, bottom half = base. Together: a sealed capsule. Also reads as an eye / a coin edge-on.
// ─────────────────────────────────────────────────────────────
function Mark13({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* lid (top half-circle, slightly raised) */}
      <path d="M 18 60 A 42 42 0 0 1 102 60 L 102 56 L 18 56 Z" fill={color} />
      {/* base */}
      <path d="M 18 64 L 102 64 A 42 42 0 0 1 18 64 Z" fill={color} />
      {/* the seal seam — accent slit */}
      <line x1="40" y1="60" x2="80" y2="60" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 14 — Whiskers / signal radiating from a dot
// One bold dot (the seal/agent) with three short whisker-lines on each side.
// Extremely simple. Reads as both a face and a signal/broadcast.
// ─────────────────────────────────────────────────────────────
function Mark14({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* the dot */}
      <circle cx="60" cy="60" r="14" fill={color} />
      {/* left whiskers */}
      <line x1="38" y1="54" x2="20" y2="48" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="38" y1="60" x2="16" y2="60" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="38" y1="66" x2="20" y2="72" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* right whiskers */}
      <line x1="82" y1="54" x2="100" y2="48" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="82" y1="60" x2="104" y2="60" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="82" y1="66" x2="100" y2="72" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 15 — Stamp + check (sealed = approved)
// Circular stamp with a single confident checkmark cut out. The "deal closed" gesture.
// ─────────────────────────────────────────────────────────────
function Mark15({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="50" fill={color} />
      {/* checkmark — strong, slightly off-center */}
      <path d="M 36 62 L 54 78 L 86 44"
        stroke={PAPER} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 16 — The tilde-seal (~)
// A single bold tilde = the seal undulating through water. Mathy, agentic, code-flavored.
// "~" is also the home directory in unix → "your space, sealed"
// ─────────────────────────────────────────────────────────────
function Mark16({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <path d="M 14 66 Q 36 38 60 60 T 106 54"
        stroke={color} strokeWidth="12" strokeLinecap="round" fill="none" />
      {/* tiny accent dot — the head emerging */}
      <circle cx="106" cy="54" r="5" fill={ACCENT} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Wordmark + Lockup (reusable)
// ─────────────────────────────────────────────────────────────
function Wordmark2({ size = 28, color = INK, weight = 600, letterSpacing = -0.6 }) {
  return (
    <div style={{
      fontFamily: 'Inter Tight, system-ui, sans-serif',
      fontWeight: weight, fontSize: size, letterSpacing, color, lineHeight: 1,
    }}>Sealed</div>
  );
}

function Lockup2({ Mark, markSize = 48, wordSize = 28, color = INK, gap = 14 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <Mark size={markSize} color={color} />
      <Wordmark2 size={wordSize} color={color} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────
function LogoCard2({ title, note, Mark, tone = 'light' }) {
  const bg = tone === 'light' ? '#FFFFFF' : tone === 'paper' ? PAPER : INK;
  const fg = tone === 'dark' ? PAPER : INK;
  return (
    <DCArtboard label={title} width={340} height={420}>
      <div style={{
        width: '100%', height: '100%', background: bg,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '36px 28px', boxSizing: 'border-box',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mark size={160} color={fg} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Lockup2 Mark={Mark} markSize={34} wordSize={22} color={fg} />
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, lineHeight: 1.5,
            color: tone === 'dark' ? 'rgba(244,241,234,0.55)' : MUTED,
            letterSpacing: 0.2, textTransform: 'uppercase',
          }}>{note}</div>
        </div>
      </div>
    </DCArtboard>
  );
}

function ScaleStrip2({ Mark }) {
  return (
    <DCArtboard label="Scale — 16 / 24 / 40 / 80px" width={340} height={140}>
      <div style={{
        width: '100%', height: '100%', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '0 20px', boxSizing: 'border-box',
      }}>
        <Mark size={16} />
        <Mark size={24} />
        <Mark size={40} />
        <Mark size={80} />
      </div>
    </DCArtboard>
  );
}

function UsageStrip2({ Mark }) {
  return (
    <DCArtboard label="In context" width={340} height={140}>
      <div style={{
        width: '100%', height: '100%', background: '#fff',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      }}>
        <div style={{
          height: 34, background: '#ECE8DF', display: 'flex', alignItems: 'center',
          padding: '0 10px', gap: 8, borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, background: '#fff',
            padding: '4px 10px', borderRadius: 6, fontSize: 11,
            fontFamily: 'Inter Tight', color: INK, maxWidth: 180,
          }}>
            <Mark size={12} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Sealed — Deals</span>
          </div>
        </div>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 18px',
        }}>
          <Lockup2 Mark={Mark} markSize={22} wordSize={15} />
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 10, color: MUTED,
            padding: '4px 8px', border: `1px solid ${MUTED}`, borderRadius: 3,
          }}>devnet</div>
        </div>
      </div>
    </DCArtboard>
  );
}

function ConceptCard2() {
  return (
    <DCArtboard width={520} height={420}>
      <div style={{
        width: '100%', height: '100%', background: '#fff', padding: '36px 40px',
        boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: 1.2,
          textTransform: 'uppercase', color: MUTED,
        }}>Round 2 · Fresh metaphors</div>
        <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.6, color: INK, lineHeight: 1.1 }}>
          Less stamp. More signal.
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: '#2A3140' }}>
          Round 1 leaned on classical metaphors (wax seal, handshake). Round 2 pushes into
          territory that feels more <b>agentic and code-native</b>: brackets, cursors,
          tildes, dive-trajectories, modular grids, negative-space cutouts.
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: '#2A3140' }}>
          Marks 7 and 16 lean into "code symbol that happens to be a seal."
          14 strips it down to face + signal. 12 hides the seal in negative space — a quiet flex.
          15 is the one purely-functional alternative if simplicity wins outright.
        </div>
        <div style={{
          marginTop: 'auto',
          fontFamily: 'JetBrains Mono', fontSize: 10.5, lineHeight: 1.7, color: MUTED, letterSpacing: 0.2,
        }}>
          07 BRACKETS &nbsp; 08 DIVE &nbsp; 09 PULSE<br />
          10 GRID &nbsp; 11 SEALED-S &nbsp; 12 NEGATIVE<br />
          13 CAPSULE &nbsp; 14 WHISKERS &nbsp; 15 STAMP-CHECK &nbsp; 16 TILDE
        </div>
      </div>
    </DCArtboard>
  );
}

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────
function App() {
  const options = [
    { id: '07', Mark: Mark07, title: '07 · Brackets', note: 'Two seal silhouettes form ( ). Code scope = sealed scope. Programmer-native.' },
    { id: '08', Mark: Mark08, title: '08 · Diving seal → vault', note: 'Trajectory of funds into escrow. Story in one mark.' },
    { id: '09', Mark: Mark09, title: '09 · Pulse', note: 'A confident dot with a cursor trail. Most reductive. Pure agentic energy.' },
    { id: '10', Mark: Mark10, title: '10 · Modular grid seal', note: 'Swiss/Braun discipline. Architectural, premium, mascot-free.' },
    { id: '11', Mark: Mark11, title: '11 · Sealed-S monogram', note: 'A single S with a wax-wedge sealing its terminal. Pure typography.' },
    { id: '12', Mark: Mark12, title: '12 · Negative-space seal', note: 'Wax-disc energy without the cliché. The seal lives in the void.' },
    { id: '13', Mark: Mark13, title: '13 · Sealed capsule', note: 'Two halves meeting on an accent seam. Reads as lock, pod, coin.' },
    { id: '14', Mark: Mark14, title: '14 · Whiskers / signal', note: 'Face and broadcast at once. Maximum simplicity, full personality.' },
    { id: '15', Mark: Mark15, title: '15 · Stamp + check', note: 'Sealed = approved. The most utilitarian option.' },
    { id: '16', Mark: Mark16, title: '16 · Tilde wave', note: 'A bold ~ as the seal in water. Reads as code AND motion.' },
  ];

  return (
    <DesignCanvas>
      <DCSection
        title="Sealed · Logo exploration v2"
        subtitle="Round 2 — fresher metaphors. Brackets, cursors, tildes, dives. Same one-ink system; bolder ideas."
      >
        <ConceptCard2 />
      </DCSection>

      <DCSection title="Options 07 – 16" subtitle="Each with scale + in-context tests.">
        {options.map(o => (
          <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <LogoCard2 title={o.title} note={o.note} Mark={o.Mark} />
            <ScaleStrip2 Mark={o.Mark} />
            <UsageStrip2 Mark={o.Mark} />
          </div>
        ))}
      </DCSection>

      <DCSection title="Inverted — dark surface" subtitle="Hold up on ink-dark dashboards & wallet modals.">
        {options.map(o => (
          <DCArtboard key={o.id} label={o.title} width={240} height={240}>
            <div style={{
              width: '100%', height: '100%', background: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <o.Mark size={130} color={PAPER} />
            </div>
          </DCArtboard>
        ))}
      </DCSection>

      <DCSection title="App-icon grid" subtitle="Squared variants — favicon / home-screen.">
        {options.map(o => (
          <DCArtboard key={o.id} label={o.title} width={200} height={200}>
            <div style={{
              width: '100%', height: '100%', background: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 150, height: 150, background: PAPER, borderRadius: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <o.Mark size={100} color={INK} />
              </div>
            </div>
          </DCArtboard>
        ))}
      </DCSection>

      <DCSection title="Wordmark lockups — best of round" subtitle="How the strongest marks sit beside the type.">
        {[Mark07, Mark09, Mark10, Mark14, Mark16].map((M, i) => (
          <DCArtboard key={i} label={`Lockup ${i + 1}`} width={360} height={180}>
            <div style={{
              width: '100%', height: '100%', background: PAPER,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Lockup2 Mark={M} markSize={56} wordSize={36} />
            </div>
          </DCArtboard>
        ))}
      </DCSection>
    </DesignCanvas>
  );
}

Object.assign(window, { App });
