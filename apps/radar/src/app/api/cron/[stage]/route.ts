import { runStage } from "@/lib/pipeline";
import { config } from "@/lib/config";
import { listTopics } from "@/lib/topics/store";

// Vercel's free plan allows up to 300 seconds per function call.
export const maxDuration = 300;

const STAGES = ["collect", "enrich", "brief"] as const;

// Called by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request, ctx: RouteContext<"/api/cron/[stage]">) {
  const secret = config.cronSecret();
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { stage } = await ctx.params;
  if (!STAGES.includes(stage as (typeof STAGES)[number])) {
    return Response.json({ error: `unknown stage "${stage}"` }, { status: 404 });
  }

  const active = (await listTopics()).filter((t) => t.active);
  const budgetSeconds = Math.max(60, Math.floor(config.runBudgetSeconds / Math.max(1, active.length)));
  const results: Record<string, unknown> = {};
  for (const topic of active) {
    try {
      results[topic.slug] = await runStage(topic, stage as (typeof STAGES)[number], "cron", { budgetSeconds });
    } catch (error) {
      results[topic.slug] = { error: (error as Error).message };
    }
  }
  return Response.json({ ok: true, stage, results });
}
