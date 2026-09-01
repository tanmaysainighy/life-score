import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

/**
 * Postgres access layer.
 *
 * Two drivers behind one interface:
 *   DATABASE_URL set  -> node-postgres against a real server (production)
 *   not set           -> PGlite, real Postgres compiled to WASM, in-process
 *
 * PGlite means `npm run dev` and `npm test` need no database server at all, and
 * tests stay hermetic. It is the same Postgres engine, so SQL that works in one
 * works in the other.
 *
 * Queries throughout the app are written with `?` placeholders; `toPositional`
 * rewrites them to Postgres's `$1, $2, …` so the SQL itself reads the same in
 * either dialect.
 */

type Row = Record<string, unknown>;

/** A single connection held for the length of a transaction. */
type Session = {
  query: (sql: string, params: unknown[]) => Promise<{ rows: Row[] }>;
  exec: (sql: string) => Promise<void>;
  release: () => void;
};

type Driver = {
  /** One parameterised statement, on any pooled connection. */
  query: (sql: string, params: unknown[]) => Promise<{ rows: Row[] }>;
  /** Raw SQL that may contain several statements (the schema). */
  exec: (sql: string) => Promise<void>;
  /** Checks out one connection and keeps it until released. */
  session: () => Promise<Session>;
  close: () => Promise<void>;
};

/**
 * The connection a transaction is running on, if any.
 *
 * Statements inside a transaction must all run on the *same* connection. Rather
 * than thread a client argument through every query in the app, the active
 * transaction is carried in async context, so ordinary `run`/`get`/`all` calls
 * inside `transaction(...)` route to it automatically.
 */
const activeTransaction = new AsyncLocalStorage<Session>();

const globalForDb = globalThis as unknown as {
  __lifescoreDriver?: Promise<Driver>;
  __lifescoreReady?: Promise<void>;
};

/** `?` → `$1, $2, …`, leaving anything inside quotes alone. */
export function toPositional(sql: string): string {
  let index = 0;
  let quote: string | null = null;
  let out = "";

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (quote) {
      if (char === quote) quote = null;
      out += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      out += char;
      continue;
    }
    out += char === "?" ? `$${++index}` : char;
  }
  return out;
}

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;

  // Falling back to the in-process database in production would mean writing to
  // a container filesystem that vanishes on the next deploy. Fail loudly.
  if (!url && process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. Production needs a Postgres connection string — " +
      "data written to the local fallback would be lost on the next deploy.",
    );
  }

  if (url) {
    const { default: pg } = await import("pg");
    // COUNT/SUM come back as bigint, which node-postgres returns as strings by
    // default. Every total in this app is well inside Number range.
    pg.types.setTypeParser(20, Number);   // int8
    pg.types.setTypeParser(1700, Number); // numeric

    const pool = new pg.Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Managed Postgres (Neon, Supabase, Render) terminates TLS with its own
      // chain; verification is handled by the provider's hostname.
      ssl: url.includes("localhost") || url.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
    });

    return {
      query: (sql, params) => pool.query(sql, params),
      // No parameters means the simple query protocol, which accepts a script.
      exec: async (sql) => { await pool.query(sql); },
      session: async () => {
        const client = await pool.connect();
        return {
          query: (sql, params) => client.query(sql, params),
          exec: async (sql) => { await client.query(sql); },
          release: () => client.release(),
        };
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  // In-memory for tests, on disk for `npm run dev` so data survives a restart.
  const dataDir = process.env.PGLITE_PATH ?? path.join(process.cwd(), "data", "pgdata");
  const client = new PGlite(process.env.PGLITE_MEMORY ? undefined : dataDir);
  await client.waitReady;

  const query = async (sql: string, params: unknown[]) => {
    const result = await client.query(sql, params as never[]);
    return { rows: (result.rows ?? []) as Row[] };
  };
  const exec = async (sql: string) => { await client.exec(sql); };

  // PGlite is a single connection, so a session is that same connection.
  return { query, exec, session: async () => ({ query, exec, release: () => {} }), close: () => client.close() };
}

function driver(): Promise<Driver> {
  return (globalForDb.__lifescoreDriver ??= createDriver());
}

/** Applies the schema. Runs once per process; every statement is idempotent. */
export function ready(): Promise<void> {
  return (globalForDb.__lifescoreReady ??= (async () => {
    const connection = await driver();
    const schema = readFileSync(path.join(process.cwd(), "src/lib/schema.sql"), "utf8");
    await connection.exec(schema);
  })());
}

async function execute(sql: string, params: unknown[]): Promise<Row[]> {
  await ready();
  const connection = activeTransaction.getStore() ?? (await driver());
  const { rows } = await connection.query(toPositional(sql), params);
  return rows;
}

export async function all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  return (await execute(sql, params)) as T[];
}

export async function get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  const rows = await execute(sql, params);
  return rows[0] as T | undefined;
}

export async function run(sql: string, ...params: unknown[]): Promise<void> {
  await execute(sql, params);
}

/**
 * Runs `fn` inside a transaction, rolling back on any throw.
 *
 * The connection is checked out for the whole block and bound to async context,
 * so every query `fn` makes lands on it. Issuing BEGIN through the pool instead
 * would return the connection immediately, scattering the statements across
 * different connections and leaving one checked back in mid-transaction.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  await ready();
  // Already inside one: join it rather than opening a nested BEGIN.
  if (activeTransaction.getStore()) return fn();

  const session = await (await driver()).session();
  try {
    await session.exec("BEGIN");
    const result = await activeTransaction.run(session, fn);
    await session.exec("COMMIT");
    return result;
  } catch (error) {
    await session.exec("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    session.release();
  }
}

/** Test/script teardown. */
export async function closeDb(): Promise<void> {
  if (!globalForDb.__lifescoreDriver) return;
  const connection = await globalForDb.__lifescoreDriver;
  await connection.close();
  globalForDb.__lifescoreDriver = undefined;
  globalForDb.__lifescoreReady = undefined;
}
