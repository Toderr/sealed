// Sealed — Logo v3: refining Mark 14 (Whiskers / Signal)
// Core gesture: a confident dot (the seal's face / the agent) with whisker-lines
// radiating outward — reads simultaneously as face and as signal/broadcast.
//
// This round explores variations: proportions, whisker count, asymmetry, weight,
// eye treatment, accent usage, and how it locks up with the wordmark.

const INK = '#0B1220';
const PAPER = '#F4F1EA';
const MUTED = '#6B7280';
const ACCENT = '#D97757';

// ─────────────────────────────────────────────────────────────
// Base renderer — parametric whiskers mark
// All variations run through this. Strict primitives only.
// ─────────────────────────────────────────────────────────────
function WhiskerMark({
  size = 120,
  color = INK,
  dotR = 14,                  // dot radius
  whiskers = 3,               // whiskers per side
  whiskerLen = 22,            // length of middle whisker
  whiskerGap = 6,             // vertical spacing between whiskers
  whiskerWeight = 2.5,
  whiskerSpread = 6,          // vertical outward taper of top/bot whiskers
  symmetric = true,           // false = right-side only
  eye = false,                // negative-space eye dot
  accentDot = false,          // accent-colored dot
  ring = false,               // subtle outer ring
  accentWhisker = null,       // index of whisker to tint accent (e.g. 0 = top)
}) {
  const cx = 60, cy = 60;
  const whiskerStart = dotR + 8;
  const whiskerEnd = whiskerStart + whiskerLen;
  // whisker y-positions symmetric around cy
  const ys = [];
  const mid = (whiskers - 1) / 2;
  for (let i = 0; i < whiskers; i++) ys.push((i - mid) * whiskerGap);
  const dotColor = accentDot ? ACCENT : color;

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {ring && (
        <circle cx={cx} cy={cy} r="54" fill="none" stroke={color} strokeWidth="1" opacity="0.2" />
      )}
      {/* whiskers */}
      {ys.map((yOff, i) => {
        // outer whiskers fan out
        const tipYOff = yOff * (1 + (whiskerSpread / 10) * Math.sign(yOff));
        const stroke = accentWhisker === i ? ACCENT : color;
        return (
          <React.Fragment key={i}>
            <line
              x1={cx + whiskerStart} y1={cy + yOff}
              x2={cx + whiskerEnd}   y2={cy + tipYOff}
              stroke={stroke} strokeWidth={whiskerWeight} strokeLinecap="round"
            />
            {symmetric && (
              <line
                x1={cx - whiskerStart} y1={cy + yOff}
                x2={cx - whiskerEnd}   y2={cy + tipYOff}
                stroke={stroke} strokeWidth={whiskerWeight} strokeLinecap="round"
              />
            )}
          </React.Fragment>
        );
      })}
      {/* dot */}
      <circle cx={cx} cy={cy} r={dotR} fill={dotColor} />
      {/* eye */}
      {eye && <circle cx={cx + dotR * 0.3} cy={cy - dotR * 0.15} r={Math.max(1.4, dotR * 0.12)} fill={PAPER} />}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Named variations (locked configurations)
// ─────────────────────────────────────────────────────────────
const V = {
  A: (p = {}) => <WhiskerMark {...p} dotR={14} whiskers={3} whiskerLen={22} whiskerGap={6} whiskerWeight={2.5} />,
  B: (p = {}) => <WhiskerMark {...p} dotR={13} whiskers={2} whiskerLen={26} whiskerGap={8} whiskerWeight={3} />,
  C: (p = {}) => <WhiskerMark {...p} dotR={15} whiskers={4} whiskerLen={18} whiskerGap={5} whiskerWeight={2} />,
  D: (p = {}) => <WhiskerMark {...p} dotR={12} whiskers={3} whiskerLen={24} whiskerGap={7} whiskerWeight={2.2} symmetric={false} />,
  E: (p = {}) => <WhiskerMark {...p} dotR={16} whiskers={3} whiskerLen={20} whiskerGap={6} whiskerWeight={2.5} eye />,
  F: (p = {}) => <WhiskerMark {...p} dotR={14} whiskers={3} whiskerLen={22} whiskerGap={6} whiskerWeight={2.5} accentDot />,
  G: (p = {}) => <WhiskerMark {...p} dotR={13} whiskers={3} whiskerLen={22} whiskerGap={6} whiskerWeight={2.5} accentWhisker={1} />,
  H: (p = {}) => <WhiskerMark {...p} dotR={14} whiskers={3} whiskerLen={22} whiskerGap={6} whiskerWeight={2.5} ring />,
  // bolder / larger variants
  I: (p = {}) => <WhiskerMark {...p} dotR={18} whiskers={3} whiskerLen={18} whiskerGap={7} whiskerWeight={3} />,
  J: (p = {}) => <WhiskerMark {...p} dotR={10} whiskers={3} whiskerLen={28} whiskerGap={5} whiskerWeight={2} />,
};

// ─────────────────────────────────────────────────────────────
// Wordmark + Lockups
// ─────────────────────────────────────────────────────────────
function Wordmark3({ size = 28, color = INK, weight = 600, letterSpacing = -0.6 }) {
  return (
    <div style={{
      fontFamily: 'Inter Tight, system-ui, sans-serif',
      fontWeight: weight, fontSize: size, letterSpacing, color, lineHeight: 1,
    }}>Sealed</div>
  );
}

function Lockup3({ Mark, markSize = 48, wordSize = 28, color = INK, gap = 14 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <Mark size={markSize} color={color} />
      <Wordmark3 size={wordSize} color={color} />
    </div>
  );
}

// Stacked lockup: mark on top, wordmark below
function StackedLockup({ Mark, markSize = 80, wordSize = 24, color = INK, gap = 14 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
      <Mark size={markSize} color={color} />
      <Wordmark3 size={wordSize} color={color} />
    </div>
  );
}

// Integrated lockup: whiskers reach out from the S of "Sealed"
// The mark becomes the S — a fully-integrated wordmark.
function IntegratedLockup({ size = 72, color = INK }) {
  // size = x-height target in px
  const cx = size * 0.42;
  const cy = size * 0.5;
  const dotR = size * 0.22;
  const len = size * 0.32;
  const gap = size * 0.09;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: size * 0.08,
      fontFamily: 'Inter Tight, system-ui, sans-serif',
      fontWeight: 600, fontSize: size * 1.2, letterSpacing: -size * 0.04,
      color, lineHeight: 1,
    }}>
      <svg width={size * 0.85} height={size} viewBox={`0 0 ${size * 0.85} ${size}`}>
        {/* left whiskers only — acts as signal coming INTO the wordmark */}
        {[-1, 0, 1].map(i => (
          <line
            key={i}
            x1={cx - dotR - size * 0.12}
            y1={cy + i * gap}
            x2={cx - dotR - size * 0.12 - len}
            y2={cy + i * gap * 1.4}
            stroke={color} strokeWidth={size * 0.035} strokeLinecap="round"
          />
        ))}
        <circle cx={cx} cy={cy} r={dotR} fill={color} />
      </svg>
      <span>ealed</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────
function VariantCard({ label, note, Mark, tone = 'light', big = 160 }) {
  const bg = tone === 'light' ? '#FFFFFF' : tone === 'paper' ? PAPER : INK;
  const fg = tone === 'dark' ? PAPER : INK;
  return (
    <DCArtboard label={label} width={280} height={340}>
      <div style={{
        width: '100%', height: '100%', background: bg,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '28px 24px', boxSizing: 'border-box',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mark size={big} color={fg} />
        </div>
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 10.5, lineHeight: 1.5,
          color: tone === 'dark' ? 'rgba(244,241,234,0.55)' : MUTED,
          letterSpacing: 0.2, textTransform: 'uppercase',
        }}>{note}</div>
      </div>
    </DCArtboard>
  );
}

function ScaleRow({ Mark }) {
  return (
    <DCArtboard label="Scale — 14 / 20 / 32 / 56 / 96 px" width={600} height={140}>
      <div style={{
        width: '100%', height: '100%', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      }}>
        {[14, 20, 32, 56, 96].map(s => <Mark key={s} size={s} />)}
      </div>
    </DCArtboard>
  );
}

function HeroPanel({ Mark }) {
  return (
    <DCArtboard label="Recommended · A" width={900} height={460}>
      <div style={{
        width: '100%', height: '100%', background: PAPER,
        display: 'grid', gridTemplateColumns: '1.1fr 1fr',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRight: '1px solid rgba(11,18,32,0.08)',
        }}>
          <Mark size={260} color={INK} />
        </div>
        <div style={{ padding: '44px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{
            fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: 1.4,
            textTransform: 'uppercase', color: MUTED,
          }}>Round 3 · Refining #14</div>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.6, color: INK, lineHeight: 1.1 }}>
            A face. A signal.<br />One mark.
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: '#2A3140' }}>
            The dot reads as the seal's face — simple, present, confident. The whiskers
            double as broadcast lines: the agent listening and speaking on your behalf.
            This sheet explores proportion, whisker count, symmetry, and accent usage
            so we can lock the final version.
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 24 }}>
            <Mark size={20} /> <Mark size={32} /> <Mark size={52} /> <Mark size={80} />
          </div>
        </div>
      </div>
    </DCArtboard>
  );
}

function WordmarkExamples() {
  const H = (p = {}) => <WhiskerMark {...p} dotR={14} whiskers={3} whiskerLen={22} whiskerGap={6} whiskerWeight={2.5} />;
  return (
    <>
      <DCArtboard label="Horizontal lockup" width={440} height={180}>
        <div style={{
          width: '100%', height: '100%', background: PAPER,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lockup3 Mark={H} markSize={56} wordSize={36} />
        </div>
      </DCArtboard>
      <DCArtboard label="Stacked lockup" width={280} height={280}>
        <div style={{
          width: '100%', height: '100%', background: PAPER,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <StackedLockup Mark={H} markSize={100} wordSize={26} />
        </div>
      </DCArtboard>
      <DCArtboard label="Integrated — mark replaces the S" width={440} height={180}>
        <div style={{
          width: '100%', height: '100%', background: PAPER,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <IntegratedLockup size={44} />
        </div>
      </DCArtboard>
      <DCArtboard label="Inverted — dark surface" width={440} height={180}>
        <div style={{
          width: '100%', height: '100%', background: INK,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lockup3 Mark={H} markSize={56} wordSize={36} color={PAPER} />
        </div>
      </DCArtboard>
    </>
  );
}

function InContextPanel() {
  const H = (p = {}) => <WhiskerMark {...p} dotR={14} whiskers={3} whiskerLen={22} whiskerGap={6} whiskerWeight={2.5} />;
  return (
    <>
      {/* Browser tab */}
      <DCArtboard label="Browser tab · favicon" width={420} height={200}>
        <div style={{
          width: '100%', height: '100%', background: '#D9D5CC',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            height: 38, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fff', padding: '6px 12px', borderTopLeftRadius: 8, borderTopRightRadius: 8,
              fontSize: 12, fontFamily: 'Inter Tight', color: INK,
            }}>
              <H size={14} />
              <span>Sealed — Deals</span>
              <span style={{ marginLeft: 6, color: MUTED, fontSize: 11 }}>×</span>
            </div>
          </div>
          <div style={{ flex: 1, background: '#fff', padding: '16px 18px' }}>
            <Lockup3 Mark={H} markSize={22} wordSize={15} />
          </div>
        </div>
      </DCArtboard>

      {/* Business card */}
      <DCArtboard label="Business card · 3.5 × 2 in" width={420} height={240}>
        <div style={{
          width: '100%', height: '100%', background: PAPER,
          padding: '28px 28px', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <Lockup3 Mark={H} markSize={30} wordSize={20} />
          <div style={{ fontFamily: 'Inter Tight', fontSize: 12, color: INK, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600 }}>Pengusaha Indonesia</div>
            <div style={{ color: MUTED }}>hello@sealed.xyz</div>
          </div>
        </div>
      </DCArtboard>

      {/* App icon */}
      <DCArtboard label="App icon · iOS-style" width={240} height={240}>
        <div style={{
          width: '100%', height: '100%', background: '#E7E3DA',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 160, height: 160, background: INK, borderRadius: 38,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
          }}>
            <H size={110} color={PAPER} />
          </div>
        </div>
      </DCArtboard>

      {/* Loading state */}
      <DCArtboard label="Loading state" width={240} height={240}>
        <div style={{
          width: '100%', height: '100%', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="sealed-pulse">
            <H size={90} />
          </div>
          <style>{`
            .sealed-pulse { animation: sealedPulse 1.8s ease-in-out infinite; }
            @keyframes sealedPulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.55; transform: scale(0.96); }
            }
          `}</style>
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
        title="Sealed · Logo v3 — refining Whiskers"
        subtitle="Ten parametric variants of mark #14. Dot size, whisker count, symmetry, accent. Pick the one that feels right — we lock from there."
      >
        <HeroPanel Mark={V.A} />
      </DCSection>

      <DCSection title="Dot + whisker proportions" subtitle="Same gesture, different balances of face-to-signal.">
        <VariantCard label="A · Baseline" note="Balanced — 14px dot, 3 whiskers, medium length" Mark={V.A} />
        <VariantCard label="B · Bold / 2-whisker" note="Bigger presence. Reads as eyes + whisker" Mark={V.B} />
        <VariantCard label="C · Dense / 4-whisker" note="More whiskers. Richer signal feel" Mark={V.C} />
        <VariantCard label="I · Dot-forward" note="Chunky dot, short whiskers. Max legible at 16px" Mark={V.I} />
        <VariantCard label="J · Signal-forward" note="Small dot, long whiskers. Reads as broadcast" Mark={V.J} />
      </DCSection>

      <DCSection title="Character variations" subtitle="Small tweaks that change the personality.">
        <VariantCard label="D · Asymmetric" note="Right side only — listening, cursor-like" Mark={V.D} />
        <VariantCard label="E · With eye" note="Negative-space eye — more animal, more character" Mark={V.E} />
        <VariantCard label="F · Accent dot" note="Wax-red dot. Warm, alive" Mark={V.F} />
        <VariantCard label="G · Accent whisker" note="One accent stroke — subtle signal" Mark={V.G} />
        <VariantCard label="H · With ring" note="Soft ring halo — stamp adjacency" Mark={V.H} />
      </DCSection>

      <DCSection title="Scale — does A hold up?" subtitle="The baseline across favicon to hero sizes.">
        <ScaleRow Mark={V.A} />
      </DCSection>

      <DCSection title="Wordmark lockups" subtitle="How the baseline (A) sits beside and inside the wordmark.">
        <WordmarkExamples />
      </DCSection>

      <DCSection title="In context" subtitle="Favicon, card, app icon, loading state.">
        <InContextPanel />
      </DCSection>

      <DCSection title="All ten on dark" subtitle="Dashboard / wallet-modal surface test.">
        {Object.entries(V).map(([k, Mark]) => (
          <DCArtboard key={k} label={k} width={180} height={180}>
            <div style={{
              width: '100%', height: '100%', background: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mark size={110} color={PAPER} />
            </div>
          </DCArtboard>
        ))}
      </DCSection>
    </DesignCanvas>
  );
}

Object.assign(window, { App });
