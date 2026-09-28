import type { RunStage, RunStats, Topic } from "@/db/schema";
import { config } from "@/lib/config";
import { writeBrief } from "./brief";
import { collectTopic } from "./collect";
import { enrichTopic } from "./enrich";
import { Deadline, finishRun, startRun, type Trigger } from "./runs";

export type StageOptions = { budgetSeconds?: number; log?: (message: string) => void };

/**
 * Runs one stage (or all of them) for a topic and records it in the runs table.
 * Each stage is safe to repeat: collection dedupes and enrichment only picks up new items.
 */
export async function runStage(topic: Topic, stage: RunStage, trigger: Trigger, options: StageOptions = {}): Promise<RunStats> {
  const deadline = new Deadline(options.budgetSeconds ?? config.runBudgetSeconds);
  const log = options.log ?? (() => {});
  const run = await startRun(topic.id, stage, trigger);
  const stats: RunStats = { notes: [] };
  let status: "ok" | "partial" | "error" = "ok";

  try {
    if (stage === "collect" || stage === "full") {
      const collected = await collectTopic(topic, deadline, log);
      stats.connectors = collected.connectors;
      stats.prefiltered = collected.prefiltered;
      stats.notes!.push(...collected.notes, `${collected.inserted} new items stored`);
      if (Object.values(collected.connectors).some((c) => c.error)) status = "partial";
    }
    if ((stage === "enrich" || stage === "full" || stage === "brief") && !deadline.near(30_000)) {
      const enriched = await enrichTopic(topic, deadline, log);
      Object.assign(stats, { triaged: enriched.triaged, relevant: enriched.relevant, extracted: enriched.extracted });
      if (enriched.skipped) stats.aiSkipped = enriched.skipped;
      stats.notes!.push(...enriched.notes);
    }
    if ((stage === "brief" || stage === "full") && !stats.aiSkipped && !deadline.near(25_000)) {
      const brief = await writeBrief(topic, log);
      stats.stories = brief.stories;
      stats.notes!.push(...brief.notes);
    }
    if (deadline.near(5_000)) {
      status = "partial";
      stats.notes!.push("Stopped early to stay inside the time limit; the next run picks up the rest.");
    }
    await finishRun(run.id, status, stats);
    return stats;
  } catch (error) {
    const message = (error as Error).message;
    await finishRun(run.id, "error", stats, message);
    throw error;
  }
}
