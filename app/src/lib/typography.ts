import type { CSSProperties } from "react";

// Shared inline type styles (Inter / Linear-inspired). Previously duplicated
// verbatim across ~9 components — consolidated here as the single source.

export const labelStyle: CSSProperties = {
  fontWeight: 510,
  letterSpacing: "-0.006em",
};

export const headingStyle: CSSProperties = {
  fontWeight: 590,
  letterSpacing: "-0.014em",
};
