import { listActivities } from "../src/lib/resolver.ts";
import { classifyActivity, LLM_AVAILABLE, MODEL, GROQ_ENDPOINT } from "../src/lib/llm.ts";
import { closeDb } from "../src/lib/db.ts";

/**
 * Is the model actually reachable?
 *
 *   npm run check:llm
 *
 * Worth having as its own command because a broken key and a working one look
 * the same from inside the app: classifyActivity returns null on any failure so
 * a request never breaks, and the resolver quietly carries on without it. That
 * is the right behaviour in production and a terrible way to debug, so this
 * makes one real call and reports what came back.
 */

// Imported, never re-declared — a diagnostic that guesses at the config is
// worse than none, which is how the retired model id went unnoticed.
const ENDPOINT = GROQ_ENDPOINT;
const model = MODEL;

function line(label: string, value: string) {
  console.log(`  ${label.padEnd(18)} ${value}`);
}

console.log("\nGroq configuration");
line("API key", LLM_AVAILABLE ? `set (${process.env.GROQ_API_KEY!.length} chars)` : "NOT SET");
line("Model", model);

if (!LLM_AVAILABLE) {
  console.log(`
No key, so the model is never called. The app still works: the deterministic
cascade handles known phrasings, and anything it cannot place asks you to pick
the activity instead of guessing.

Set GROQ_API_KEY in .env to enable the fallback.
`);
  await closeDb();
  process.exit(0);
}

// 1. Is the endpoint reachable and the key accepted? Ask directly so a failure
//    reports its real status rather than being swallowed.
console.log("\nReaching the API");
const started = Date.now();
let reachable = false;

try {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 5,
      messages: [{ role: "user", content: "ping" }],
    }),
  });

  line("HTTP", `${response.status} ${response.statusText}`);
  line("Round trip", `${Date.now() - started} ms`);

  if (response.ok) {
    reachable = true;
  } else {
    const body = await response.text().catch(() => "");
    const hint =
      response.status === 401 ? "the key is wrong or has been rotated"
      : response.status === 404 ? `the model "${model}" does not exist — check console.groq.com/docs/models`
      : response.status === 429 ? "rate limited or out of quota"
      : "see the response below";
    line("Diagnosis", hint);
    console.log(`\n  ${body.slice(0, 300)}`);
  }
} catch (error) {
  line("Result", "could not connect");
  line("Diagnosis", error instanceof Error ? error.message : String(error));
}

// 2. Does the real classification path work end to end? A model can answer
//    "ping" and still fail at tool calling, which is what the app depends on.
if (reachable) {
  console.log("\nClassifying through the app's own path");
  const candidates = (await listActivities()).filter((a) => a.parent_id === null);
  const phrase = "spent 40 minutes doing kintsugi on a broken bowl";
  line("Input", `"${phrase}"`);

  const at = Date.now();
  const result = await classifyActivity(phrase, candidates);
  line("Took", `${Date.now() - at} ms`);

  if (!result) {
    line("Result", "returned nothing");
    console.log(`
  The key works but classification failed. Almost always this is the model not
  supporting tool calling — pick one that does and set GROQ_MODEL.
`);
  } else {
    const match = candidates.find((c) => c.id === result.activity_id);
    line("Matched", match ? match.name : "none of the candidates");
    line("Proposed", result.proposed_activity_name ?? "—");
    line("Duration", result.duration_minutes === null ? "not stated" : `${result.duration_minutes} min`);
    line("Confidence", String(result.confidence));
    console.log(`
  Working. Note the model chose only an activity — it was never sent, and never
  returned, an XP value. Scoring happens after this, from the taxonomy.
`);
  }
}

await closeDb();
