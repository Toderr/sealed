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
import { SealedLockup } from "../components/SealedLogo";

export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoS = spring({ fps, frame: frame - 10, config: { damping: 200 } });
  const logoOpacity = interpolate(frame, [10, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineOpacity = interpolate(frame, [50, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const taglineY = interpolate(frame, [50, 75], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const detailsOpacity = interpolate(frame, [100, 130], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  const glowOpacity = interpolate(frame, [0, 60], [0, 0.3], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.brand}55 0%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          opacity: glowOpacity,
          pointerEvents: "none",
        }}
      />

      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoS})`,
          marginBottom: 36,
        }}
      >
        <SealedLockup height={64} />
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.text,
          letterSpacing: "-0.02em",
          textAlign: "center",
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          marginBottom: 48,
        }}
      >
        Don't trust promises.{" "}
        <span style={{ color: COLORS.accent }}>Seal the deal.</span>
      </div>

      {/* Details row */}
      <div
        style={{
          display: "flex",
          gap: 40,
          alignItems: "center",
          opacity: detailsOpacity,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
            Program
          </div>
          <div
            style={{
              fontSize: 14,
              color: COLORS.textSecondary,
              fontFamily: "monospace",
              background: COLORS.surface,
              padding: "6px 14px",
              borderRadius: 6,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            3WSjgWUKWhsENKJ1ibnbgvaiuQ8THJp4Mp7uGTUyeYeJ
          </div>
        </div>

        <div
          style={{
            width: 1,
            height: 40,
            background: COLORS.border,
          }}
        />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
            Network
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.green,
            }}
          >
            Solana Devnet → Mainnet Q2 2026
          </div>
        </div>

        <div
          style={{
            width: 1,
            height: 40,
            background: COLORS.border,
          }}
        />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
            Hackathon
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.text,
            }}
          >
            Colosseum Frontier 2026
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
