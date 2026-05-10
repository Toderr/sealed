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

export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // "Every business deal starts with..."
  const line1Opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const line1Y = interpolate(frame, [0, 20], [32, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // "...ends with a WhatsApp argument."
  const line2Opacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const line2Y = interpolate(frame, [30, 50], [32, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // middle line — "The money moves. The trust doesn't."
  const dividerOpacity = interpolate(frame, [60, 90], [0, 1], {
    extrapolateRight: "clamp",
  });
  const quoteOpacity = interpolate(frame, [70, 100], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const quoteY = interpolate(frame, [70, 100], [24, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // SEALED mark — appears at frame 180
  const logoScale = spring({
    fps,
    frame: frame - 180,
    config: { damping: 200 },
  });
  const logoOpacity = interpolate(frame, [180, 210], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // tagline
  const taglineOpacity = interpolate(frame, [240, 270], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  // fade-out for transition
  const sceneOpacity = interpolate(frame, [400, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.ease),
  });

  return (
    <AbsoluteFill
      style={{
        background: COLORS.bg,
        opacity: sceneOpacity,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 0,
        fontFamily: FONT,
      }}
    >
      {/* Opening lines */}
      <div
        style={{
          textAlign: "center",
          maxWidth: 900,
          marginBottom: 48,
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 500,
            color: COLORS.textSecondary,
            lineHeight: 1.4,
            opacity: line1Opacity,
            transform: `translateY(${line1Y}px)`,
            marginBottom: 8,
          }}
        >
          Every business deal starts with a handshake
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 500,
            color: COLORS.textSecondary,
            lineHeight: 1.4,
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
          }}
        >
          and ends with a{" "}
          <span style={{ color: COLORS.accent }}>WhatsApp argument.</span>
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          width: interpolate(frame, [60, 120], [0, 200], {
            extrapolateRight: "clamp",
          }),
          height: 1,
          background: COLORS.border,
          marginBottom: 48,
          opacity: dividerOpacity,
        }}
      />

      {/* Key quote */}
      <div
        style={{
          fontSize: 56,
          fontWeight: 600,
          color: COLORS.text,
          textAlign: "center",
          letterSpacing: "-0.02em",
          opacity: quoteOpacity,
          transform: `translateY(${quoteY}px)`,
          marginBottom: 72,
        }}
      >
        The money moves.{" "}
        <span style={{ color: COLORS.brand }}>The trust doesn't.</span>
      </div>

      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
        }}
      >
        <SealedLockup height={52} />
      </div>

      {/* Tagline */}
      <div
        style={{
          marginTop: 20,
          fontSize: 22,
          color: COLORS.textMuted,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          opacity: taglineOpacity,
        }}
      >
        Don't trust promises. Seal the deal.
      </div>
    </AbsoluteFill>
  );
};
