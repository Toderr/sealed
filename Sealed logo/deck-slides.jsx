// Sealed Agent — brand deck slides
// 1920x1080, draws on SealedMark / AgentPill / Lockup from logo-final.jsx

const INK = '#0B1220';
const PAPER = '#F4F1EA';
const ACCENT = '#D6A852';
const MUTED = '#6B7280';

function Slide({ children, bg = PAPER, label }) {
  return (
    <section className="slide" data-screen-label={label} style={{
      width: 1920, height: 1080, background: bg, position: 'relative',
      fontFamily: 'Inter Tight, system-ui, sans-serif', color: INK, overflow: 'hidden',
    }}>
      {children}
    </section>
  );
}

function SlideKicker({ children, color = MUTED }) {
  return (
    <div style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 14, letterSpacing: 2,
      textTransform: 'uppercase', color,
    }}>{children}</div>
  );
}

// 01 — Cover
function SlideCover() {
  return (
    <Slide label="01 Cover">
      <div style={{ position: 'absolute', top: 64, left: 80, right: 80, display: 'flex', justifyContent: 'space-between' }}>
        <SlideKicker>Sealed Agent · Brand mark · v1.0</SlideKicker>
        <SlideKicker>2025</SlideKicker>
      </div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 48,
      }}>
        <SealedMark size={360} />
        <div style={{ fontSize: 96, fontWeight: 600, letterSpacing: -3.5, lineHeight: 1 }}>
          Sealed Agent
        </div>
        <div style={{ fontSize: 28, color: MUTED, letterSpacing: -0.5, maxWidth: 900, textAlign: 'center', lineHeight: 1.4 }}>
          A face. A signal. Sealed.
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 64, left: 80, right: 80, display: 'flex', justifyContent: 'space-between' }}>
        <SlideKicker>Primary mark</SlideKicker>
        <SlideKicker>01 / 06</SlideKicker>
      </div>
    </Slide>
  );
}

// 02 — Construction
function SlideConstruction() {
  return (
    <Slide label="02 Construction" bg="#fff">
      <div style={{ position: 'absolute', top: 64, left: 80, right: 80 }}>
        <SlideKicker>02 · Construction</SlideKicker>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: -2, marginTop: 16, lineHeight: 1.05, maxWidth: 1100 }}>
          Everything lives on a 120 grid.
        </div>
      </div>
      <div style={{
        position: 'absolute', left: 80, bottom: 80, top: 280, width: 720,
        border: '1px solid rgba(11,18,32,0.08)', borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        <svg width="720" height="600" viewBox="0 0 120 100" style={{ position: 'absolute', inset: 0 }}>
          <line x1="0" y1="50" x2="120" y2="50" stroke={ACCENT} strokeWidth="0.2" strokeDasharray="1 1" />
          <line x1="60" y1="0" x2="60" y2="100" stroke={ACCENT} strokeWidth="0.2" strokeDasharray="1 1" />
          <circle cx="60" cy="50" r="36" fill="none" stroke={ACCENT} strokeWidth="0.2" strokeDasharray="1 1" />
        </svg>
        <SealedMark size={420} />
      </div>
      <div style={{ position: 'absolute', right: 80, bottom: 80, top: 280, width: 880,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div>
          <SlideKicker>Tokens</SlideKicker>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 32 }}>
            {[
              { name: 'Ink', value: '#0B1220', bg: INK, fg: '#fff' },
              { name: 'Paper', value: '#F4F1EA', bg: PAPER, fg: INK },
              { name: 'Accent', value: '#D6A852', bg: ACCENT, fg: INK },
              { name: 'Muted', value: '#6B7280', bg: '#fff', fg: MUTED, border: true },
            ].map(t => (
              <div key={t.name} style={{
                background: t.bg, color: t.fg, padding: '28px 32px',
                border: t.border ? '1px solid rgba(11,18,32,0.1)' : 'none',
                borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5 }}>{t.name}</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 16 }}>{t.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SlideKicker>Specs</SlideKicker>
          <div style={{ marginTop: 24, fontFamily: 'JetBrains Mono', fontSize: 18, lineHeight: 2, color: '#2A3140' }}>
            <div>Dot radius · 13u</div>
            <div>Whisker · taper 3.4 → 2.6u</div>
            <div>Ring radius · 54u · 1.5u stroke</div>
            <div>Whisker count · 3 per side</div>
          </div>
        </div>
      </div>
    </Slide>
  );
}

// 03 — Scale
function SlideScale() {
  return (
    <Slide label="03 Scale">
      <div style={{ position: 'absolute', top: 64, left: 80, right: 80 }}>
        <SlideKicker>03 · Scale</SlideKicker>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: -2, marginTop: 16 }}>
          Works from favicon to hero.
        </div>
      </div>
      <div style={{
        position: 'absolute', left: 80, right: 80, bottom: 100, top: 320,
        background: '#fff', borderRadius: 8, border: '1px solid rgba(11,18,32,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0 80px',
      }}>
        {[16, 24, 40, 72, 140, 280].map(s => (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <SealedMark size={s} />
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, color: MUTED }}>{s}px</div>
          </div>
        ))}
      </div>
    </Slide>
  );
}

// 04 — Agent pill
function SlideAgentPill() {
  return (
    <Slide label="04 Agent pill" bg={INK}>
      <div style={{ position: 'absolute', top: 64, left: 80, right: 80, color: PAPER }}>
        <SlideKicker color="rgba(244,241,234,0.55)">04 · Agent pill</SlideKicker>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: -2, marginTop: 16, color: PAPER, maxWidth: 1300 }}>
          Compact horizontal variant.
        </div>
        <div style={{ fontSize: 22, color: 'rgba(244,241,234,0.6)', marginTop: 16, maxWidth: 900, lineHeight: 1.5 }}>
          For chat avatars, attribution badges, AI-action labels.
        </div>
      </div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 48, paddingTop: 80,
      }}>
        <AgentPill height={120} dark={false} />
        <AgentPill height={84} dark={false} />
        <AgentPill height={56} dark={false} />
      </div>
    </Slide>
  );
}

// 05 — Lockups
function SlideLockups() {
  return (
    <Slide label="05 Lockups" bg="#fff">
      <div style={{ position: 'absolute', top: 64, left: 80, right: 80 }}>
        <SlideKicker>05 · Lockups</SlideKicker>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: -2, marginTop: 16 }}>
          Horizontal, stacked, inverted.
        </div>
      </div>
      <div style={{
        position: 'absolute', left: 80, right: 80, bottom: 100, top: 320,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40,
      }}>
        <div style={{
          background: PAPER, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Lockup markSize={120} wordSize={72} />
        </div>
        <div style={{
          background: INK, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Lockup markSize={120} wordSize={72} color={PAPER} />
        </div>
        <div style={{
          background: PAPER, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <StackedLockup markSize={140} wordSize={48} />
        </div>
        <div style={{
          background: '#fff', border: '1px solid rgba(11,18,32,0.08)', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <SealedMark size={220} ring={false} />
        </div>
      </div>
    </Slide>
  );
}

// 06 — In context
function SlideContext() {
  return (
    <Slide label="06 In context">
      <div style={{ position: 'absolute', top: 64, left: 80, right: 80 }}>
        <SlideKicker>06 · In context</SlideKicker>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: -2, marginTop: 16 }}>
          Browser, app icon, business card, chat.
        </div>
      </div>
      <div style={{
        position: 'absolute', left: 80, right: 80, bottom: 80, top: 320,
        display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 32,
      }}>
        {/* Browser */}
        <div style={{
          gridColumn: '1', gridRow: '1 / span 2',
          background: '#D9D5CC', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#FF5F57' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#FEBC2E' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#28C840' }} />
          </div>
          <div style={{
            background: PAPER, borderRadius: 10, padding: '14px 20px',
            display: 'inline-flex', alignItems: 'center', gap: 14, alignSelf: 'flex-start',
            fontSize: 22,
          }}>
            <SealedMark size={28} ring={false} />
            <span style={{ fontWeight: 600 }}>Sealed Agent — Deals</span>
            <span style={{ color: MUTED, marginLeft: 6 }}>×</span>
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 10, display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}>
            <SealedMark size={260} />
          </div>
        </div>
        {/* App icon dark */}
        <div style={{ background: '#E7E3DA', borderRadius: 12, display: 'flex',
          alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 200, height: 200, borderRadius: 44, background: INK,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 14px 30px rgba(0,0,0,0.18)',
          }}>
            <SealedMark size={130} color={PAPER} />
          </div>
        </div>
        {/* App icon light */}
        <div style={{ background: '#E7E3DA', borderRadius: 12, display: 'flex',
          alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 200, height: 200, borderRadius: 44, background: PAPER,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 14px 30px rgba(0,0,0,0.10)',
          }}>
            <SealedMark size={130} color={INK} />
          </div>
        </div>
        {/* Business card */}
        <div style={{
          background: PAPER, borderRadius: 12, border: '1px solid rgba(11,18,32,0.06)',
          padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <Lockup markSize={48} wordSize={32} />
          <div style={{ fontSize: 18, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600 }}>hello@sealed.xyz</div>
            <div style={{ color: MUTED, marginTop: 4 }}>Jakarta · Solana devnet</div>
          </div>
        </div>
        {/* Chat */}
        <div style={{
          gridColumn: '2 / span 2', background: '#fff', border: '1px solid rgba(11,18,32,0.06)',
          borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <SealedMark size={36} color={PAPER} ring={false} />
            </div>
            <div style={{
              background: PAPER, padding: '16px 22px', borderRadius: 14,
              fontSize: 20, lineHeight: 1.5, maxWidth: 700,
            }}>
              I sealed the deal at <b>2.4 SOL</b> with @maya. Settlement queued — you'll see it confirm in ~30 seconds.
            </div>
          </div>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, color: MUTED, paddingLeft: 72 }}>
            Sealed Agent · just now
          </div>
        </div>
      </div>
    </Slide>
  );
}

// Stacked lockup helper (logo-final.jsx has it but as separate component name)
function StackedLockup({ markSize = 100, wordSize = 32, color = INK, gap = 16 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
      <SealedMark size={markSize} color={color} />
      <Wordmark size={wordSize} color={color} />
    </div>
  );
}

function Deck() {
  return (
    <>
      <SlideCover />
      <SlideConstruction />
      <SlideScale />
      <SlideAgentPill />
      <SlideLockups />
      <SlideContext />
    </>
  );
}

Object.assign(window, { Deck, SlideCover, SlideConstruction, SlideScale, SlideAgentPill, SlideLockups, SlideContext });
