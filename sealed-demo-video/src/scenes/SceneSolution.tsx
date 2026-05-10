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

const AgentCard: React.FC<{
  icon: string;
  name: string;
  desc: string;
  delay: number;
  frame: number;
  fps: number;
}> = ({ icon, name, desc, delay, frame, fps }) => {
  const s = spring({ fps, frame: frame - delay, config: { damping: 200 } });
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: "28px 32px",
        flex: 1,
        opacity,
        transform: `translateY(${interpolate(s, [0, 1], [32, 0])})`,
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 14 }}>{icon}</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: COLORS.text,
          marginBottom: 8,
          letterSpacing: "0.01em",
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontSize: 15,
          color: COLORS.textSecondary,
          lineHeight: 1.55,
        }}
      >
        {desc}
      </div>
    </div>
  );
};

const StepBadge: React.FC<{
  n: number;
  label: string;
  delay: number;
  frame: number;
  fps: number;
}> = ({ n, label, delay, frame, fps }) => {
  const opacity = interpolate(frame, [delay, delay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const x = interpolate(frame, [delay, delay + 18], [-16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity,
        transform: `translateX(${x}px)`,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: COLORS.brand,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {n}
      </div>
      <span style={{ fontSize: 18, fontWeight: 500, color: COLORS.text }}>
        {label}
      </span>
    </div>
  );
};

export const SceneSolution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headlineOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const headlineY = interpolate(frame, [0, 25], [24, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const sceneOpacity = interpolate(frame, [700, 750], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
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
      {/* Eyebrow */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: COLORS.brand,
          marginBottom: 20,
          opacity: headlineOpacity,
        }}
      >
        The Solution
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: 52,
          fontWeight: 700,
          color: COLORS.text,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          marginBottom: 12,
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
        }}
      >
        Three AI agents.{" "}
        <span style={{ color: COLORS.accent }}>One deal table.</span>
      </div>

      <div
        style={{
          fontSize: 22,
          color: COLORS.textSecondary,
          marginBottom: 48,
          opacity: headlineOpacity,
        }}
      >
        Sealed Agent — AI-powered escrow for business deals, on Solana.
      </div>

      {/* Agent cards */}
      <div style={{ display: "flex", gap: 20, marginBottom: 52 }}>
        <AgentCard
          icon="🧩"
          name="Structurer"
          desc="Parses your plain-language deal description into structured escrow parameters: parties, amounts, milestones, and conditions."
          delay={40}
          frame={frame}
          fps={fps}
        />
        <AgentCard
          icon="🤝"
          name="Negotiator"
          desc="Both parties get their own agent. They counter-offer, make concessions, and reach consensus — with full pros/cons summary."
          delay={80}
          frame={frame}
          fps={fps}
        />
        <AgentCard
          icon="✅"
          name="Verifier"
          desc="Reviews submitted proof against milestone criteria. Scores confidence, flags gaps, and recommends release or clarification."
          delay={120}
          frame={frame}
          fps={fps}
        />
      </div>

      {/* 5-step flow */}
      <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
        {[
          { n: 1, label: "Describe", delay: 200 },
          { n: 2, label: "Negotiate", delay: 230 },
          { n: 3, label: "Fund", delay: 260 },
          { n: 4, label: "Verify", delay: 290 },
          { n: 5, label: "Release", delay: 320 },
        ].map(({ n, label, delay }, i) => (
          <React.Fragment key={n}>
            <StepBadge
              n={n}
              label={label}
              delay={delay}
              frame={frame}
              fps={fps}
            />
            {i < 4 && (
              <div
                style={{
                  color: COLORS.textMuted,
                  fontSize: 20,
                  opacity: interpolate(frame, [delay + 10, delay + 30], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                →
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </AbsoluteFill>
  );
};
