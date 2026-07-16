import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __ghqDb: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt");
  // prepare:false → kompatibel mit Supabase Transaction Pooler (PgBouncer)
  const client = postgres(url, { prepare: false, max: 1 });
  return drizzle(client, { schema });
}

/** Lazy Singleton — überlebt HMR in dev, eine Verbindung pro Lambda */
export function getDb() {
  if (!globalThis.__ghqDb) globalThis.__ghqDb = createDb();
  return globalThis.__ghqDb;
}

export type Db = ReturnType<typeof getDb>;
export * as tables from "./schema";
