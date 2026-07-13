// useDeal — SWR-backed deal state for the negotiation room.
//
// This replaces the hand-rolled deal state machine on negotiate/[dealId]:
//   - load (Supabase-first, sessionStorage fallback, 10s timeout, mirror-retry)
//   - 4s poll for cross-device sync   (now refreshInterval)
//   - revalidate on focus / reconnect (now free via SWR defaults — was absent)
//   - Realtime / storage / localStorage sync writes  (now applyServerPatch)
//   - optimistic local writes with rollback           (now patchDeal)
//
// The poll must never clobber an in-flight optimistic write, and must only
// re-render when something meaningful changed. Both are handled by `compare`,
// which SWR applies to *fetched/revalidated* data only — explicit mutate()
// writes (optimistic + sync patches) always apply, bypassing the guard.
import { useCallback } from "react";
import useSWR from "swr";
import { apiFetch, apiFetchSafe, ApiError } from "@/lib/api-client";
import { purgeDealLocally } from "@/lib/deals-store";
import type { SupabaseDeal } from "@/lib/types";
import { POLL_MS } from "@/lib/swr";

type DealResult = { deal: SupabaseDeal | null; error?: string };

function readSessionDeal(dealId: string): SupabaseDeal | null {
  try {
    const raw = sessionStorage.getItem(`deal:${dealId}`);
    if (raw) return JSON.parse(raw) as SupabaseDeal;
  } catch {}
  return null;
}

// Re-push a sessionStorage deal to Supabase so counterparties on other devices
// can load it. Best-effort; mirrors the old retryMirrorSync side effect.
function retryMirrorSync(local: SupabaseDeal) {
  if (!local.buyer_wallet) return;
  apiFetchSafe(
    "/api/deals/mirror",
    {
      method: "POST",
      wallet: local.buyer_wallet,
      body: {
        deal_id: local.deal_id,
        seller_wallet: local.seller_wallet ?? null,
        title: local.title,
        description: local.description ?? null,
        total_amount_usdc: local.total_amount_usdc,
        milestones: local.milestones ?? [],
        status: local.status ?? "draft",
      },
    },
    undefined
  );
}

// Fetcher: Supabase-first, falling back to the sessionStorage copy (and kicking
// off a mirror re-sync) so a freshly-created deal still loads on a cold cache.
// Returns { deal, error } — never throws, so the hook can derive loadError the
// same way the old effect set it.
async function fetchDeal([, dealId]: readonly [string, string]): Promise<DealResult> {
  try {
    const data = await apiFetch<{ deal?: SupabaseDeal; error?: string }>(
      `/api/deals/${dealId}`
    );
    if (data.deal) return { deal: data.deal };
    // 200 with no deal (unusual) — treat like a soft not-found without resurrecting.
    return { deal: null, error: data.error ?? "Deal not found" };
  } catch (err) {
    // A definitive 404 means the server has NO such deal — it was never synced,
    // or (the bug) the counterparty deleted it. Either way, do NOT re-POST a
    // stale sessionStorage copy back to Supabase (that recreated deleted deals
    // on the other party's device). Purge our local copy so it can't resurrect
    // and stops showing here.
    if (err instanceof ApiError && err.status === 404) {
      purgeDealLocally(dealId, readSessionDeal(dealId)?.buyer_wallet ?? null);
      return { deal: null, error: "Deal not found" };
    }
    // Transient/network error (couldn't reach the server): fall back to the
    // local copy and best-effort re-sync, so a freshly-created deal still loads
    // on a flaky connection. This path never fires for a real 404.
    const local = readSessionDeal(dealId);
    if (local) {
      retryMirrorSync(local);
      return { deal: local };
    }
    return { deal: null, error: "Failed to load deal. Please check your connection." };
  }
}

// Equal (skip re-render) when no field a writer can change differs. The old
// poll guard only checked status + seller_wallet, but optimistic writes also
// touch total_amount_usdc + milestones (seller-agreed) — include those so the
// post-write revalidation's authoritative data always wins over the optimistic
// value. Because SWR runs compare on *fetched* data only, explicit mutate()
// writes (optimistic + sync patches) still always apply.
function compareDeal(a?: DealResult, b?: DealResult): boolean {
  const da = a?.deal;
  const db = b?.deal;
  if (da === db) return true;
  if (!da || !db) return da === db && a?.error === b?.error;
  return (
    da.status === db.status &&
    (da.seller_wallet ?? "") === (db.seller_wallet ?? "") &&
    da.total_amount_usdc === db.total_amount_usdc &&
    JSON.stringify(da.milestones ?? []) === JSON.stringify(db.milestones ?? [])
  );
}

export type UseDeal = {
  deal: SupabaseDeal | null;
  loadError: string | null;
  /** Force a fresh fetch (used by the 10s timeout fallback + manual refresh). */
  refresh: () => void;
  /**
   * Apply a server-originated patch (Realtime push, storage event, localStorage
   * signal) to the cached deal without triggering a refetch. Merge is identical
   * to the old setDeal(prev => ...) callbacks; pass a merge fn.
   */
  applyServerPatch: (merge: (prev: SupabaseDeal | null) => SupabaseDeal | null) => void;
  /**
   * Optimistic local write: flips the UI immediately via `patch`, runs `write`
   * (the API call), and auto-rolls-back the cache on error. Replaces the manual
   * setDeal-then-catch-revert pattern.
   */
  patchDeal: (
    patch: Partial<SupabaseDeal>,
    write: () => Promise<unknown>
  ) => Promise<void>;
  /** Replace the whole deal in cache (e.g. after deploy builds a new object). */
  setDeal: (next: SupabaseDeal) => void;
};

export function useDeal(dealId: string | null): UseDeal {
  const key = dealId ? (["deal", dealId] as const) : null;
  const { data, mutate } = useSWR<DealResult>(key, fetchDeal, {
    refreshInterval: POLL_MS,
    compare: compareDeal,
    // revalidateOnFocus / revalidateOnReconnect are SWR defaults (true) — the
    // page now refreshes when the tab regains focus, which the old loop lacked.
    dedupingInterval: 0, // allow the 4s poll to actually hit each tick
  });

  const deal = data?.deal ?? null;
  // SWR error would only fire if the fetcher threw — it doesn't (returns {error}).
  const loadError = !deal ? (data?.error ?? null) : null;

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  const applyServerPatch = useCallback(
    (merge: (prev: SupabaseDeal | null) => SupabaseDeal | null) => {
      void mutate(
        (cur) => ({ deal: merge(cur?.deal ?? null), error: cur?.error }),
        { revalidate: false }
      );
    },
    [mutate]
  );

  const patchDeal = useCallback(
    async (patch: Partial<SupabaseDeal>, write: () => Promise<unknown>) => {
      // Re-throws on failure (after rollbackOnError has restored the cache) so
      // callers can undo their own extra optimistic side-effects. Callers that
      // don't care can ignore the rejection.
      await mutate(
        async () => {
          await write();
          // Re-read authoritative state after the write succeeds.
          return fetchDeal(["deal", dealId as string]);
        },
        {
          optimisticData: (cur?: DealResult): DealResult =>
            cur?.deal ? { deal: { ...cur.deal, ...patch } } : (cur ?? { deal: null }),
          rollbackOnError: true,
          revalidate: true,
          // optimisticData + the post-write fetch must always land in cache,
          // never be dropped by the status/seller compare guard.
          populateCache: true,
        }
      );
    },
    [mutate, dealId]
  );

  const setDeal = useCallback(
    (next: SupabaseDeal) => {
      void mutate({ deal: next }, { revalidate: false });
    },
    [mutate]
  );

  return { deal, loadError, refresh, applyServerPatch, patchDeal, setDeal };
}
