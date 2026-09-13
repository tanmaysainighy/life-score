import { all, get, run, transaction } from "./db";
import {
  getActivity, rankCandidates, resolveDeterministic, rememberPhrase,
  deriveActivity, listActivities,
  type Activity, type ResolutionMethod,
} from "./resolver";
import { classifyActivity, LLM_AVAILABLE } from "./llm";
import { parseDuration } from "./duration";
import { explainScore, scoreActivity } from "./scoring";
import { validateEntry, DUPLICATE_WINDOW_MINUTES, type ValidationIssue } from "./validation";
import { localDay } from "./dates";
import { splitSegments } from "./segments";

/**
 * Activity pipeline: interpret -> resolve -> validate -> score -> store.
 *
 * `analyze` never writes and never scores anything into the database; it
 * returns a proposal. `createEntry` re-derives the score from the taxonomy
 * server-side, so nothing the client sends can influence XP.
 */

export const ACCEPT_CONFIDENCE = 0.9;
export const CONFIRM_CONFIDENCE = 0.7;

export type AnalyzeResult =
  | {
      status: "ready" | "confirm";
      activity: Activity;
      durationMinutes: number;
      xp: number;
      formula: string;
      confidence: number;
      method: ResolutionMethod;
      note: string | null;
    }
  | { status: "need_duration"; activity: Activity; message: string }
  // `durationMinutes` is whatever we could parse from the text. It lets the UI
  // offer a manual activity pick without asking for the duration again.
  | { status: "clarify"; message: string; durationMinutes?: number | null }
  | { status: "error"; message: string }
  // Two or more things logged in one sentence. Each carries its own duration,
  // or asks for one.
  | { status: "multi"; items: MultiItem[] };

export type MultiItem = {
  activity: Activity;
  durationMinutes: number | null;
  xp: number | null;
  confidence: number;
  method: ResolutionMethod;
  rawText: string;
};

/** Interprets raw text. Read-only; the LLM is used only when needed. */
export async function analyzeEntry(userId: string, rawText: string): Promise<AnalyzeResult> {
  const text = rawText.trim();
  if (text.length < 2) {
    return { status: "clarify", message: "Tell me what you did — a few words is enough." };
  }
  if (text.length > 500) {
    return { status: "error", message: "That's a bit long. Keep it to a sentence or two." };
  }

  const multi = await analyzeSegments(userId, text);
  if (multi) return multi;

  const statedDuration = parseDuration(text);
  const deterministic = await resolveDeterministic(text, userId);

  // Fast path: we know the activity and the duration without any model call.
  if (deterministic && deterministic.confidence >= ACCEPT_CONFIDENCE) {
    if (statedDuration === null) {
      return {
        status: "need_duration",
        activity: publicActivity(deterministic.activity),
        message: `Got it — ${deterministic.activity.name}. How long did you spend on it?`,
      };
    }
    return present(deterministic.activity, statedDuration, deterministic.confidence, deterministic.method, null);
  }

  // Otherwise ask the model, giving it only a shortlist to choose from.
  const candidates = (await rankCandidates(text, 12)).map((row) => row.activity);
  const shortlist = candidates.length >= 3 ? candidates : await topLevelActivities();
  const classification = LLM_AVAILABLE ? await classifyActivity(text, shortlist) : null;

  if (!classification) {
    // No model, or the model failed. Fall back to whatever we resolved
    // deterministically rather than inventing an answer.
    if (deterministic && deterministic.confidence >= CONFIRM_CONFIDENCE) {
      if (statedDuration === null) {
        return {
          status: "need_duration",
          activity: publicActivity(deterministic.activity),
          message: `I think this is ${deterministic.activity.name}. How long did you spend on it?`,
        };
      }
      return present(deterministic.activity, statedDuration, deterministic.confidence, deterministic.method,
        `I matched this to ${deterministic.activity.name}. Change it if that's not right.`);
    }
    return {
      status: "clarify",
      durationMinutes: statedDuration,
      message: "I don't know that one yet. Pick the closest activity and I'll remember it for next time.",
    };
  }

  if (classification.needs_clarification && !classification.activity_id) {
    return {
      status: "clarify",
      durationMinutes: statedDuration,
      message: classification.clarification_question
        ?? "I'm not sure what activity you mean. Can you give me a little more detail?",
    };
  }

  const duration = statedDuration ?? classification.duration_minutes;

  // Known activity chosen from the shortlist.
  if (classification.activity_id) {
    const activity = await getActivity(classification.activity_id);
    if (!activity) return { status: "clarify", message: "I couldn't match that to an activity. Can you rephrase it?" };
    if (duration === null) {
      return {
        status: "need_duration",
        activity: publicActivity(activity),
        message: `I understand the activity — ${activity.name} — but I need the duration to score it.`,
      };
    }
    return present(activity, duration, classification.confidence, "llm", null);
  }

  // Nothing fit: derive a new canonical activity, priced from its neighbours.
  if (classification.proposed_activity_name && classification.proposed_parent_id) {
    const derived = await deriveActivity(
      classification.proposed_activity_name,
      classification.proposed_parent_id,
      shortlist.map((activity) => activity.id),
    );
    if (derived) {
      if (duration === null) {
        return {
          status: "need_duration",
          activity: publicActivity(derived),
          message: `New one for me — I've filed that as ${derived.name}. How long did you spend?`,
        };
      }
      return present(derived, duration, Math.min(classification.confidence, 0.85), "llm",
        `This is a new activity for LifeScore. It's scored at ${derived.base_xp_per_hour} XP/h, in line with similar activities.`);
    }
    // No confident way to price it, and nothing here reviews a queue — so say
    // that plainly rather than promising a review that never happens.
    return {
      status: "clarify",
      durationMinutes: duration,
      message: `I can't score "${classification.proposed_activity_name}" fairly yet. Pick the closest activity and I'll remember it for next time.`,
    };
  }

  return {
    status: "clarify",
    durationMinutes: duration,
    message: classification.clarification_question
      ?? "I'm not sure what activity you mean. Can you give me a little more detail?",
  };
}

/**
 * Does this sentence describe more than one activity?
 *
 * Splitting is cheap; accepting the split is the careful part. Two clauses are
 * only treated as separate entries when each resolves confidently *and* they
 * look genuinely separate: either each states its own duration, or they land in
 * different categories. Without that second test, "worked on backend and API
 * for 4 hours" would become two entries and quietly double the XP for one
 * afternoon.
 *
 * Resolution here is deterministic only. Calling the model once per clause
 * would multiply latency and cost for a case the cascade already handles.
 */
async function analyzeSegments(userId: string, text: string): Promise<AnalyzeResult | null> {
  const segments = splitSegments(text);
  if (segments.length < 2) return null;

  const resolved = await Promise.all(segments.map(async (segment) => {
    const resolution = await resolveDeterministic(segment, userId);
    return resolution && resolution.confidence >= CONFIRM_CONFIDENCE
      ? { resolution, durationMinutes: parseDuration(segment), rawText: segment }
      : null;
  }));

  if (resolved.some((item) => item === null)) return null;
  const items = resolved as NonNullable<(typeof resolved)[number]>[];

  const distinct = new Set(items.map((item) => item.resolution.activity.id));
  if (distinct.size < 2) return null;

  // A compound object names one activity and a part of it: "backend and API"
  // is Backend Development plus its own child, not an afternoon spent twice.
  // Unrelated activities — cooking and cleaning, running and yoga — really are
  // two things, even when they share a category and neither states a duration.
  const byId = new Map((await listActivities()).map((activity) => [activity.id, activity]));
  const ancestors = (id: string): Set<string> => {
    const chain = new Set<string>();
    for (let at = byId.get(id)?.parent_id; at && !chain.has(at); at = byId.get(at)?.parent_id) {
      chain.add(at);
    }
    return chain;
  };
  const ids = [...distinct];
  const related = ids.some((a) => ids.some((b) => a !== b && ancestors(a).has(b)));
  if (related) return null;

  return {
    status: "multi",
    items: items.map(({ resolution, durationMinutes, rawText }) => ({
      activity: publicActivity(resolution.activity),
      durationMinutes,
      xp: durationMinutes === null
        ? null
        : scoreActivity({ baseXpPerHour: resolution.activity.base_xp_per_hour, durationMinutes }),
      confidence: Number(resolution.confidence.toFixed(2)),
      method: resolution.method,
      rawText,
    })),
  };
}

/**
 * The cached taxonomy rows carry a token index used for matching; strip it so
 * responses stay small and internals stay internal.
 */
function publicActivity(activity: Activity): Activity {
  return {
    id: activity.id, name: activity.name, slug: activity.slug,
    parent_id: activity.parent_id, category: activity.category,
    base_xp_per_hour: activity.base_xp_per_hour, icon: activity.icon,
    keywords: activity.keywords, scoring_version: activity.scoring_version,
    status: activity.status,
  };
}

function present(
  activity: Activity,
  durationMinutes: number,
  confidence: number,
  method: ResolutionMethod,
  note: string | null,
): AnalyzeResult {
  const explanation = explainScore({
    baseXpPerHour: activity.base_xp_per_hour,
    durationMinutes,
  });
  return {
    status: confidence >= ACCEPT_CONFIDENCE ? "ready" : "confirm",
    activity: publicActivity(activity),
    durationMinutes,
    xp: explanation.xp,
    formula: explanation.formula,
    confidence: Number(confidence.toFixed(2)),
    method,
    note,
  };
}

async function topLevelActivities(): Promise<Activity[]> {
  return (await listActivities()).filter((activity) => activity.parent_id === null);
}

// --- writes ---------------------------------------------------------------

export type CreateResult =
  | { ok: true; id: string; xp: number; activity: Activity; durationMinutes: number; totalXp: number }
  | { ok: false; issue: ValidationIssue };

/**
 * The only path that creates XP. The client sends an activity id, a duration
 * and the original text — never a score. The rate is read from the taxonomy
 * here and snapshotted onto the row along with its scoring_version.
 */
export async function createEntry(
  user: { id: string; timezone: string },
  input: { activityId: string; durationMinutes: number; rawText: string; method?: ResolutionMethod; confidence?: number },
  options: { acknowledged?: boolean } = {},
): Promise<CreateResult> {
  const activity = await getActivity(input.activityId);
  if (!activity) {
    return { ok: false, issue: { severity: "error", code: "unknown_activity", message: "That activity doesn't exist." } };
  }

  const now = new Date();
  const day = localDay(now, user.timezone);
  const timestamp = now.toISOString();
  const duplicateSince = new Date(now.getTime() - DUPLICATE_WINDOW_MINUTES * 60_000).toISOString();

  /**
   * Read, validate and write in one transaction, behind a row lock on the user.
   *
   * Reading the day total outside the transaction let two concurrent entries
   * both see the same total, both pass the 24-hour check and both insert, so
   * the cap could be exceeded by racing it. The lock serialises a single user's
   * writes; it is taken on their own row, so it never blocks anyone else.
   */
  const outcome = await transaction(async (): Promise<{ blocked: ValidationIssue } | { id: string; xp: number; totalXp: number }> => {
    await run(`SELECT id FROM users WHERE id = ? FOR UPDATE`, user.id);

    const minutesToday = (await get<{ total: number }>(
      `SELECT COALESCE(SUM(duration_minutes), 0) AS total
         FROM activity_logs WHERE user_id = ? AND local_day = ?`,
      user.id, day,
    ))?.total ?? 0;

    const duplicate = (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM activity_logs
        WHERE user_id = ? AND activity_id = ? AND duration_minutes = ? AND created_at >= ?`,
      user.id, activity.id, input.durationMinutes, duplicateSince,
    ))?.n ?? 0;

    const issue = validateEntry(input.durationMinutes, {
      category: activity.category,
      minutesLoggedToday: minutesToday,
      hasRecentDuplicate: duplicate > 0,
    });
    if (issue && (issue.severity === "error" || !options.acknowledged)) {
      return { blocked: issue };
    }

    const xp = scoreActivity({
      baseXpPerHour: activity.base_xp_per_hour,
      durationMinutes: input.durationMinutes,
    });
    const id = `LOG_${crypto.randomUUID()}`;

    await run(
      `INSERT INTO activity_logs
         (id, user_id, activity_id, raw_text, duration_minutes, xp, base_xp_per_hour,
          scoring_version, resolution_method, confidence, local_day, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, user.id, activity.id, input.rawText.slice(0, 500), input.durationMinutes, xp,
      activity.base_xp_per_hour, activity.scoring_version, input.method ?? "manual",
      input.confidence ?? 1, day, timestamp, timestamp,
    );
    await rememberPhrase(user.id, input.rawText, activity.id);

    const totalXp = (await get<{ total: number }>(
      `SELECT COALESCE(SUM(xp), 0) AS total FROM activity_logs WHERE user_id = ?`, user.id,
    ))?.total ?? 0;

    return { id, xp, totalXp };
  });

  if ("blocked" in outcome) return { ok: false, issue: outcome.blocked };
  const { id, xp, totalXp } = outcome;

  return { ok: true, id, xp, activity: publicActivity(activity), durationMinutes: input.durationMinutes, totalXp };
}

/**
 * Edits re-score through the same engine. The rate used is the current one for
 * that activity — the entry is being restated now, so it is priced now.
 */
export async function updateEntry(
  userId: string,
  logId: string,
  input: { activityId?: string; durationMinutes?: number; rawText?: string },
): Promise<CreateResult> {
  const existing = await get<{ activity_id: string; duration_minutes: number; raw_text: string; local_day: string }>(
    `SELECT activity_id, duration_minutes, raw_text, local_day FROM activity_logs WHERE id = ? AND user_id = ?`,
    logId, userId,
  );
  if (!existing) {
    return { ok: false, issue: { severity: "error", code: "not_found", message: "That entry no longer exists." } };
  }

  const activity = await getActivity(input.activityId ?? existing.activity_id);
  const durationMinutes = input.durationMinutes ?? existing.duration_minutes;
  if (!activity) {
    return { ok: false, issue: { severity: "error", code: "unknown_activity", message: "That activity doesn't exist." } };
  }

  // Day totals exclude this entry, since the edit replaces it rather than adds.
  const minutesOtherEntries = (await get<{ total: number }>(
    `SELECT COALESCE(SUM(duration_minutes), 0) AS total
       FROM activity_logs WHERE user_id = ? AND local_day = ? AND id != ?`,
    userId, existing.local_day, logId,
  ))?.total ?? 0;

  const issue = validateEntry(durationMinutes, {
    category: activity.category,
    minutesLoggedToday: minutesOtherEntries,
    hasRecentDuplicate: false,
  });
  if (issue?.severity === "error") return { ok: false, issue };

  const xp = scoreActivity({ baseXpPerHour: activity.base_xp_per_hour, durationMinutes });
  await run(
    `UPDATE activity_logs
        SET activity_id = ?, duration_minutes = ?, raw_text = ?, xp = ?,
            base_xp_per_hour = ?, scoring_version = ?, resolution_method = 'manual', updated_at = ?
      WHERE id = ? AND user_id = ?`,
    activity.id, durationMinutes, (input.rawText ?? existing.raw_text).slice(0, 500), xp,
    activity.base_xp_per_hour, activity.scoring_version, new Date().toISOString(), logId, userId,
  );

  const totalXp = (await get<{ total: number }>(
    `SELECT COALESCE(SUM(xp), 0) AS total FROM activity_logs WHERE user_id = ?`, userId,
  ))?.total ?? 0;

  return { ok: true, id: logId, xp, activity: publicActivity(activity), durationMinutes, totalXp };
}

export async function deleteEntry(userId: string, logId: string): Promise<boolean> {
  const existing = await get<{ id: string }>(
    `SELECT id FROM activity_logs WHERE id = ? AND user_id = ?`, logId, userId,
  );
  if (!existing) return false;
  await run(`DELETE FROM activity_logs WHERE id = ? AND user_id = ?`, logId, userId);
  return true;
}

/**
 * Flat list for the manual activity picker.
 *
 * Served from the taxonomy cache rather than the database: the same ~111 rows
 * are already in memory, so querying them again would be a round trip for data
 * we hold. The map also strips the resolver's token index, which is internal.
 */
export async function activityOptions() {
  return (await listActivities())
    .map(({ id, name, category, icon, base_xp_per_hour }) =>
      ({ id, name, category, icon, base_xp_per_hour }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
