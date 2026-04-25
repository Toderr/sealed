// Sealed mark, per the locked brand design (Claude Design handoff 2026-04-18).
// Geometry spec (120x120 viewBox):
//   dot r=13, ring r=54 stroke 2.5 opacity 0.85, whiskers 3 per side
//   xIn=20, xOut=37, yIn=[-12,0,12], yOut=[-15,0,15], stroke 3 round cap
// Color: inherits currentColor so callers control light/dark via text color.

type MarkProps = {
  size?: number;
  ring?: boolean;
  className?: string;
  title?: string;
};

export function SealedMark({
  size = 28,
  ring = true,
  className,
  title,
}: MarkProps) {
  const strokes = [
    { yIn: -12, yOut: -15 },
    { yIn: 0, yOut: 0 },
    { yIn: 12, yOut: 15 },
  ];
  const cx = 60;
  const cy = 60;
  const dotR = 13;
  const xIn = dotR + 7;
  const xOut = dotR + 24;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {ring && (
        <circle
          cx={cx}
          cy={cy}
          r={54}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          opacity={0.85}
        />
      )}
      {([-1, 1] as const).flatMap((side) =>
        strokes.map((s, i) => (
          <line
            key={`${side}-${i}`}
            x1={cx + side * xIn}
            y1={cy + s.yIn}
            x2={cx + side * xOut}
            y2={cy + s.yOut}
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))
      )}
      <circle cx={cx} cy={cy} r={dotR} fill="currentColor" />
    </svg>
  );
}

type WordmarkProps = {
  size?: number;
  weight?: number;
  className?: string;
};

export function SealedWordmark({
  size = 16,
  weight = 600,
  className,
}: WordmarkProps) {
  return (
    <span
      className={className}
      style={{
        fontWeight: weight,
        fontSize: size,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      Sealed Agent
    </span>
  );
}

type LockupProps = {
  markSize?: number;
  wordSize?: number;
  gap?: number;
  ring?: boolean;
  className?: string;
  markClassName?: string;
  wordClassName?: string;
};

export function SealedLockup({
  markSize = 28,
  wordSize = 16,
  gap = 8,
  ring = true,
  className,
  markClassName,
  wordClassName,
}: LockupProps) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap }}>
      <SealedMark size={markSize} ring={ring} className={markClassName} />
      <SealedWordmark size={wordSize} className={wordClassName} />
    </span>
  );
}
