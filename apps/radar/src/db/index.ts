import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

// One query-builder type for both drivers. Neon (production) and PGlite (local) share
// the same Postgres dialect; we avoid transactions, which the Neon HTTP driver lacks.
export type Db = PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __radarDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__radarDb ??= connect();
  return globalForDb.__radarDb;
}

async function connect(): Promise<Db> {
  // Neon's Vercel integration sets DATABASE_URL; older Vercel Postgres projects set POSTGRES_URL.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle({ client: neon(url), schema }) as unknown as Db;
  }

  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. Add a Neon database to this project in Vercel (Storage tab), then redeploy.");
  }

  // Local development: an embedded Postgres stored on disk, migrated on first use.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const db = drizzle({ client: new PGlite(dir), schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export { schema };
