// Sealed — logo exploration
// Concept pillars: wax seal (stamp/circle mark), seal (marine mammal) abstracted to pure geometry,
// agentic cue (cursor/chat dot/node), and professional typographic stability.
// Palette: single ink color + warm off-white. No gradients. No decorative SVG beyond primitives.

const INK = '#0B1220';          // near-black, slight navy bias
const PAPER = '#F4F1EA';        // warm off-white (matches canvas bg feel)
const MUTED = '#6B7280';
const ACCENT = '#D97757';       // warm sealing-wax accent (used sparingly)

// ─────────────────────────────────────────────────────────────
// Logo variations
// Each is a pure SVG, sized to 160 viewbox height. Wordmark below.
// ─────────────────────────────────────────────────────────────

// 01 — Wax seal disc + embossed S
// The most direct "sealed deal" metaphor. Filled disc with cut-out S.
function Mark01({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="52" fill={color} />
      <circle cx="60" cy="60" r="52" fill="none" stroke={color} strokeWidth="1" />
      {/* inner hairline ring */}
      <circle cx="60" cy="60" r="44" fill="none" stroke={PAPER} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
      {/* S glyph, geometric — two half-circles */}
      <path d="M 46 46 A 10 10 0 0 1 66 46 A 10 10 0 0 0 86 46 M 34 74 A 10 10 0 0 0 54 74 A 10 10 0 0 1 74 74"
        stroke={PAPER} strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// 02 — Seal (animal) silhouette reduced to two circles + one arc
// The body as a tilted oval with a head circle and a flipper arc. Pure geometry.
function Mark02({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* containing ring — stamp reference */}
      <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="2" />
      {/* body oval */}
      <ellipse cx="58" cy="66" rx="30" ry="14" fill={color} transform="rotate(-12 58 66)" />
      {/* head */}
      <circle cx="82" cy="50" r="10" fill={color} />
      {/* eye — negative dot */}
      <circle cx="85" cy="48" r="1.6" fill={PAPER} />
      {/* flipper tail tip */}
      <path d="M 30 62 Q 22 58 26 52" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// 03 — Monogram S as a closing envelope / seal fold
// Two interlocking quarter-arcs forming an S within a square. Agentic = precise, constructed.
function Mark03({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <rect x="12" y="12" width="96" height="96" rx="14" fill={color} />
      {/* S from two arcs */}
      <path d="M 40 44 A 18 18 0 1 1 58 62 A 18 18 0 1 0 76 80"
        stroke={PAPER} strokeWidth="10" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// 04 — Handshake-through-circle: two semicircles meeting at center (deal sealed)
function Mark04({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="3" />
      {/* left half */}
      <path d="M 60 22 A 38 38 0 0 0 60 98" stroke={color} strokeWidth="10" strokeLinecap="round" fill="none" />
      {/* right half, offset for "shake" */}
      <path d="M 60 22 A 38 38 0 0 1 60 98" stroke={color} strokeWidth="10" strokeLinecap="round" fill="none" />
      {/* center meeting dot — the agent */}
      <circle cx="60" cy="60" r="5" fill={ACCENT} />
    </svg>
  );
}

// 05 — Seal as a single bold dot on a baseline arc (whiskered minimal seal)
function Mark05({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* water/baseline arc */}
      <path d="M 14 84 Q 60 70 106 84" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* body */}
      <ellipse cx="60" cy="70" rx="26" ry="11" fill={color} />
      {/* head bump */}
      <circle cx="82" cy="62" r="9" fill={color} />
      {/* eye */}
      <circle cx="85" cy="60" r="1.6" fill={PAPER} />
      {/* whisker/signal lines — agentic "listening" cue */}
      <line x1="96" y1="58" x2="102" y2="56" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="96" y1="62" x2="103" y2="62" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// 06 — Cursor-seal: the S drawn like a cursor path with a terminal dot (agentic primary)
function Mark06({ size = 120, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* outer ring — subtle */}
      <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="1.25" opacity="0.25" />
      {/* S path */}
      <path d="M 44 42 A 14 14 0 1 1 60 58 A 14 14 0 1 0 76 74"
        stroke={color} strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* terminal node dot — agent output */}
      <circle cx="76" cy="74" r="5" fill={ACCENT} />
      {/* origin node dot */}
      <circle cx="44" cy="42" r="3" fill={color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Wordmark component — used under each mark and standalone
// ─────────────────────────────────────────────────────────────
function Wordmark({ size = 28, color = INK, weight = 600, letterSpacing = -0.6 }) {
  return (
    <div style={{
      fontFamily: 'Inter Tight, system-ui, sans-serif',
      fontWeight: weight,
      fontSize: size,
      letterSpacing,
      color,
      lineHeight: 1,
    }}>Sealed</div>
  );
}

// Lockup — mark + wordmark horizontal
function Lockup({ Mark, markSize = 48, wordSize = 28, color = INK, gap = 14 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <Mark size={markSize} color={color} />
      <Wordmark size={wordSize} color={color} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Presentation cards
// ─────────────────────────────────────────────────────────────
function LogoCard({ title, note, Mark, tone = 'light' }) {
  const bg = tone === 'light' ? '#FFFFFF' : tone === 'paper' ? PAPER : INK;
  const fg = tone === 'dark' ? PAPER : INK;
  return (
    <DCArtboard label={title} width={340} height={420}>
      <div style={{
        width: '100%', height: '100%',
        background: bg,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '36px 28px',
        boxSizing: 'border-box',
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Mark size={160} color={fg} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Lockup Mark={Mark} markSize={34} wordSize={22} color={fg} />
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10.5, lineHeight: 1.5, color: tone === 'dark' ? 'rgba(244,241,234,0.55)' : MUTED,
            letterSpacing: 0.2, textTransform: 'uppercase',
          }}>{note}</div>
        </div>
      </div>
    </DCArtboard>
  );
}

// Small-size test strip
function ScaleStrip({ Mark }) {
  return (
    <DCArtboard label="Scale test — 16 / 24 / 40 / 80px" width={340} height={140}>
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

// Contextual usage — favicon, app icon, header
function UsageStrip({ Mark }) {
  return (
    <DCArtboard label="In context" width={340} height={140}>
      <div style={{
        width: '100%', height: '100%', background: '#fff',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      }}>
        {/* fake browser tab */}
        <div style={{
          height: 34, background: '#ECE8DF', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11,
            fontFamily: 'Inter Tight', color: INK, maxWidth: 180,
          }}>
            <Mark size={12} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Sealed — Deals</span>
          </div>
        </div>
        {/* fake app header */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 18px',
        }}>
          <Lockup Mark={Mark} markSize={22} wordSize={15} />
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 10, color: MUTED,
            padding: '4px 8px', border: `1px solid ${MUTED}`, borderRadius: 3,
          }}>devnet</div>
        </div>
      </div>
    </DCArtboard>
  );
}

// ─────────────────────────────────────────────────────────────
// Construction / concept note card
// ─────────────────────────────────────────────────────────────
function ConceptCard() {
  return (
    <DCArtboard width={520} height={420}>
      <div style={{
        width: '100%', height: '100%', background: '#fff', padding: '36px 40px',
        boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: 1.2,
          textTransform: 'uppercase', color: MUTED,
        }}>Brief · 2026-04-18</div>
        <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.6, color: INK, lineHeight: 1.1 }}>
          A mark for Sealed
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: '#2A3140' }}>
          Three ideas had to fit in one mark: <b>a sealed deal</b> (wax stamp, closure, trust),
          <b> a seal</b> the animal (the name pun, a mascot-lite feel), and <b>an agent</b>
          (something that acts on your behalf — precise, constructed, not decorative).
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: '#2A3140' }}>
          Every option below is built from primitives only — circles, arcs, straight lines.
          One ink color on warm paper. Wordmark set in Inter Tight at a tight 600.
          The accent (warm wax red) appears only where it carries meaning: the node, the handshake center.
        </div>
        <div style={{
          marginTop: 'auto',
          fontFamily: 'JetBrains Mono', fontSize: 10.5, lineHeight: 1.7, color: MUTED,
          letterSpacing: 0.2,
        }}>
          INK &nbsp; {INK}<br />
          PAPER &nbsp; {PAPER}<br />
          ACCENT &nbsp; {ACCENT} <span style={{ display: 'inline-block', width: 10, height: 10, background: ACCENT, verticalAlign: 'middle', marginLeft: 4 }} />
        </div>
      </div>
    </DCArtboard>
  );
}

// Hero recommended pick
function HeroPick({ Mark, title, reason }) {
  return (
    <DCArtboard label="★ Recommended" width={720} height={420}>
      <div style={{
        width: '100%', height: '100%', background: PAPER,
        display: 'grid', gridTemplateColumns: '1fr 1fr',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: `1px solid rgba(11,18,32,0.08)` }}>
          <Mark size={220} color={INK} />
        </div>
        <div style={{
          padding: '40px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16,
        }}>
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: 1.4,
            textTransform: 'uppercase', color: MUTED,
          }}>Primary mark</div>
          <Lockup Mark={Mark} markSize={44} wordSize={32} />
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#2A3140' }}>{reason}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 24, alignItems: 'center' }}>
            <Mark size={18} />
            <Mark size={28} />
            <Mark size={44} />
          </div>
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
    { id: '01', Mark: Mark01, title: '01 · Wax-seal disc', note: 'Direct "sealed deal" metaphor. Reads as a stamp, embossed S glyph.' },
    { id: '02', Mark: Mark02, title: '02 · Seal in stamp', note: 'The animal, reduced to three primitives, inside a stamp ring.' },
    { id: '03', Mark: Mark03, title: '03 · Monogram square', note: 'S built from two arcs. Solid, institutional, API-icon friendly.' },
    { id: '04', Mark: Mark04, title: '04 · Handshake circle', note: 'Two parties meeting on-chain. Accent dot = the agent mediating.' },
    { id: '05', Mark: Mark05, title: '05 · Seal on waterline', note: 'The animal most legibly. Whiskers double as signal lines.' },
    { id: '06', Mark: Mark06, title: '06 · Cursor-path S', note: 'Agentic-forward. S drawn as an agent trajectory between two nodes.' },
  ];

  return (
    <DesignCanvas>
      <DCSection
        title="Sealed · Logo exploration"
        subtitle="Minimalist marks — professional, simple, evoking seal (animal + wax stamp) with an agentic cue. One ink on warm paper; accent only where it carries meaning."
      >
        <ConceptCard />
        <HeroPick
          Mark={Mark06}
          reason='Option 06 leads the pack for an agent-first product. The S traces a trajectory between two nodes — origin → settlement — which is literally what the agent does (structure → negotiate → escrow → release). Reads as both an "S" and a signal path. Warm-wax accent lands only on the terminal node.'
        />
      </DCSection>

      <DCSection title="Options" subtitle="Six directions, same system. Tap scale and in-context strips below each.">
        {options.map(o => (
          <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <LogoCard title={o.title} note={o.note} Mark={o.Mark} />
            <ScaleStrip Mark={o.Mark} />
            <UsageStrip Mark={o.Mark} />
          </div>
        ))}
      </DCSection>

      <DCSection title="Inverted — dark surface test" subtitle="Every mark must hold up on ink-dark surfaces (dashboards, wallet modals).">
        {options.map(o => (
          <DCArtboard key={o.id} label={o.title} width={260} height={260}>
            <div style={{
              width: '100%', height: '100%', background: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <o.Mark size={130} color={PAPER} />
            </div>
          </DCArtboard>
        ))}
      </DCSection>

      <DCSection title="Monogram grid — favicon / app icon" subtitle="Squared variants for 16 / 32 / 512 contexts.">
        {options.map(o => (
          <DCArtboard key={o.id} label={o.title} width={220} height={220}>
            <div style={{
              width: '100%', height: '100%',
              background: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 160, height: 160, background: PAPER,
                borderRadius: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <o.Mark size={110} color={INK} />
              </div>
            </div>
          </DCArtboard>
        ))}
      </DCSection>
    </DesignCanvas>
  );
}

Object.assign(window, { App });
