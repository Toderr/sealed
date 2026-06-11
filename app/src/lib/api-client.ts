// Typed client-side fetch wrapper. Centralizes the x-wallet header, JSON
// encoding/parsing, and error handling that was hand-rolled at ~90 call sites.
//
// Works through the offline mock interceptor (mock-data.ts patches window.fetch)
// because it calls the global fetch like everything else.

/** Error thrown by apiFetch when the server returns a non-2xx response. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Convenience: sets the x-wallet header. */
  wallet?: string | null;
  /** JSON body — serialized + Content-Type: application/json set automatically. */
  body?: unknown;
  /** Raw body (FormData, etc.) — passed through untouched, no Content-Type set. */
  rawBody?: BodyInit;
  /** Extra headers (e.g. x-deal-id, x-llm-*). Merged last. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Fetch a JSON API route. Throws ApiError on non-2xx. Returns the parsed JSON
 * (typed as T), or undefined for empty 204 responses.
 *
 *   const { deals } = await apiFetch<{ deals: Deal[] }>("/api/deals/mirror", { wallet });
 *   await apiFetch("/api/deals/x", { method: "PATCH", wallet, body: { status } });
 */
export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.wallet) headers["x-wallet"] = opts.wallet;

  let body: BodyInit | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody; // FormData etc. — let the browser set Content-Type
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  // Caller headers win over the defaults above.
  Object.assign(headers, opts.headers);

  const res = await fetch(path, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    signal: opts.signal,
  });

  if (!res.ok) {
    let errBody: unknown;
    let message = `${res.status} ${res.statusText}`;
    try {
      errBody = await res.json();
      const e = errBody as { error?: string };
      if (e?.error) message = e.error;
    } catch {
      // non-JSON error body; keep the status-text message
    }
    throw new ApiError(res.status, message, errBody);
  }

  if (res.status === 204) return undefined as T;
  // Some routes return empty bodies on success; guard the parse.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Like apiFetch but never throws — returns `fallback` on any error. For the
 * fire-and-forget / best-effort call sites that currently use `.catch(() => {})`.
 */
export async function apiFetchSafe<T>(
  path: string,
  opts: ApiFetchOptions,
  fallback: T
): Promise<T> {
  try {
    return await apiFetch<T>(path, opts);
  } catch {
    return fallback;
  }
}
