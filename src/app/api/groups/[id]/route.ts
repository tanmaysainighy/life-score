import { route, ok, fail } from "@/lib/api";
import { leaveGroup } from "@/lib/groups";

export const DELETE = route(async ({ user, params }) => {
  const result = await leaveGroup(user.id, params.id);
  return result.ok ? ok({ left: true }) : fail(result.error ?? "Couldn't leave that group.", 400);
}, { limit: "write" });
