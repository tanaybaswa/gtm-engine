import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { runs, type Run, type RunProgress, type RunStage, type RunStats } from "@/db/schema";

export type Trigger = "cron" | "manual" | "cli";

export type ProgressUpdate = Omit<RunProgress, "at">;

export async function startRun(topicId: number, stage: RunStage, trigger: Trigger): Promise<Run> {
  const db = await getDb();
  const [run] = await db.insert(runs).values({ topicId, stage, trigger, status: "running" }).returning();
  return run;
}

export async function finishRun(
  runId: number,
  status: "ok" | "partial" | "error",
  stats: RunStats,
  error?: string,
): Promise<void> {
  const db = await getDb();
  await db
    .update(runs)
    .set({ status, stats, error: error ?? null, finishedAt: new Date() })
    .where(eq(runs.id, runId));
}

/** Stores where a run is, so the console can show it live. */
export async function saveRunProgress(runId: number, progress: RunProgress): Promise<void> {
  const db = await getDb();
  await db.update(runs).set({ stats: { progress } }).where(eq(runs.id, runId));
}

export async function recentRuns(topicId: number, limit = 15): Promise<Run[]> {
  const db = await getDb();
  return db.select().from(runs).where(eq(runs.topicId, topicId)).orderBy(desc(runs.startedAt)).limit(limit);
}

/** A run left "running" for more than 10 minutes was cut off by the platform. */
export async function activeRun(topicId: number): Promise<Run | undefined> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.topicId, topicId), eq(runs.status, "running")))
    .orderBy(desc(runs.startedAt))
    .limit(1);
  const run = rows[0];
  if (run && Date.now() - run.startedAt.getTime() > 10 * 60_000) return undefined;
  return run;
}

export class Deadline {
  private readonly endsAt: number;
  constructor(seconds: number) {
    this.endsAt = Date.now() + seconds * 1000;
  }
  get remainingMs(): number {
    return Math.max(0, this.endsAt - Date.now());
  }
  /** True when there's less than `ms` left. */
  near(ms = 20_000): boolean {
    return this.remainingMs < ms;
  }
}
