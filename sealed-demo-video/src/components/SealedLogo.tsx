import React from "react";
import { COLORS, FONT } from "../theme";

export const SealedMark: React.FC<{ size?: number; color?: string }> = ({
  size = 48,
  color = "#ffffff",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
  >
    <circle
      cx="60"
      cy="60"
      r="54"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      opacity="0.85"
    />
    <line x1="80" y1="48" x2="97" y2="45" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="80" y1="60" x2="97" y2="60" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="80" y1="72" x2="97" y2="75" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="40" y1="48" x2="23" y2="45" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="40" y1="60" x2="23" y2="60" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <line x1="40" y1="72" x2="23" y2="75" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <circle cx="60" cy="60" r="13" fill={color} />
  </svg>
);

export const SealedLockup: React.FC<{
  height?: number;
  color?: string;
  accentColor?: string;
}> = ({ height = 52, color = "#f7f8f8", accentColor }) => {
  const iconSize = height;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: Math.round(iconSize * 0.3),
      }}
    >
      <SealedMark size={iconSize} color={color} />
      <div
        style={{
          fontFamily: FONT,
          fontSize: Math.round(iconSize * 0.56),
          fontWeight: 700,
          color: accentColor || color,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        Sealed Agent
      </div>
    </div>
  );
};
