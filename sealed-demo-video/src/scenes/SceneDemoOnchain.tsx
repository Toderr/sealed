import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { COLORS, FONT } from "../theme";

const TxStep: React.FC<{
  icon: string;
  title: string;
  sub: string;
  status: "done" | "active" | "pending";
  delay: number;
  frame: number;
  fps: number;
}> = ({ icon, title, sub, status, delay, frame, fps }) => {
  const s = spring({ fps, frame: frame - delay, config: { damping: 200 } });
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const statusColor =
    status === "done"
      ? COLORS.green
      : status === "active"
      ? COLORS.accent
      : COLORS.textMuted;

  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        padding: "20px 24px",
        background: COLORS.surface,
        border: `1px solid ${status === "active" ? COLORS.accent + "55" : COLORS.border}`,
        borderRadius: 12,
        opacity,
        transform: `translateX(${interpolate(s, [0, 1], [-20, 0])})`,
        marginBottom: 14,
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div
          style={{ fontSize: 17, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}
        >
          {title}
        </div>
        <div style={{ fontSize: 14, color: COLORS.textSecondary }}>{sub}</div>
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: statusColor,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {status === "done" ? "✓ Done" : status === "active" ? "● Live" : "Pending"}
      </div>
    </div>
  );
};

export const SceneDemoOnchain: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const headerY = interpolate(frame, [0, 20], [20, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const sceneOpacity = interpolate(frame, [400, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // USDC counter animation
  const usdcCounter = interpolate(frame, [200, 310], [0, 500], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const counterOpacity = interpolate(frame, [190, 210], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        opacity: sceneOpacity,
        fontFamily: FONT,
        padding: "56px 120px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          opacity: headerOpacity,
          transform: `translateY(${headerY}px)`,
          marginBottom: 40,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: COLORS.brand,
            marginBottom: 12,
          }}
        >
          Steps 3–5 · Fund, Verify & Release
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: "-0.02em",
          }}
        >
          On-chain. <span style={{ color: COLORS.accent }}>Non-custodial.</span>{" "}
          <span style={{ color: COLORS.textSecondary }}>One signature each.</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 60, flex: 1, alignItems: "flex-start" }}>
        {/* Transaction steps */}
        <div style={{ flex: 1 }}>
          <TxStep
            icon="📝"
            title="Deal PDA created"
            sub="seeds=[b'deal', deal_id] — immutable deal terms locked on-chain"
            status="done"
            delay={40}
            frame={frame}
            fps={fps}
          />
          <TxStep
            icon="🔒"
            title="Escrow vault funded"
            sub="500 USDC locked in PDA-owned vault — neither party can spend unilaterally"
            status="done"
            delay={80}
            frame={frame}
            fps={fps}
          />
          <TxStep
            icon="🔍"
            title="Verifier reviews proof"
            sub="AI scores delivery confidence — approve, reject, or request clarification"
            status="done"
            delay={120}
            frame={frame}
            fps={fps}
          />
          <TxStep
            icon="💸"
            title="Milestone 1 released"
            sub="Buyer signs release_milestone — 150 USDC moves to seller ATA"
            status="active"
            delay={160}
            frame={frame}
            fps={fps}
          />

          {/* USDC counter */}
          <div
            style={{
              marginTop: 24,
              opacity: counterOpacity,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                color: COLORS.green,
                letterSpacing: "-0.02em",
              }}
            >
              {Math.round(usdcCounter)} USDC
            </div>
            <div style={{ fontSize: 16, color: COLORS.textMuted, marginTop: 4 }}>
              released to seller · milestone 1 of 3
            </div>
          </div>
        </div>

        {/* Key principle */}
        <div
          style={{
            width: 360,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {[
            {
              icon: "🛡️",
              label: "Buyer retains authority",
              desc: "AI recommends. Buyer signs. Final decision always stays human.",
            },
            {
              icon: "⛓️",
              label: "Verifiable history",
              desc: "Every deal, milestone, and release is on-chain. Permanent reputation.",
            },
            {
              icon: "🔐",
              label: "Mutual refund",
              desc: "Refund requires both signatures — no unilateral exit possible.",
            },
          ].map(({ icon, label, desc }, i) => {
            const delay = 250 + i * 50;
            const op = interpolate(frame, [delay, delay + 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  background: COLORS.surfaceAlt,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: "18px 20px",
                  opacity: op,
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
                <div
                  style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}
                >
                  {label}
                </div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
                  {desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
