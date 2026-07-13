// Retry a critical write a few times with backoff. Used for the mirror writes
// that follow an irreversible on-chain action (fund, release): if the single
// best-effort write failed, the on-chain state and the Supabase mirror diverge
// and the UI shows the wrong thing (a funded deal reverting to "Ready to fund",
// or a released milestone stuck on "Confirm & release"). Retrying makes those
// writes durable across a transient blip.
//
// Returns true if the write eventually succeeded, false if every attempt failed
// (the caller can then surface a soft warning — the chain is still correct).
export async function retryWrite(
  write: () => Promise<unknown>,
  { attempts = 4, baseDelayMs = 600 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      await write();
      return true;
    } catch {
      if (i === attempts - 1) return false;
      // Exponential backoff: 0.6s, 1.2s, 2.4s …
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
    }
  }
  return false;
}
