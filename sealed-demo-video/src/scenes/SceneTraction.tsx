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

const MetricCard: React.FC<{
  value: string;
  label: string;
  sub: string;
  delay: number;
  frame: number;
  fps: number;
  accent?: string;
}> = ({ value, label, sub, delay, frame, fps, accent }) => {
  const s = spring({ fps, frame: frame - delay, config: { damping: 200 } });
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: "32px 36px",
        flex: 1,
        opacity,
        transform: `translateY(${interpolate(s, [0, 1], [40, 0])})`,
      }}
    >
      <div
        style={{
          fontSize: 60,
          fontWeight: 700,
          color: accent || COLORS.accent,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginBottom: 10,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: COLORS.text,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.5 }}>
        {sub}
      </div>
    </div>
  );
};

export const SceneTraction: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const headerY = interpolate(frame, [0, 20], [24, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const sceneOpacity = interpolate(frame, [400, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const closingOpacity = interpolate(frame, [300, 340], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        opacity: sceneOpacity,
        fontFamily: FONT,
        padding: "0 120px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: headerOpacity,
          transform: `translateY(${headerY}px)`,
          marginBottom: 52,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: COLORS.brand,
            marginBottom: 16,
          }}
        >
          Market · Traction · Business model
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          The market is ready.{" "}
          <span style={{ color: COLORS.accent }}>The network is warm.</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 40 }}>
        <MetricCard
          value="$400B"
          label="Stablecoin B2B yearly"
          sub="60% of stablecoin payments are B2B. USDC settled $18T in 2025."
          delay={50}
          frame={frame}
          fps={fps}
        />
        <MetricCard
          value="65%"
          label="New B2B from referrals"
          sub="Warm network = $0 CAC. 10 anchor deals → 100 referrals."
          delay={90}
          frame={frame}
          fps={fps}
          accent={COLORS.green}
        />
        <MetricCard
          value="1%"
          label="Platform fee per deal"
          sub="+ AI compute markup + $100 verified merchant badge. Profitable deal one."
          delay={130}
          frame={frame}
          fps={fps}
          accent={COLORS.brand}
        />
      </div>

      {/* Live status */}
      <div
        style={{
          opacity: closingOpacity,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 24px",
          background: COLORS.green + "18",
          border: `1px solid ${COLORS.green}44`,
          borderRadius: 12,
        }}
      >
        <span style={{ color: COLORS.green, fontSize: 20 }}>●</span>
        <span style={{ fontSize: 18, fontWeight: 500, color: COLORS.text }}>
          Live on Solana devnet today.{" "}
          <span style={{ color: COLORS.textSecondary }}>
            Full smart contract shipped. Mainnet target: Q2 2026.
          </span>
        </span>
      </div>
    </AbsoluteFill>
  );
};
