import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// This month's spend, in dollars, as the usage table would report it.
const { usage, parse } = vi.hoisted(() => ({ usage: { spent: 0 }, parse: vi.fn() }));
vi.mock("@/lib/usage", () => ({
  getUsage: vi.fn(async () => usage.spent * 1_000_000),
  addUsage: vi.fn(async () => {}),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { parse } };
  },
}));
vi.mock("@anthropic-ai/sdk/helpers/beta/zod", () => ({ betaZodOutputFormat: () => ({ type: "json_schema" }) }));

const { AiBudgetError, AiUnavailableError, assertAiAvailable, structuredCall } = await import("./client");
const { config } = await import("@/lib/config");
const { addUsage } = await import("@/lib/usage");

const call = () => structuredCall({ system: "s", prompt: "p", schema: z.object({ ok: z.boolean() }), effort: "low" });

describe("Claude's monthly budget", () => {
  const cap = config.aiMonthlyBudgetUsd;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    config.aiMonthlyBudgetUsd = 60;
    parse.mockResolvedValue({
      model: "claude-opus-5",
      stop_reason: "end_turn",
      usage: { input_tokens: 1000, output_tokens: 100 },
      parsed_output: { ok: true },
    });
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    config.aiMonthlyBudgetUsd = cap;
  });

  it.skipIf(Boolean(process.env.RADAR_AI_MONTHLY_BUDGET_USD))("is $60 by default", () => {
    expect(cap).toBe(60);
  });

  it("lets new work start under the cap, and refuses it once the month reaches the cap", async () => {
    usage.spent = 59.99;
    await expect(assertAiAvailable()).resolves.toBeUndefined();
    usage.spent = 60.4;
    await expect(assertAiAvailable()).rejects.toThrow(AiBudgetError);
    await expect(assertAiAvailable()).rejects.toThrow("this month's Claude budget of $60 is used up ($60.40 spent)");
  });

  it("has no cap at 0", async () => {
    config.aiMonthlyBudgetUsd = 0;
    usage.spent = 500;
    await expect(assertAiAvailable()).resolves.toBeUndefined();
  });

  it("doesn't stop a call once the month goes over, so a run under way finishes", async () => {
    usage.spent = 75;
    await expect(call()).resolves.toEqual({ ok: true });
    // 1,000 input tokens at $5 and 100 output tokens at $25 per million.
    expect(addUsage).toHaveBeenCalledWith("ai_cost_microusd", 7500);
  });

  it("needs a key for both", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(assertAiAvailable()).rejects.toThrow(AiUnavailableError);
    await expect(call()).rejects.toThrow(AiUnavailableError);
  });
});
