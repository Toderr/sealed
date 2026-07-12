// Server-side route error handling. Centralizes the ~85 hand-rolled
// `Response.json({ error }, { status })` sites and the 17 try/catch→500 blocks.
//
// Distinct from lib/api-client.ts's `ApiError` (client-side: an error *received*
// from a fetch). `HttpError` here is an error *to return* from a route handler.
import { NextRequest } from "next/server";

/**
 * A thrown HTTP error. Throw it anywhere inside a withRoute()-wrapped handler;
 * the wrapper turns it into `Response.json({ error: message }, { status })`.
 *
 *   if (!deal) throw new HttpError(404, "Deal not found");
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * A Supabase/PostgREST error meaning the table doesn't exist in this database
 * (schema not applied) — code PGRST205, or Postgres 42P01 "relation does not
 * exist". Lets routes return a clean message instead of leaking the raw error.
 */
export function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}

/** Shorthand for a JSON success response (mirrors the routes' Response.json). */
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response> | Response;

/**
 * Wrap a route handler so thrown HttpErrors become `{ error }` responses and
 * anything else becomes a logged 500. Replaces the per-route try/catch.
 *
 *   export const POST = withRoute(async (req) => {
 *     const wallet = requireWallet(req);
 *     const { deal_id } = requireFields(await req.json(), ["deal_id"]);
 *     ...
 *     return json({ ok: true });
 *   });
 *
 * The generic Ctx preserves Next's `{ params }` arg for dynamic routes.
 */
export function withRoute<Ctx = unknown>(handler: RouteHandler<Ctx>) {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        return Response.json({ error: e.message }, { status: e.status });
      }
      console.error("[route] unhandled error:", e);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

/* ── Small validators — each throws HttpError(400) on failure ── */

/** Require a present, non-empty string (e.g. a query param or body field). */
export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `Missing or invalid ${name}`);
  }
  return value;
}

/**
 * Require the named fields to be present (non-null/undefined) on a parsed body.
 * Returns the body narrowed so the fields are known-present. Mirrors the common
 * `if (!a || !b) return 400` guard.
 */
export function requireFields<T extends Record<string, unknown>, K extends string>(
  body: T,
  fields: readonly K[]
): T & { [P in K]: NonNullable<T[P]> } {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === "") {
      throw new HttpError(400, "Missing required fields");
    }
  }
  return body as T & { [P in K]: NonNullable<T[P]> };
}
