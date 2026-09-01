import { z } from "zod";
import { route, ok, fail } from "@/lib/api";
import { createEntry } from "@/lib/activities";
import { invalidate } from "@/lib/cache";
import { getLevelFromXP } from "@/lib/levels";

/**
 * Creates an entry. The body carries no XP — the server reads the rate from the
 * taxonomy and scores it. A client that sends `xp` is simply ignored.
 */
export const POST = route(
  async ({ user, body }) => {
    const before = body.previous_lifetime_xp ?? null;
    const result = await createEntry(user, {
      activityId: body.activity_id,
      durationMinutes: body.duration_minutes,
      rawText: body.raw_text,
      method: body.method,
      confidence: body.confidence,
    }, { acknowledged: body.acknowledged });

    if (!result.ok) {
      return fail(result.issue.message, result.issue.severity === "error" ? 400 : 409, result.issue.code);
    }

    invalidate(`groups:${user.id}`);
    invalidate("lb:");

    return ok({
      id: result.id,
      xp: result.xp,
      total_xp: result.totalXp,
      level: getLevelFromXP(result.totalXp),
      levelled_up: before !== null && getLevelFromXP(before) < getLevelFromXP(result.totalXp),
      activity: { id: result.activity.id, name: result.activity.name, icon: result.activity.icon },
      duration_minutes: result.durationMinutes,
    }, 201);
  },
  {
    limit: "write",
    schema: z.object({
      activity_id: z.string().min(1),
      duration_minutes: z.number().int().min(1).max(1440),
      raw_text: z.string().min(1).max(500),
      method: z.enum(["exact", "alias", "memory", "keyword", "llm", "manual"]).optional(),
      confidence: z.number().min(0).max(1).optional(),
      acknowledged: z.boolean().optional(),
      previous_lifetime_xp: z.number().int().min(0).optional(),
    }),
  },
);
