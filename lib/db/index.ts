import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __ghqDb: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt");
  const client = postgres(url, {
    // kompatibel mit Supabase Transaction Pooler (PgBouncer)
    prepare: false,
    // max:1 war ein Fehler: postgres.js hat parallele Abfragen dann auf
    // EINE Verbindung gepipelinet, was der Transaction Pooler nicht
    // verträgt — das Dashboard (7 Abfragen in einem Promise.all) blieb
    // dadurch minutenlang hängen, bis der Statement-Timeout zuschlug.
    // Mit mehreren Verbindungen laufen dieselben Abfragen in ~1 s.
    max: 4,
    // Verbindungen zeitnah zurückgeben, damit Serverless-Instanzen den
    // Pooler des Free Tiers nicht mit Leerlauf-Verbindungen belegen.
    idle_timeout: 20,
    connect_timeout: 15,
  });
  return drizzle(client, { schema });
}

/** Lazy Singleton — überlebt HMR in dev, eine Verbindung pro Lambda */
export function getDb() {
  if (!globalThis.__ghqDb) globalThis.__ghqDb = createDb();
  return globalThis.__ghqDb;
}

export type Db = ReturnType<typeof getDb>;
export * as tables from "./schema";
