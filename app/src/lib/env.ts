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
