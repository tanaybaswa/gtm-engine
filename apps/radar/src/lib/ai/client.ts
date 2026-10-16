import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { config } from "@/lib/config";
import { addUsage, getUsage } from "@/lib/usage";

// Dollars per million tokens (input, output). Cache writes cost 1.25x input, reads 0.1x.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-fable-5-1": [10, 50],
};

export class AiUnavailableError extends Error {}
export class AiBudgetError extends Error {}
export class AiRefusalError extends Error {}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

// Haiku 4.5 rejects the effort setting; the Opus 5 family and Fable run safety
// classifiers, so they get server-side refusal fallbacks.
const supportsEffort = (model: string) => !/haiku-4-5|sonnet-4-5/.test(model);
const supportsFallbacks = (model: string) => /^claude-(opus-5|fable-5)/.test(model);

export async function aiSpentThisMonthUsd(): Promise<number> {
  return (await getUsage("ai_cost_microusd")) / 1_000_000;
}

function assertAiConfigured(): void {
  if (!config.aiEnabled()) throw new AiUnavailableError("add ANTHROPIC_API_KEY to turn on AI enrichment");
}

/**
 * Whether new Claude work may start: a key is set and this month's spend is under the cap
 * (a cap of 0 means none). Runs and topic setup check this once, when they start, so work
 * that starts under the cap finishes even if it goes over on the way.
 */
export async function assertAiAvailable(): Promise<void> {
  assertAiConfigured();
  const cap = config.aiMonthlyBudgetUsd;
  if (!cap) return;
  const spent = await aiSpentThisMonthUsd();
  if (spent >= cap) {
    throw new AiBudgetError(
      `this month's Claude budget of $${cap} is used up ($${spent.toFixed(2)} spent). Claude resumes next month, or raise RADAR_AI_MONTHLY_BUDGET_USD in Vercel (0 means no cap)`,
    );
  }
}

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

async function recordUsage(model: string, usage: Usage): Promise<void> {
  const [inPrice, outPrice] = PRICES[model] ?? PRICES["claude-opus-5"];
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const dollars =
    (usage.input_tokens * inPrice + cacheWrite * inPrice * 1.25 + cacheRead * inPrice * 0.1 + usage.output_tokens * outPrice) /
    1_000_000;
  await addUsage("ai_cost_microusd", dollars * 1_000_000);
  await addUsage("ai_input_tokens", usage.input_tokens + cacheWrite + cacheRead);
  await addUsage("ai_output_tokens", usage.output_tokens);
}

/**
 * One structured Claude call: a cached system prompt, a user prompt, and a Zod schema the
 * reply must match. Records the spend afterwards. The monthly cap isn't checked here, so a
 * run that started under it isn't cut off halfway; callers check assertAiAvailable first.
 */
export async function structuredCall<S extends z.ZodType>(args: {
  system: string;
  prompt: string;
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  assertAiConfigured();
  const model = config.model;
  const response = await getClient().beta.messages.parse({
    model,
    max_tokens: args.maxTokens ?? 16_000,
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: args.prompt }],
    output_config: {
      format: betaZodOutputFormat(args.schema),
      ...(supportsEffort(model) ? { effort: args.effort } : {}),
    },
    ...(supportsFallbacks(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  await recordUsage(response.model ?? model, response.usage);

  if (response.stop_reason === "refusal") {
    const detail = response.stop_details?.explanation ?? response.stop_details?.category ?? "no detail";
    throw new AiRefusalError(`Claude declined this request (${detail})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude's reply was cut off by max_tokens");
  }
  if (!response.parsed_output) throw new Error("Claude's reply did not match the expected format");
  return response.parsed_output as z.infer<S>;
}
