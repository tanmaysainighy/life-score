import { route, ok } from "@/lib/api";
import { activityOptions } from "@/lib/activities";

/** The taxonomy for the manual picker. Cached hard — it barely changes. */
export const GET = route(async () =>
  ok({ activities: await activityOptions() }, 200));
