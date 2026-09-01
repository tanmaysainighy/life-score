import { z } from "zod";
import { route, ok, fail } from "@/lib/api";
import { updateEntry, deleteEntry } from "@/lib/activities";
import { invalidate } from "@/lib/cache";

/** Edits re-score through the same engine; the client still can't send XP. */
export const PATCH = route(
  async ({ user, body, params }) => {
    const result = await updateEntry(user.id, params.id, {
      activityId: body.activity_id,
      durationMinutes: body.duration_minutes,
      rawText: body.raw_text,
    });
    if (!result.ok) return fail(result.issue.message, 400, result.issue.code);

    invalidate(`groups:${user.id}`);
    invalidate("lb:");
    return ok({ id: result.id, xp: result.xp, total_xp: result.totalXp });
  },
  {
    limit: "write",
    schema: z.object({
      activity_id: z.string().min(1).optional(),
      duration_minutes: z.number().int().min(1).max(1440).optional(),
      raw_text: z.string().min(1).max(500).optional(),
    }),
  },
);

export const DELETE = route(async ({ user, params }) => {
  if (!(await deleteEntry(user.id, params.id))) return fail("That entry no longer exists.", 404, "not_found");
  invalidate(`groups:${user.id}`);
  invalidate("lb:");
  return ok({ deleted: true });
}, { limit: "write" });
