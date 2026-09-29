import { runStage } from "@/lib/pipeline";
import { config } from "@/lib/config";
import { listTopics } from "@/lib/topics/store";

// Vercel's free plan allows up to 300 seconds per function call.
export const maxDuration = 300;

const STAGES = ["collect", "enrich", "brief"] as const;
// Stop starting topics when less than this is left; they run first next time.
const MIN_TOPIC_SECONDS = 45;

// Called by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request, ctx: RouteContext<"/api/cron/[stage]">) {
  const startedAt = Date.now();
  const secret = config.cronSecret();
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { stage } = await ctx.params;
  if (!STAGES.includes(stage as (typeof STAGES)[number])) {
    return Response.json({ error: `unknown stage "${stage}"` }, { status: 404 });
  }

  // Rotate the order each day, so no topic is always the one left for last.
  const active = (await listTopics()).filter((t) => t.active);
  const day = Math.floor(Date.now() / 86_400_000);
  const ordered = active.map((_, i) => active[(i + day) % active.length]);
  const results: Record<string, unknown> = {};
  for (const [index, topic] of ordered.entries()) {
    const left = config.runBudgetSeconds - (Date.now() - startedAt) / 1000;
    if (left < MIN_TOPIC_SECONDS) {
      results[topic.slug] = { skipped: "out of time for this call" };
      continue;
    }
    // Share what's left among the topics still to run.
    const budgetSeconds = Math.max(MIN_TOPIC_SECONDS, Math.floor(left / (ordered.length - index)));
    try {
      results[topic.slug] = await runStage(topic, stage as (typeof STAGES)[number], "cron", { budgetSeconds });
    } catch (error) {
      results[topic.slug] = { error: (error as Error).message };
    }
  }
  return Response.json({ ok: true, stage, results });
}
