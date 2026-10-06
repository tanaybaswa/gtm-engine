import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { runs } from "@/db/schema";
import { config } from "@/lib/config";
import { getConsoleData, getTopicSummaries, toRunDTO } from "@/lib/console/data";
import { neonRegion } from "@/lib/url";

export const dynamic = "force-dynamic";

// Public, for uptime checks: is the database reachable and how far away, can the console's
// data be read, and how did the last scheduled run go. Only timings and statuses leave this
// endpoint: no hosts, topic names or content.
export async function GET() {
  const started = Date.now();
  const region = process.env.VERCEL_REGION ?? null;
  const dbRegion = neonRegion(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const headers = { "cache-control": "no-store" };

  let db;
  try {
    db = await getDb();
  } catch (error) {
    console.error("Health check: database connection failed:", error);
    return Response.json({ ok: false, region, db: { region: dbRegion, error: "database unreachable" } }, { status: 503, headers });
  }

  let database;
  try {
    const first = Date.now();
    await db.execute(sql`select 1`);
    const firstQueryMs = Date.now() - first;
    const second = Date.now();
    await db.execute(sql`select 1`);
    database = { ok: true, region: dbRegion, firstQueryMs, warmQueryMs: Date.now() - second };
  } catch (error) {
    console.error("Health check: database query failed:", error);
    database = { ok: false, region: dbRegion, error: "database unreachable" };
  }

  // The same cached reads the signed-in console makes on its first screen.
  let consoleData;
  try {
    const t = Date.now();
    const summaries = await getTopicSummaries();
    const topic = summaries.topics.find((x) => x.active) ?? summaries.topics[0];
    const data = topic ? await getConsoleData(topic.id) : null;
    consoleData = { ok: Boolean(data), ms: Date.now() - t, topics: summaries.topics.length };
  } catch (error) {
    console.error("Health check: console data failed:", error);
    consoleData = { ok: false, error: "console data unavailable" };
  }

  let lastScheduledRun = null;
  let lastCollection = null;
  try {
    const [run] = await db.select().from(runs).where(eq(runs.trigger, "cron")).orderBy(desc(runs.startedAt)).limit(1);
    if (run) {
      const dto = toRunDTO(run);
      lastScheduledRun = { stage: dto.stage, status: dto.status, startedAt: dto.startedAt, finishedAt: dto.finishedAt };
    }
    // How each source did in the latest collection: "ok", "off" or "error", and how much it found.
    const [collect] = await db
      .select()
      .from(runs)
      .where(sql`${runs.stats}->'connectors' is not null`)
      .orderBy(desc(runs.startedAt))
      .limit(1);
    if (collect) {
      const dto = toRunDTO(collect);
      lastCollection = {
        startedAt: dto.startedAt,
        sources: Object.fromEntries(
          Object.entries(dto.connectors ?? {}).map(([id, stat]) => [
            id,
            { status: stat.skipped ? "off" : stat.error ? "error" : "ok", found: stat.fetched, new: stat.inserted },
          ]),
        ),
      };
    }
  } catch (error) {
    console.error("Health check: run lookup failed:", error);
  }

  // Which optional services are switched on (never their keys).
  const services = {
    claude: config.aiEnabled(),
    serper: Boolean(config.serperApiKey()),
    youtube: Boolean(config.youtubeApiKey()),
    x: Boolean(config.xBearerToken()),
  };

  const ok = database.ok && consoleData.ok;
  return Response.json(
    { ok, region, db: database, console: consoleData, services, lastScheduledRun, lastCollection, totalMs: Date.now() - started },
    { status: ok ? 200 : 503, headers },
  );
}
