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

const ChatBubble: React.FC<{
  text: string;
  role: "user" | "agent";
  delay: number;
  frame: number;
  fps: number;
}> = ({ text, role, delay, frame, fps }) => {
  const s = spring({ fps, frame: frame - delay, config: { damping: 200 } });
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        opacity,
        transform: `translateY(${interpolate(s, [0, 1], [16, 0])})`,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          maxWidth: "72%",
          background: isUser ? COLORS.brand : COLORS.surface,
          border: isUser ? "none" : `1px solid ${COLORS.border}`,
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          padding: "14px 18px",
          fontSize: 16,
          color: COLORS.text,
          lineHeight: 1.5,
        }}
      >
        {!isUser && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: COLORS.accent,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Structurer Agent
          </div>
        )}
        {text}
      </div>
    </div>
  );
};

const DealPreview: React.FC<{ delay: number; frame: number; fps: number }> = ({
  delay,
  frame,
  fps,
}) => {
  const s = spring({ fps, frame: frame - delay, config: { damping: 200 } });
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const milestones = [
    { label: "Design mockup", amount: "150 USDC", pct: 30 },
    { label: "Coded build", amount: "250 USDC", pct: 50 },
    { label: "Post-launch fixes", amount: "100 USDC", pct: 20 },
  ];

  return (
    <div
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.accent}33`,
        borderRadius: 14,
        padding: "24px 28px",
        marginTop: 12,
        opacity,
        transform: `translateY(${interpolate(s, [0, 1], [24, 0])})`,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: COLORS.accent,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        Deal Preview · Structured
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 4 }}
          >
            Total
          </div>
          <div
            style={{ fontSize: 24, fontWeight: 700, color: COLORS.text }}
          >
            500 USDC
          </div>
        </div>
        <div>
          <div
            style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 4 }}
          >
            Milestones
          </div>
          <div
            style={{ fontSize: 24, fontWeight: 700, color: COLORS.text }}
          >
            3
          </div>
        </div>
        <div>
          <div
            style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 4 }}
          >
            Escrow
          </div>
          <div
            style={{ fontSize: 24, fontWeight: 700, color: COLORS.green }}
          >
            On-chain
          </div>
        </div>
      </div>
      {milestones.map((m, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <span style={{ fontSize: 15, color: COLORS.text }}>{m.label}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.accent }}>
            {m.amount}
          </span>
        </div>
      ))}
    </div>
  );
};

export const SceneDemoChat: React.FC = () => {
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

  const sceneOpacity = interpolate(frame, [700, 750], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const screenshotOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });
  const screenshotX = interpolate(frame, [20, 50], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
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
      {/* Header */}
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
          Step 1 · Describe your deal
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: "-0.02em",
          }}
        >
          Plain language in.{" "}
          <span style={{ color: COLORS.accent }}>Structured deal out.</span>
        </div>
      </div>

      {/* Two-column: chat + screenshot */}
      <div style={{ display: "flex", gap: 48, flex: 1, minHeight: 0 }}>
        {/* Chat column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <ChatBubble
            role="user"
            text="I need a landing page for my coffee roasting business. Budget 500 USDC. Three milestones: design mockup, coded build, and post-launch fixes."
            delay={40}
            frame={frame}
            fps={fps}
          />
          <ChatBubble
            role="agent"
            text="Got it. I've structured this as a 3-milestone deal — 150 / 250 / 100 USDC. Funds lock on-chain. Each milestone releases only when you confirm delivery."
            delay={100}
            frame={frame}
            fps={fps}
          />
          <DealPreview delay={160} frame={frame} fps={fps} />
        </div>

        {/* App screenshot */}
        <div
          style={{
            width: 640,
            flexShrink: 0,
            borderRadius: 16,
            overflow: "hidden",
            border: `1px solid ${COLORS.border}`,
            opacity: screenshotOpacity,
            transform: `translateX(${screenshotX}px)`,
          }}
        >
          <Img
            src={staticFile("app.png")}
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
