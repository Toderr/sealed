"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { SealedMark } from "@/components/SealedLogo";
import { SealedBackdrop } from "@/components/SealedBackdrop";
import { useProfileStore } from "@/lib/profile-store";
import { supabase } from "@/lib/supabase";

type StyleIndex = 0 | 1 | 2;
type ToneId = "formal" | "warm" | "direct";

interface Persona {
  id: string;
  name: string;
  style: StyleIndex;
  floor: number;
  rounds: number;
  tone: ToneId;
  deals: number;
  openingLine: string;
}

const STYLE_LABELS = ["Firm", "Flexible", "Collaborative"] as const;
const STYLE_COLORS = ["var(--danger)", "var(--accent)", "var(--success)"] as const;
const STYLE_BG = ["rgba(248,113,113,0.15)", "rgba(113,112,255,0.15)", "rgba(16,185,129,0.15)"] as const;
const STYLE_DESC = [
  "Holds the asking price aggressively. Walks away rather than make concessions. Best for one-off deals with strong leverage.",
  "Balanced. Offers small trade-offs in exchange for larger wins. Default for most deals.",
  "Seeks alignment over wins. Slower to escalate. Best for retainers and long-term partnerships.",
] as const;

const DEFAULT_PERSONA: Persona = {
  id: "default",
  name: "Standard vendor terms",
  style: 1,
  floor: 80,
  rounds: 3,
  tone: "formal",
  deals: 0,
  openingLine: "Hi — I'm representing you on this deal. Happy to walk through the milestones and arrive at terms that work for both of us.",
};

export default function AgentSettingsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { profile } = useProfileStore(wallet);

  const [personas, setPersonas] = useState<Persona[]>([DEFAULT_PERSONA]);
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields for selected persona
  const [style, setStyle] = useState<StyleIndex>(1);
  const [floor, setFloor] = useState(80);
  const [rounds, setRounds] = useState(3);
  const [tone, setTone] = useState<ToneId>("formal");
  const [openingLine, setOpeningLine] = useState(DEFAULT_PERSONA.openingLine);
  const [personaName, setPersonaName] = useState(DEFAULT_PERSONA.name);

  // Load from Supabase on mount
  useEffect(() => {
    if (!wallet) return;
    Promise.resolve(
      supabase
        .from("sealed_agent_templates")
        .select("*")
        .eq("wallet", wallet)
    ).then(({ data }) => {
      if (data && data.length > 0) {
        const loaded: Persona[] = data.map((row) => ({
          id: row.id ?? row.template_id ?? String(Math.random()),
          name: row.name ?? row.template_name ?? "Unnamed",
          style: (row.style_index ?? 1) as StyleIndex,
          floor: row.price_floor ?? 80,
          rounds: row.escalate_after ?? 3,
          tone: (row.tone ?? "formal") as ToneId,
          deals: row.deals_count ?? 0,
          openingLine: row.opening_line ?? DEFAULT_PERSONA.openingLine,
        }));
        setPersonas(loaded);
        syncFromPersona(loaded[0]);
      }
    }).catch(() => {});
  }, [wallet]);

  function syncFromPersona(p: Persona) {
    setStyle(p.style);
    setFloor(p.floor);
    setRounds(p.rounds);
    setTone(p.tone);
    setOpeningLine(p.openingLine);
    setPersonaName(p.name);
  }

  function handleSelect(i: number) {
    setSelected(i);
    syncFromPersona(personas[i]);
    setSaved(false);
  }

  async function handleSave() {
    if (!wallet) return;
    setSaving(true);
    const current = personas[selected];
    const payload = {
      wallet,
      name: personaName,
      style_index: style,
      price_floor: floor,
      escalate_after: rounds,
      tone,
      opening_line: openingLine,
    };

    try {
      if (current.id === "default" || !current.id) {
        const { data } = await supabase
          .from("sealed_agent_templates")
          .insert(payload)
          .select()
          .single();
        if (data) {
          const updated = [...personas];
          updated[selected] = { ...current, id: data.id ?? data.template_id, name: personaName, style, floor, rounds, tone, openingLine };
          setPersonas(updated);
        }
      } else {
        await supabase
          .from("sealed_agent_templates")
          .update(payload)
          .eq("id", current.id)
          .eq("wallet", wallet);
        const updated = [...personas];
        updated[selected] = { ...current, name: personaName, style, floor, rounds, tone, openingLine };
        setPersonas(updated);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // save failed silently
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", display: "flex", flexDirection: "column", position: "relative" }}>
      <SealedBackdrop />

      {/* Header */}
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 22px",
        height: 52,
        borderBottom: "1px solid var(--card-border-subtle)",
        background: "var(--panel)",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Link href="/app" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)", textDecoration: "none" }}>
            <SealedMark size={22} />
            <span style={{ fontSize: 13, fontWeight: 510 }}>Sealed Agent</span>
          </Link>
          <nav style={{ display: "flex", gap: 2 }}>
            {[
              { label: "Deals", href: "/app" },
              { label: "New Deal", href: "/app" },
              { label: "Agent", href: "/app/agent" },
              { label: "Profile", href: wallet ? `/profile/${wallet}` : "/profile" },
            ].map((t) => (
              <Link
                key={t.label}
                href={t.href}
                style={{
                  padding: "0 11px",
                  height: 30,
                  fontSize: 13,
                  fontWeight: 510,
                  borderRadius: 6,
                  color: t.label === "Agent" ? "var(--primary)" : "var(--muted)",
                  background: t.label === "Agent" ? "rgba(255,255,255,0.05)" : "transparent",
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                  lineHeight: "30px",
                }}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        {wallet && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 30,
            padding: "0 10px",
            borderRadius: 6,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--card-border)",
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              background: "linear-gradient(135deg, #5e6ad2, #7170ff)",
            }} />
            <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "var(--muted)" }}>
              {wallet.slice(0, 4)}…{wallet.slice(-4)}
            </span>
          </div>
        )}
      </header>

      {/* Two-column layout */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "280px 1fr", overflow: "hidden", position: "relative", zIndex: 1 }}>
        {/* Persona list sidebar */}
        <aside style={{
          borderRight: "1px solid var(--card-border-subtle)",
          background: "var(--panel)",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ padding: "20px 18px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 510 }}>Personas</div>
              <div style={{ fontSize: 17, fontWeight: 590, color: "var(--primary)", marginTop: 2 }}>{personas.length} active</div>
            </div>
            <button
              className="btn-ghost"
              style={{ width: 28, height: 28, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              onClick={() => {
                const newP: Persona = { ...DEFAULT_PERSONA, id: `new-${Date.now()}`, name: "New persona", deals: 0 };
                setPersonas([...personas, newP]);
                setSelected(personas.length);
                syncFromPersona(newP);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
            {personas.map((p, i) => (
              <button
                key={p.id}
                onClick={() => handleSelect(i)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 10px",
                  borderRadius: 8,
                  background: selected === i ? "rgba(113,112,255,0.08)" : "transparent",
                  color: "var(--foreground)",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 2,
                  border: "none",
                  cursor: "pointer",
                  transition: "background 150ms",
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: STYLE_BG[p.style],
                  color: STYLE_COLORS[p.style],
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 590, flexShrink: 0,
                }}>
                  {["F", "B", "C"][p.style]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: selected === i ? "var(--primary)" : "var(--foreground)", fontWeight: 510, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {STYLE_LABELS[p.style]} · {p.floor}% floor
                  </div>
                </div>
                {selected === i && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />}
              </button>
            ))}
          </div>

          <div style={{ padding: 12, borderTop: "1px solid var(--card-border-subtle)" }}>
            <div style={{ fontSize: 11, color: "var(--subtle)", marginBottom: 6 }}>AI Provider</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--foreground)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: profile?.llmConfig ? "var(--success)" : "var(--muted)" }} />
              {profile?.llmConfig?.mode === "own-key"
                ? `${profile.llmConfig.provider} · ${profile.llmConfig.model}`
                : profile?.llmConfig?.mode === "x402"
                ? `x402 · ${profile.llmConfig.model}`
                : "Not configured"}
            </div>
          </div>
        </aside>

        {/* Editor main */}
        <main style={{ overflowY: "auto", padding: "32px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", margin: 0, fontWeight: 510 }}>
                Persona
              </p>
              <input
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                style={{
                  fontSize: 24,
                  fontWeight: 590,
                  letterSpacing: "-0.02em",
                  color: "var(--primary)",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  padding: 0,
                  marginTop: 6,
                  width: "100%",
                }}
              />
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                Used in <span style={{ color: "var(--foreground)" }}>{personas[selected]?.deals ?? 0} deals</span>
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" style={{ height: 32, padding: "0 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                Duplicate
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary"
                style={{ height: 32, padding: "0 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" /></svg>
                    Saving…
                  </>
                ) : saved ? "Saved ✓" : "Save changes"}
              </button>
            </div>
          </div>

          {/* Negotiation style dial */}
          <div style={{ marginTop: 30, padding: 24, borderRadius: 14, border: "1px solid var(--card-border)", background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 510 }}>
                Negotiation style
              </div>
              <div style={{ fontSize: 12, color: "var(--subtle)" }}>The single most defining trait</div>
            </div>
            <div style={{ position: "relative", height: 60 }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 28, height: 6, borderRadius: 6, background: "var(--surface)" }} />
              <div style={{
                position: "absolute", left: 0, top: 28, height: 6, borderRadius: 6,
                width: `${(style / 2) * 100}%`,
                background: "linear-gradient(to right, rgba(248,113,113,0.6), rgba(113,112,255,0.7), rgba(16,185,129,0.6))",
                transition: "width 200ms",
              }} />
              {([0, 1, 2] as StyleIndex[]).map((v) => {
                const isActive = style === v;
                return (
                  <button
                    key={v}
                    onClick={() => setStyle(v)}
                    style={{
                      position: "absolute",
                      left: `${(v / 2) * 100}%`,
                      top: 16,
                      transform: "translateX(-50%)",
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: isActive ? STYLE_COLORS[v] : "var(--surface)",
                      border: `2px solid ${isActive ? STYLE_COLORS[v] : "var(--card-border)"}`,
                      boxShadow: isActive ? `0 0 0 6px ${STYLE_BG[v]}` : "none",
                      cursor: "pointer",
                      transition: "all 200ms",
                    }}
                  />
                );
              })}
              {STYLE_LABELS.map((l, i) => (
                <div
                  key={l}
                  style={{
                    position: "absolute",
                    left: `${(i / 2) * 100}%`,
                    top: 48,
                    transform: "translateX(-50%)",
                    fontSize: 11,
                    fontWeight: 510,
                    color: style === i ? "var(--primary)" : "var(--muted)",
                    transition: "color 200ms",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 18, lineHeight: 1.55 }}>
              {STYLE_DESC[style]}
            </p>
          </div>

          {/* Price floor + escalate */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            {/* Price floor radial */}
            <div style={{ padding: 20, borderRadius: 12, border: "1px solid var(--card-border)", background: "rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 510 }}>
                Price floor
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 12 }}>
                <svg width="88" height="88" viewBox="0 0 92 92" style={{ flexShrink: 0 }}>
                  <circle cx="46" cy="46" r="38" stroke="var(--surface)" strokeWidth="8" fill="none" />
                  <circle cx="46" cy="46" r="38" stroke="var(--accent)" strokeWidth="8" fill="none"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 38}
                    strokeDashoffset={2 * Math.PI * 38 * (1 - (floor - 50) / 50)}
                    transform="rotate(-90 46 46)"
                    style={{ transition: "stroke-dashoffset 200ms" }}
                  />
                  <text x="46" y="50" textAnchor="middle" fill="var(--primary)" fontSize="20" fontWeight="590"
                    style={{ fontFamily: "Inter, sans-serif" }}>
                    {floor}%
                  </text>
                </svg>
                <div style={{ flex: 1 }}>
                  <input
                    type="range" min={50} max={100} value={floor}
                    onChange={(e) => setFloor(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--accent)" }}
                  />
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                    Below <span style={{ color: "var(--foreground)" }}>{floor}%</span> of ask, the agent counters or walks.
                  </div>
                </div>
              </div>
            </div>

            {/* Escalate rounds */}
            <div style={{ padding: 20, borderRadius: 12, border: "1px solid var(--card-border)", background: "rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 510 }}>
                Escalate after
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 14 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRounds(n)}
                    style={{
                      flex: 1,
                      height: 36,
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 510,
                      background: n <= rounds ? "rgba(113,112,255,0.12)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${n === rounds ? "rgba(113,112,255,0.4)" : "var(--card-border-subtle)"}`,
                      color: n <= rounds ? "var(--accent)" : "var(--muted)",
                      cursor: "pointer",
                      transition: "all 150ms",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
                Agent pings you after <span style={{ color: "var(--foreground)" }}>{rounds} rounds</span> without agreement.
              </div>
            </div>
          </div>

          {/* Voice tone */}
          <div style={{ marginTop: 16, padding: 18, borderRadius: 12, border: "1px solid var(--card-border)", background: "rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 510, marginBottom: 12 }}>
              Voice
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {([
                { id: "formal" as ToneId, label: "Formal", sub: "Concise, business-grade" },
                { id: "warm" as ToneId, label: "Warm", sub: "Friendly, contractions OK" },
                { id: "direct" as ToneId, label: "Direct", sub: "Short sentences, no filler" },
              ]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 8,
                    textAlign: "left",
                    background: tone === t.id ? "rgba(113,112,255,0.08)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${tone === t.id ? "rgba(113,112,255,0.4)" : "var(--card-border)"}`,
                    color: tone === t.id ? "var(--accent)" : "var(--foreground)",
                    cursor: "pointer",
                    transition: "all 150ms",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 510 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{t.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Opening line */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 510, marginBottom: 6 }}>
              Opening line
              <span style={{ fontSize: 11, color: "var(--subtle)", fontWeight: 400, marginLeft: 6 }}>The first message the agent sends.</span>
            </label>
            <textarea
              value={openingLine}
              onChange={(e) => setOpeningLine(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                borderRadius: 6,
                padding: "10px 12px",
                background: "var(--surface)",
                border: "1px solid var(--card-border)",
                color: "var(--primary)",
                fontSize: 13,
                outline: "none",
                resize: "none",
                lineHeight: 1.5,
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
