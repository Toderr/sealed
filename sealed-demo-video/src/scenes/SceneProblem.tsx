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

const StatCard: React.FC<{
  value: string;
  label: string;
  sub: string;
  delay: number;
  frame: number;
  fps: number;
}> = ({ value, label, sub, delay, frame, fps }) => {
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
        padding: "40px 48px",
        flex: 1,
        opacity,
        transform: `translateY(${interpolate(s, [0, 1], [40, 0])})`,
        transition: "none",
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: COLORS.accent,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginBottom: 12,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: COLORS.text,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          color: COLORS.textSecondary,
          lineHeight: 1.5,
        }}
      >
        {sub}
      </div>
    </div>
  );
};

export const SceneProblem: React.FC = () => {
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

  const closingOpacity = interpolate(frame, [500, 540], [0, 1], {
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
        gap: 0,
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
          marginBottom: 24,
          opacity: headlineOpacity,
        }}
      >
        The Problem
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: 52,
          fontWeight: 700,
          color: COLORS.text,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          marginBottom: 64,
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
        }}
      >
        Business deals break.{" "}
        <span style={{ color: COLORS.textSecondary }}>Both sides lose.</span>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 24, marginBottom: 56 }}>
        <StatCard
          value="$15B"
          label="Lost every year"
          sub="To B2B payment disputes and freelancer non-payment globally"
          delay={60}
          frame={frame}
          fps={fps}
        />
        <StatCard
          value="50%"
          label="Of invoices overdue"
          sub="Half of all global B2B invoices sit unpaid past their due date"
          delay={100}
          frame={frame}
          fps={fps}
        />
        <StatCard
          value="70%"
          label="Are verification disputes"
          sub="Most non-payments trace back to one question: was it delivered?"
          delay={140}
          frame={frame}
          fps={fps}
        />
      </div>

      {/* Closing line */}
      <div
        style={{
          fontSize: 28,
          fontWeight: 500,
          color: COLORS.textSecondary,
          opacity: closingOpacity,
        }}
      >
        It's not a payment problem.{" "}
        <span style={{ color: COLORS.text, fontWeight: 600 }}>
          It's a verification problem.
        </span>
      </div>
    </AbsoluteFill>
  );
};
