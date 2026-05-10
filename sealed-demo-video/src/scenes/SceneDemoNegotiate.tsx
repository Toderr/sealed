import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  Img,
  staticFile,
} from "remotion";
import { COLORS, FONT } from "../theme";

const NegRow: React.FC<{
  side: "buyer" | "seller";
  text: string;
  delay: number;
  frame: number;
  fps: number;
}> = ({ side, text, delay, frame, fps }) => {
  const s = spring({ fps, frame: frame - delay, config: { damping: 200 } });
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const isBuyer = side === "buyer";

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        opacity,
        transform: `translateX(${interpolate(s, [0, 1], [isBuyer ? -20 : 20, 0])})`,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: isBuyer ? COLORS.brand : COLORS.accent,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          paddingTop: 3,
          width: 80,
          flexShrink: 0,
          textAlign: isBuyer ? "right" : "left",
          order: isBuyer ? 0 : 2,
        }}
      >
        {isBuyer ? "Buyer" : "Seller"}
      </div>
      <div
        style={{
          background: COLORS.surface,
          border: `1px solid ${isBuyer ? COLORS.brand + "44" : COLORS.accent + "44"}`,
          borderRadius: 10,
          padding: "10px 14px",
          fontSize: 15,
          color: COLORS.text,
          lineHeight: 1.5,
          flex: 1,
          order: 1,
        }}
      >
        {text}
      </div>
    </div>
  );
};

const AgreedBadge: React.FC<{ delay: number; frame: number; fps: number }> = ({
  delay,
  frame,
  fps,
}) => {
  const s = spring({ fps, frame: frame - delay, config: { damping: 120 } });
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        marginTop: 20,
        opacity,
        transform: `scale(${s})`,
      }}
    >
      <div
        style={{
          background: COLORS.green + "22",
          border: `1.5px solid ${COLORS.green}`,
          borderRadius: 40,
          padding: "12px 32px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ color: COLORS.green, fontSize: 22 }}>✓</span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: COLORS.green,
            letterSpacing: "0.04em",
          }}
        >
          AGREED — Terms locked
        </span>
      </div>
    </div>
  );
};

export const SceneDemoNegotiate: React.FC = () => {
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

  const screenshotOpacity = interpolate(frame, [30, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  const sceneOpacity = interpolate(frame, [550, 600], [1, 0], {
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
          marginBottom: 36,
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
          Step 2 · Negotiate
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: "-0.02em",
          }}
        >
          Both sides get{" "}
          <span style={{ color: COLORS.accent }}>their own agent.</span>
        </div>
        <div style={{ fontSize: 20, color: COLORS.textSecondary, marginTop: 10 }}>
          They carry your deal history, red-lines, and negotiation style.
        </div>
      </div>

      <div style={{ display: "flex", gap: 48, flex: 1, minHeight: 0 }}>
        {/* Negotiation rounds */}
        <div style={{ flex: 1 }}>
          <NegRow
            side="buyer"
            text="Proposing 120 / 230 / 150 USDC. Want staged payments with a larger final milestone for better delivery assurance."
            delay={40}
            frame={frame}
            fps={fps}
          />
          <NegRow
            side="seller"
            text="Counter: 150 / 250 / 100. Standard split. Higher mid-milestone covers production complexity."
            delay={90}
            frame={frame}
            fps={fps}
          />
          <NegRow
            side="buyer"
            text="Accepted. 150 / 250 / 100. Adding 7-day revision window on milestone 3."
            delay={140}
            frame={frame}
            fps={fps}
          />
          <NegRow
            side="seller"
            text="Agreed. 7-day revision window added. Ready to proceed."
            delay={190}
            frame={frame}
            fps={fps}
          />
          <AgreedBadge delay={260} frame={frame} fps={fps} />

          {/* Memory note */}
          <div
            style={{
              marginTop: 24,
              padding: "12px 16px",
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              fontSize: 14,
              color: COLORS.textSecondary,
              opacity: interpolate(frame, [320, 360], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            💡 Both agents carry{" "}
            <span style={{ color: COLORS.text }}>BusinessMemory</span> — past
            deals, red-lines, and counterparty reputation inform every round.
          </div>
        </div>

        {/* Screenshot */}
        <div
          style={{
            width: 560,
            flexShrink: 0,
            borderRadius: 16,
            overflow: "hidden",
            border: `1px solid ${COLORS.border}`,
            opacity: screenshotOpacity,
          }}
        >
          <Img
            src={staticFile("app-wide.png")}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
