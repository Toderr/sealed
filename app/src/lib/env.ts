// Local no-blockchain dev mode flag.
//
// When NEXT_PUBLIC_MOCK_CHAIN=true (and NOT a production build), the app runs the
// full deal flow with a fake wallet + fake escrow ledger — no Phantom, no RPC,
// no devnet USDC. See Code analysis/sealed-auth-and-local-dev-mode.md.
//
// Hard guard: this must NEVER be enabled in a production build.

// Fully-offline mode: also mock Supabase (data → localStorage) and skip the LLM
// agents. Deals are created via a manual form; negotiation auto-agrees and
// verification auto-approves. Implies MOCK_CHAIN.
export const MOCK_DATA =
  process.env.NEXT_PUBLIC_MOCK_DATA === "true" &&
  process.env.NODE_ENV !== "production";

// MOCK_DATA implies MOCK_CHAIN — offline data has no chain to talk to.
export const MOCK_CHAIN =
  (process.env.NEXT_PUBLIC_MOCK_CHAIN === "true" || MOCK_DATA) &&
  process.env.NODE_ENV !== "production";

if (
  process.env.NODE_ENV === "production" &&
  (process.env.NEXT_PUBLIC_MOCK_CHAIN === "true" ||
    process.env.NEXT_PUBLIC_MOCK_DATA === "true")
) {
  throw new Error(
    "NEXT_PUBLIC_MOCK_CHAIN / NEXT_PUBLIC_MOCK_DATA must not be enabled in production builds."
  );
}

// ── "Coming soon" feature flags ───────────────────────────────────────────────
// Features that are built but not ready for general availability. Default OFF
// (rendered as a disabled "Coming soon" state); flip the env var to "true" to
// enable — e.g. on in staging, off in production. See tickets #10 (x402) / #18
// (Get Verified).

// x402 pay-as-you-go LLM billing. Off by default → users default to own API key.
export const FEATURE_X402 = process.env.NEXT_PUBLIC_FEATURE_X402 === "true";

// Paid identity verification ("Get verified"). Off by default until the paid
// flow is built — don't accept live verification submissions in prod meanwhile.
export const FEATURE_GET_VERIFIED =
  process.env.NEXT_PUBLIC_FEATURE_GET_VERIFIED === "true";
