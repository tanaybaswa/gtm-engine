import type { RunStage, RunStats, Topic } from "@/db/schema";
import { config } from "@/lib/config";
import { markChanged } from "@/lib/console/changes";
import { writeBrief } from "./brief";
import { collectTopic } from "./collect";
import { enrichTopic } from "./enrich";
import { Deadline, finishRun, saveRunProgress, startRun, type ProgressUpdate, type Trigger } from "./runs";

export type StageOptions = { budgetSeconds?: number; log?: (message: string) => void };

/** Saves progress at most every 1.5 seconds, and at once when the phase changes. Never throws. */
function progressReporter(runId: number) {
  let lastAt = 0;
  let lastPhase = "";
  let chain: Promise<void> = Promise.resolve();
  return {
    update(update: ProgressUpdate) {
      const now = Date.now();
      if (update.phase === lastPhase && now - lastAt < 1500) return;
      lastAt = now;
      lastPhase = update.phase;
      const progress = { ...update, at: new Date(now).toISOString() };
      chain = chain.then(() => saveRunProgress(runId, progress)).catch(() => {});
    },
    /** Waits for queued writes, so they can't land on top of the final stats. */
    flush: () => chain,
  };
}

/** Tells open consoles to refetch. A failure here must not fail the run. */
async function announce(): Promise<void> {
  try {
    await markChanged();
  } catch (error) {
    console.error("Could not record the data change:", error);
  }
}

/**
 * Runs one stage (or all of them) for a topic and records it in the runs table.
 * Each stage is safe to repeat: collection dedupes and enrichment only picks up new items.
 */
export async function runStage(topic: Topic, stage: RunStage, trigger: Trigger, options: StageOptions = {}): Promise<RunStats> {
  const deadline = new Deadline(options.budgetSeconds ?? config.runBudgetSeconds);
  const log = options.log ?? (() => {});
  const run = await startRun(topic.id, stage, trigger);
  const progress = progressReporter(run.id);
  const stats: RunStats = { notes: [] };
  let status: "ok" | "partial" | "error" = "ok";

  try {
    if (stage === "collect" || stage === "full") {
      progress.update({ phase: "collect", done: 0 });
      const collected = await collectTopic(topic, deadline, log, progress.update);
      stats.connectors = collected.connectors;
      stats.prefiltered = collected.prefiltered;
      stats.notes!.push(...collected.notes, `${collected.inserted} new items stored`);
      if (Object.values(collected.connectors).some((c) => c.error)) status = "partial";
      if (collected.inserted) await announce();
    }
    if ((stage === "enrich" || stage === "full" || stage === "brief") && !deadline.near(30_000)) {
      progress.update({ phase: "score", done: 0 });
      const enriched = await enrichTopic(topic, deadline, log, progress.update);
      Object.assign(stats, { triaged: enriched.triaged, relevant: enriched.relevant, extracted: enriched.extracted });
      if (enriched.skipped) stats.aiSkipped = enriched.skipped;
      stats.notes!.push(...enriched.notes);
      if (enriched.triaged || enriched.extracted) await announce();
    }
    if ((stage === "brief" || stage === "full") && !stats.aiSkipped && !deadline.near(25_000)) {
      progress.update({ phase: "brief" });
      const brief = await writeBrief(topic, log);
      stats.stories = brief.stories;
      stats.notes!.push(...brief.notes);
    }
    if (deadline.near(5_000)) {
      status = "partial";
      stats.notes!.push("Stopped early to stay inside the time limit; the next run picks up the rest.");
    }
    await progress.flush();
    await finishRun(run.id, status, stats);
    await announce();
    return stats;
  } catch (error) {
    const message = (error as Error).message;
    await progress.flush();
    await finishRun(run.id, "error", stats, message);
    await announce();
    throw error;
  }
}
