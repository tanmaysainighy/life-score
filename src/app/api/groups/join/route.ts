import { z } from "zod";
import { route, ok, fail } from "@/lib/api";
import { joinGroup } from "@/lib/groups";

export const POST = route(
  async ({ user, body }) => {
    const result = await joinGroup(user.id, body.invite_code);
    return result.ok ? ok({ id: result.id }) : fail(result.error, 404, "invalid_invite");
  },
  {
    limit: "write",
    schema: z.object({ invite_code: z.string().min(4).max(16) }),
  },
);
