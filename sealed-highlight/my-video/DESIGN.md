# Sealed Highlight — Visual Identity

## Style Prompt
Linear-inspired dark futurist. Deep near-black canvas with a hint of cool blue, lit by indigo and violet neons. Big confident kinetic typography in Inter, mono accents in JetBrains Mono. Motion is snappy and satisfying — slam-ins, shockwaves, vault locks, glow pulses. Restrained chrome on top of vivid pops of brand color. Feels like a serious financial product that knows how to put on a show.

## Colors
- `#08090a` — canvas (deep near-black, primary background)
- `#0f1011` — panel (cards, surfaces)
- `#191a1b` — surface-elevated
- `#f7f8f8` — primary text
- `#a8acb6` — secondary text (lifted from #8a8f98 to clear AA contrast on dark)
- `#5e6ad2` — brand indigo (primary brand color, glow)
- `#7170ff` — accent violet (secondary brand)
- `#c47aff` — magenta (highlight pop)
- `#4ade80` — success green (release / confirm)
- `#fbbf24` — gold (USDC, value)
- `#f87171` — danger red (problem / friction)

## Typography
- Display + body: **Inter** (700/600/500/400). Tight tracking on big headlines (-0.04em).
- Mono accent: **JetBrains Mono** (500). For data labels, USDC amounts, and "deal_id" style chips.

## Motion Rules
- Snap entrances: `power3.out` and `expo.out` between 0.4–0.7s.
- Slams use a brief overshoot (`back.out(1.6)`) on scale.
- Logo / vault moments get a 0.2s glow shockwave ring expanding to opacity 0.
- USDC tokens: parabolic motion paths, 0.6s travel + 0.15s settle bounce.
- Holds are at most 1.2s before next move — never let the eye rest too long.

## What NOT to Do
- No `#3b82f6`, generic blue, or Roboto / Arial / Helvetica.
- No flat full-screen linear gradients (banding under H.264). Use radial glows + solid bg.
- No "auto-release" wording, no "pengusaha", no "not crypto" framing.
- No slow fades >1s on entrances. Energy must stay forward-leaning.
- No emoji or decorative icons that look generic — use shape primitives + the brand palette.
