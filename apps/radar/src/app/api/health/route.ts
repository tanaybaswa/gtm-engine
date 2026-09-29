import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/** "ep-name-123.us-east-2.aws.neon.tech" -> "aws-us-east-2". The host itself stays private. */
function databaseRegion(): string | null {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  try {
    const parts = new URL(url).hostname.split(".");
    return parts.length >= 4 ? `${parts[2]}-${parts[1]}` : null;
  } catch {
    return null;
  }
}

// Public and cheap: is the database reachable, how far away is it, and where does this run.
export async function GET() {
  const started = Date.now();
  const region = process.env.VERCEL_REGION ?? null;
  try {
    const db = await getDb();
    const first = Date.now();
    await db.execute(sql`select 1`);
    const firstMs = Date.now() - first;
    const second = Date.now();
    await db.execute(sql`select 1`);
    const warmMs = Date.now() - second;
    return Response.json(
      { ok: true, region, db: { region: databaseRegion(), firstQueryMs: firstMs, warmQueryMs: warmMs }, totalMs: Date.now() - started },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // Details stay in the logs; this endpoint is public.
    console.error("Health check failed:", error);
    return Response.json(
      { ok: false, region, db: { region: databaseRegion(), error: "database unreachable" } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
