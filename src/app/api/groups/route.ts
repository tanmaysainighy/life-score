import { z } from "zod";
import { route, ok, fail } from "@/lib/api";
import { createGroup } from "@/lib/groups";

export const POST = route(
  async ({ user, body }) => {
    const result = await createGroup(user.id, body.name, body.description ?? "", body.emoji ?? "🏆");
    return result.ok ? ok({ id: result.id, invite_code: result.inviteCode }, 201) : fail(result.error);
  },
  {
    limit: "write",
    schema: z.object({
      name: z.string().min(2, "Group names are 2–40 characters.").max(40),
      description: z.string().max(200).optional(),
      emoji: z.string().max(8).optional(),
    }),
  },
);
