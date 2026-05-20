"use client";

/**
 * SealedBackdrop — ambient ornament layer behind every screen.
 * Layers:
 *   1. Soft violet glow top-left
 *   2. Soft success-tinted glow bottom-right
 *   3. Concentric emanating rings (seal/stamp metaphor)
 *   4. Massive SealedMark watermark top-right
 *   5. Quiet small mark bottom-left (counterweight)
 *   6. Faint dashed horizon line for layered depth
 *   7. Three tiny floating particle dots
 *
 * All elements are pointer-events: none and behind content (z-index 0).
 */
export function SealedBackdrop({ compact = false }: { compact?: boolean }) {
  if (compact) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {/* Soft violet glow top-left — adds ambient color */}
      <div
        style={{
          position: "absolute",
          top: "-8%",
          left: "-6%",
          width: 460,
          height: 460,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(113,112,255,0.16) 0%, rgba(113,112,255,0.04) 40%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      {/* Soft success-tinted glow bottom-right — second ambient hue */}
      <div
        style={{
          position: "absolute",
          bottom: "-10%",
          right: "8%",
          width: 380,
          height: 380,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 65%)",
          filter: "blur(40px)",
        }}
      />

      {/* Concentric emanating rings, like a seal stamp pressing into the page */}
      <svg
        viewBox="0 0 400 400"
        style={{
          position: "absolute",
          top: "18%",
          right: "-4%",
          width: 420,
          height: 420,
        }}
        fill="none"
      >
        <circle cx="200" cy="200" r="60"  stroke="rgba(113,112,255,0.09)" strokeWidth="0.7" />
        <circle cx="200" cy="200" r="100" stroke="rgba(113,112,255,0.06)" strokeWidth="0.7" />
        <circle cx="200" cy="200" r="148" stroke="rgba(113,112,255,0.04)" strokeWidth="0.7" />
        <circle cx="200" cy="200" r="198" stroke="rgba(113,112,255,0.025)" strokeWidth="0.7" />
      </svg>

      {/* MASSIVE SealedMark watermark top-right — signature brand element */}
      <svg
        viewBox="0 0 120 120"
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: "absolute",
          top: "-160px",
          right: "-110px",
          width: 560,
          height: 560,
        }}
        fill="none"
      >
        <circle cx="60" cy="60" r="54" stroke="rgba(113,112,255,0.11)" strokeWidth="0.45" />
        <g stroke="rgba(113,112,255,0.11)" strokeWidth="0.6" strokeLinecap="round">
          <line x1="80" y1="48" x2="97" y2="45" />
          <line x1="80" y1="60" x2="97" y2="60" />
          <line x1="80" y1="72" x2="97" y2="75" />
          <line x1="40" y1="48" x2="23" y2="45" />
          <line x1="40" y1="60" x2="23" y2="60" />
          <line x1="40" y1="72" x2="23" y2="75" />
        </g>
        <circle cx="60" cy="60" r="13" fill="rgba(113,112,255,0.11)" />
      </svg>

      {/* Quiet small mark bottom-left — counterweight */}
      <svg
        viewBox="0 0 120 120"
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: "absolute",
          bottom: "-60px",
          left: "-50px",
          width: 240,
          height: 240,
        }}
        fill="none"
      >
        <circle cx="60" cy="60" r="54" stroke="rgba(255,255,255,0.05)" strokeWidth="0.6" />
        <circle cx="60" cy="60" r="13" fill="rgba(255,255,255,0.04)" />
      </svg>

      {/* Faint diagonal dashed horizon line, suggests depth/layering */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <line
          x1="0" y1="68%" x2="100%" y2="58%"
          stroke="rgba(113,112,255,0.06)" strokeWidth="1" strokeDasharray="2 10"
        />
        <line
          x1="0" y1="86%" x2="100%" y2="82%"
          stroke="rgba(255,255,255,0.025)" strokeWidth="1"
        />
      </svg>

      {/* Three tiny floating "particle" dots */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <circle cx="22%" cy="42%" r="1.4" fill="rgba(113,112,255,0.45)" />
        <circle cx="68%" cy="38%" r="1"   fill="rgba(113,112,255,0.32)" />
        <circle cx="42%" cy="78%" r="1.2" fill="rgba(113,112,255,0.32)" />
        <circle cx="84%" cy="64%" r="0.9" fill="rgba(16,185,129,0.4)" />
      </svg>
    </div>
  );
}
