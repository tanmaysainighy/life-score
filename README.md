# LifeScore

Write what you did in plain language. Get a fair, deterministic score.

```
"I worked on my startup backend for 4 hours"
        ↓
Backend Development · 4 h × 15 XP/h = +60 XP
```

Two people describing the same activity in different words earn the same XP.
Always.

## The rule everything else follows

**The model interprets. It never scores.**

```
raw text  →  interpretation  →  canonical activity  →  scoring engine  →  XP
             (a model, only     (a database row)       (a pure function)
              when needed)
```

The model has exactly one job: decide which of a shortlist of activities a
sentence refers to. It is never sent a rate, never asked for a number, and its
answer is checked against that shortlist before anything downstream uses it.
Rates live in the database; [`scoring.ts`](src/lib/scoring.ts) turns
`(rate, duration)` into XP and does nothing else — no clock, no user, no
randomness.

That separation is what makes fairness testable rather than hoped for.

## Running it

```bash
npm install && npm run dev
```

Open http://localhost:3000 and create an account. There is no database to
install: with `DATABASE_URL` unset the app runs Postgres in-process (PGlite),
storing data under `data/pgdata`. The activity taxonomy seeds itself on boot, so
the app is useful immediately.

| Command | |
| --- | --- |
| `npm run dev` | development server |
| `npm test` | 97 tests — no database server, no network |
| `npm run build` / `npm start` | production build and server |
| `npm run typecheck` | |
| `npm run seed` | reapply the taxonomy after editing `taxonomy.ts` |
| `npm run check:llm` | is the model reachable, and does classification work? |
| `npm run reset -- --yes` | wipe all accounts and their data; keep the taxonomy |
| `npm run import:sqlite` | one-off migration from the old SQLite build |

Scripts read `.env` themselves, so there is no shell-specific `VAR=value` prefix
to get right — and no ambiguity about which database they hit. Check
`DATABASE_URL` before running `reset`.

## Configuration

Copy `.env.example` to `.env`. Everything in it is optional except in production.

| Variable | |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. **Required in production** — a missing one throws on boot rather than silently writing to a container filesystem that vanishes on the next deploy. Free tiers: [Neon](https://neon.tech), [Supabase](https://supabase.com). |
| `GROQ_API_KEY` | Enables the model fallback. Without it the app still works — see below. |
| `GROQ_MODEL` | Defaults to `openai/gpt-oss-120b`. Must support tool calling. |

## Without an API key

The app is fully functional without one, because resolution runs a cascade that
gets cheaper the more confident it is:

| | Step | Cost |
| --- | --- | --- |
| 1 | exact alias | ~6 ms, free |
| 2 | stemmed alias — `coded` / `coding` / `code` collapse to one key | ~6 ms, free |
| 3 | your own past phrasing | ~9 ms, free |
| 4 | alias inside the sentence, whole words only | ~8 ms, free |
| 5 | token similarity across names and keywords | ~8 ms, free |
| 6 | **model classification** — a shortlist of ~12 candidates, names only | ~1 s, billed |

Everyday phrasing never reaches step 6. `coded for 3 hours`,
`went to the gym for an hour` and `I studied machine learning for 2 hours` all
resolve locally against a cached taxonomy of 111 activities and 446 aliases.

When nothing is confident enough, the app asks rather than guesses. The user can
pick the activity from the full taxonomy, and the server remembers that phrasing
for them — matched on stemmed tokens, so teaching it *"worked on TinyFish
integration"* also covers *"spent 3 hours on TinyFish"*. Memory changes
**classification only**; the rate is always the shared one.

Because every model failure degrades gracefully, a dead key or a retired model id
leaves the app working but quietly dumber. `npm run check:llm` makes one real
call and tells you which it is. Worth running after any provider change —
providers retire model ids without notice.

## Layout

```
src/lib/
  scoring.ts       the XP formula, and pricing for new activities — pure
  levels.ts        level curve;  streak.ts  streak rules
  validation.ts    anti-gaming limits, deliberately outside the scoring engine
  resolver.ts      the six-step cascade, taxonomy cache, personal memory
  taxonomy.ts      all 111 canonical activities and their rates
  activities.ts    interpret → validate → score → store. The only path to XP
  llm.ts           the single model call: strict schema, injection-hardened
  queries.ts       every read model, as SQL aggregates over indexes
  db.ts            one async interface over two Postgres backends
  schema.sql       tables and indexes
  auth.ts          scrypt passwords, opaque server-side sessions
  groups.ts        membership and roles
  api.ts           one wrapper giving routes auth, rate limits, validation

src/app/           pages (server-rendered) and REST routes
src/components/    UI — 8 client components, everything else is server
tests/             scoring, durations, levels, streaks, resolution, integration
```

Roughly 3,700 lines across the engine, a third of which is taxonomy data.

## Notable decisions

**Postgres, with no server to install locally.** One driver interface, two
backends: `pg` against a real server when `DATABASE_URL` is set, PGlite —
Postgres compiled to WASM — in-process when it isn't. Local development and the
test suite need nothing running, and tests are hermetic. Queries are written with
`?` placeholders and rewritten to `$1, $2…` inside `db.ts`.

**Scores are versioned and snapshotted.** Every log row stores the rate and
`scoring_version` it was scored at. Re-pricing the taxonomy changes what new
entries earn and leaves history untouched — there is a test for exactly this.

**Activity ids never move.** Logs reference activities by id, so re-seeding keeps
existing slugs on their original ids. Without that, inserting an activity in the
middle of the taxonomy would silently repoint history at the wrong activity.

**New activities are priced by their neighbours.** When something genuinely new
appears, its rate is the *median* of related activities, clamped to the range the
taxonomy uses. Median, not mean, so one outlier cannot drag it. Fewer than two
neighbours and it refuses to price at all and asks you to pick something closer —
nobody, model or user, invents a number.

**Rest is tracked, not scored.** Sleep is 0 XP/h; TV and scrolling score low.
Streaks additionally exclude the whole rest category *in the query*, so
re-pricing leisure later can never quietly make streaks farmable.

**Competition is with people you chose.** Groups only — there is no global
leaderboard. Ranking every account against every other one is the wrong social
model here, and it would expose every user's name and total to every other user
by default.

**Server-rendered by default.** The dashboard runs its queries during the render,
so there is no request waterfall. The activity timeline expands with a native
`<details>`, so reading your history costs no JavaScript at all.

## Security

- **XP is created server-side only.** The confirm endpoint takes an activity id
  and a duration. A body carrying `{"xp": 99999}` is ignored; the server reads
  the rate from the taxonomy and scores it itself.
- **User text is data, not instruction.** It reaches the model wrapped in
  `<user_activity>` tags under a system prompt that forbids following anything
  inside it. The prompt contains no scoring information to manipulate.
- **Model output is validated.** Schema-checked, and any activity id it returns
  that was not in the shortlist we sent is rejected.
- **Sessions** are opaque server-side tokens; passwords are scrypt-hashed. The
  cookie carries no user data.
- **Rate limits:** 20/min on the model endpoint, 60/min on writes, 10 per 5 min
  on auth.
- **Group data requires membership.** Non-members get a 404 rather than a 403, so
  a group's existence is not leaked.

Known limitation: the rate limiter and the leaderboard cache are in-process, so
running more than one instance loosens the limits proportionally. Correct at one
instance; moving them to Redis is the fix when that changes.

## Anti-gaming

| Case | Response |
| --- | --- |
| More than 24 h in one entry | rejected |
| Day total would pass 24 h | rejected, naming the time left |
| Unusually long session for its category | asks you to confirm |
| Same activity again within 10 min | warns, confirmable |

Impossible entries are refused; improbable ones are questioned. Neither accuses.

## Deploying

State lives in Postgres, so the container is stateless — no volume, and it scales
past one instance.

1. Create a Postgres database and copy its connection string.
2. Set `DATABASE_URL` and `GROQ_API_KEY` on the host. Leave `NODE_ENV` and `PORT`
   alone; the platform sets those.
3. Deploy. The schema and taxonomy apply themselves on boot, and `/api/health`
   reports readiness — the probe seeds a fresh database rather than waiting for
   the first page load.

The `Dockerfile` builds a standalone server and pins `HOSTNAME=0.0.0.0`, without
which Next binds to the container id and the platform's proxy answers 502.
