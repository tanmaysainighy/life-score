import { z } from "zod";
import { route, ok } from "@/lib/api";
import { analyzeEntry } from "@/lib/activities";

/** Interprets free text. Read-only — nothing is stored and no XP is awarded. */
export const POST = route(
  async ({ user, body }) => ok(await analyzeEntry(user.id, body.raw_text)),
  {
    limit: "analyze",
    schema: z.object({
      raw_text: z.string().min(1, "Tell me what you did.").max(500, "Keep it to a sentence or two."),
    }),
  },
);
