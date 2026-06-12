// SWR foundation for client-side data fetching.
//
// Next 16's "Fetching Data" guide recommends SWR for client components; we use
// its refreshInterval to replace the hand-rolled setInterval polling loops.
//
// All fetching goes through apiFetch so the x-wallet header, ApiError semantics,
// and the offline mock interceptor (mock-data.ts) keep working unchanged.
import useSWR, { type SWRConfiguration, type SWRResponse } from "swr";
import { apiFetch, type ApiFetchOptions } from "@/lib/api-client";

/**
 * SWR key for an authed GET. A tuple [path, wallet] so the cache is scoped per
 * wallet — switching wallets won't serve another wallet's cached data. Pass a
 * null path to disable the request (SWR's conditional-fetching convention).
 */
export type ApiKey = readonly [path: string, wallet: string | null];

const fetcher = ([path, wallet]: ApiKey) =>
  apiFetch(path, { wallet } satisfies ApiFetchOptions);

/** Matches the cadence of the setInterval polling this replaces. */
export const POLL_MS = 4000;

/**
 * Authed SWR GET with the project's defaults. Returns the standard SWR shape
 * ({ data, error, isLoading, mutate }). Pass `null` for `path` to skip.
 *
 *   const { data, mutate } = useApi<{ deal?: SupabaseDeal }>(
 *     dealId ? `/api/deals/${dealId}` : null, wallet, { refreshInterval: POLL_MS });
 */
export function useApi<T>(
  path: string | null,
  wallet: string | null,
  config?: SWRConfiguration<T>
): SWRResponse<T> {
  const key: ApiKey | null = path ? [path, wallet] : null;
  return useSWR<T>(key, fetcher as (k: ApiKey) => Promise<T>, config);
}
