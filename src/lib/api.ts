import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

/**
 * Shared helpers for the read-only REST API under /api/v1.
 * Success: { data, meta? }  ·  Error: { error: { code, message } }
 */

export function jsonOk<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json(
    meta ? { data, meta } : { data },
    { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } }
  );
}

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } }
  );
}

export function notFound(what: string): NextResponse {
  return jsonError(404, "not_found", `${what} not found`);
}

/** Wraps a handler: zod failures → 400, anything else → 500. */
export function handleApi(
  fn: () => Promise<NextResponse>
): Promise<NextResponse> {
  return fn().catch((err) => {
    if (err instanceof ZodError) {
      return jsonError(400, "invalid_params", z.prettifyError(err));
    }
    console.error("[api]", err);
    return jsonError(500, "internal_error", "Unexpected server error");
  });
}

export const limitParam = z.coerce.number().int().min(1).max(100).default(50);
export const offsetParam = z.coerce.number().int().min(0).default(0);

export const pageParamsSchema = z.object({
  limit: limitParam,
  offset: offsetParam,
});

export function parsePageParams(request: Request) {
  const params = searchParamsOf(request);
  return pageParamsSchema.parse({
    limit: params.get("limit") ?? undefined,
    offset: params.get("offset") ?? undefined,
  });
}

export function searchParamsOf(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}
