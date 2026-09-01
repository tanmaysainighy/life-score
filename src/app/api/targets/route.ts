import { z } from "zod";
import { route, ok, fail } from "@/lib/api";
import { setDailyTarget, removeDailyTarget } from "@/lib/queries";
import { analyzeEntry } from "@/lib/activities";

/**
 * Daily targets — the things you've committed to doing every day.
 *
 * A target is written exactly the way an entry is ("work for 2 hours"), and it
 * goes through the very same interpreter, model fallback included. Anything the
 * composer can understand can be a target; there is no second, weaker parser to
 * fall behind it.
 *
 * A stated duration becomes the goal. Without one the target is just "do this at
 * all", which is the right shape for habits like journalling.
 */
export const POST = route(
  async ({ user, body }) => {
    const result = await analyzeEntry(user.id, body.text);

    switch (result.status) {
      case "ready":
      case "confirm":
        await setDailyTarget(user.id, result.activity.id, result.durationMinutes);
        return ok({ added: [result.activity.name] }, 201);

      // Recognised the activity but no duration was given — that's a valid
      // target, not a failure.
      case "need_duration":
        await setDailyTarget(user.id, result.activity.id, null);
        return ok({ added: [result.activity.name] }, 201);

      // "gym and read for 30 minutes" sets both, same as logging both.
      case "multi":
        for (const item of result.items) {
          await setDailyTarget(user.id, item.activity.id, item.durationMinutes);
        }
        return ok({ added: result.items.map((item) => item.activity.name) }, 201);

      default:
        return fail(result.message);
    }
  },
  { limit: "write", schema: z.object({ text: z.string().min(1).max(200) }) },
);

export const DELETE = route(
  async ({ user, body }) => {
    await removeDailyTarget(user.id, body.activity_id);
    return ok({ removed: true });
  },
  { limit: "write", schema: z.object({ activity_id: z.string().min(1) }) },
);
