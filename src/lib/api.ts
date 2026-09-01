import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getSessionUser } from "./auth";
import { rateLimit, type LIMITS } from "./ratelimit";
import type { SessionUser } from "./queries";

/**
 * Shared plumbing for route handlers: one response shape, one place where auth,
 * rate limiting and body validation happen.
 *
 *   success -> { data: ... }
 *   failure -> { error: "message", code?: "..." }
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

type Handler<Body> = (context: {
  user: SessionUser;
  body: Body;
  request: Request;
  params: Record<string, string>;
}) => Promise<Response> | Response;

type Options<Body> = {
  schema?: ZodType<Body>;
  limit?: keyof typeof LIMITS;
};

/**
 * Wraps a handler with authentication, optional rate limiting and optional body
 * validation. Any unexpected throw becomes a 500 with a friendly message rather
 * than a crash.
 */
export function route<Body = undefined>(handler: Handler<Body>, options: Options<Body> = {}) {
  // Next derives the context type per route (dynamic segments vs none), so the
  // shared wrapper stays deliberately loose here and narrows on the way in.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (request: Request, context: { params: Promise<any> }): Promise<Response> => {
    try {
      const user = await getSessionUser();
      if (!user) return fail("You need to be signed in.", 401, "unauthenticated");

      if (options.limit) {
        const result = rateLimit(options.limit, user.id);
        if (!result.ok) {
          return NextResponse.json(
            { error: `Slow down a moment — try again in ${result.retryAfterSeconds}s.`, code: "rate_limited" },
            { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
          );
        }
      }

      let body = undefined as Body;
      if (options.schema) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return fail("Expected a JSON body.", 400, "bad_json");
        }
        const parsed = options.schema.safeParse(raw);
        if (!parsed.success) {
          return fail(parsed.error.issues[0]?.message ?? "That request wasn't valid.", 400, "invalid_body");
        }
        body = parsed.data;
      }

      const params = ((await context?.params) ?? {}) as Record<string, string>;
      return await handler({ user, body, request, params });
    } catch (error) {
      console.error("[api]", error);
      return fail("Something went wrong on our side. Your entry hasn't been lost — please try again.", 500, "server_error");
    }
  };
}
