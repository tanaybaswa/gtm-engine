import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The real Claude client runs, with real spend tracking, against a stand-in for the API. Every
// call costs $0.80 (100,000 input tokens at $5 and 12,000 output tokens at $25 per million),
// scores each item 60 (under the full-read floor), and answers the brief with one story.
const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { parse } };
  },
}));
vi.mock("@anthropic-ai/sdk/helpers/beta/zod", () => ({ betaZodOutputFormat: () => ({ type: "json_schema" }) }));
// The client's own functions run as written; wrapping them only counts the calls.
vi.mock("@/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/client")>();
  return { ...actual, assertAiAvailable: vi.fn(actual.assertAiAvailable), structuredCall: vi.fn(actual.structuredCall) };
});
// Collection is free and has its own tests; here it only needs to happen or not.
vi.mock("./collect", () => ({ collectTopic: vi.fn(async () => ({ connectors: {}, prefiltered: 0, inserted: 0, notes: [] })) }));
vi.mock("./linkedin-people", () => ({ findLinkedInPeople: vi.fn(async () => ({ stat: { fetched: 0, inserted: 0, ms: 0 }, notes: [], changed: false })) }));
vi.mock("./youtube-refresh", () => ({ refreshYouTube: vi.fn(async () => ({ refreshed: 0, removed: 0 })) }));

function reply(prompt: string) {
  const ids = [...prompt.matchAll(/^\{"id":(\d+),/gm)].map((m) => Number(m[1]));
  if (prompt.startsWith("Score each")) {
    return { items: ids.map((id) => ({ id, relevance: 60, category: "other", isOrigin: false, originHint: null, gist: "On topic.", people: [], orgs: [] })) };
  }
  return { stories: [{ title: "A story", summary: "S.", whyItMatters: "W.", originItemId: null, itemIds: ids.slice(0, 1), people: [], orgs: [] }] };
}

let dir: string;
let cap: number;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "radar-budget-test-"));
  process.env.PGLITE_DIR = dir;
  process.env.ANTHROPIC_API_KEY = "test-key";
  (globalThis as { __radarDb?: unknown }).__radarDb = undefined;
  const { config } = await import("@/lib/config");
  cap = config.aiMonthlyBudgetUsd;
  config.aiMonthlyBudgetUsd = 1;
  parse.mockImplementation(async (args: { messages: { content: string }[] }) => ({
    model: "claude-opus-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 100_000, output_tokens: 12_000 },
    parsed_output: reply(args.messages[0].content),
  }));
});

afterAll(async () => {
  const { config } = await import("@/lib/config");
  config.aiMonthlyBudgetUsd = cap;
  delete process.env.ANTHROPIC_API_KEY;
  rmSync(dir, { recursive: true, force: true });
});

async function addItems(count: number, from = 0) {
  const { getDb } = await import("@/db");
  const { items } = await import("@/db/schema");
  const { getDefaultTopic } = await import("@/lib/topics/store");
  const topic = (await getDefaultTopic())!;
  const db = await getDb();
  const rows = await db
    .insert(items)
    .values(
      Array.from({ length: count }, (_, i) => ({
        topicId: topic.id,
        source: "rss",
        url: `https://example.com/ai-liability-${from + i}`,
        canonicalUrl: `https://example.com/ai-liability-${from + i}`,
        titleKey: `ai liability story ${from + i}`,
        title: `AI liability story ${from + i}`,
        sourceKey: "example.com",
        publishedAt: new Date(),
      })),
    )
    .returning({ id: items.id });
  const status = async () => (await db.select().from(items)).filter((r) => rows.some((x) => x.id === r.id)).map((r) => r.status);
  return { topic, status };
}

describe("Claude's monthly budget in a run ($1 cap, $0.80 a call)", () => {
  beforeEach(async () => {
    const client = await import("@/lib/ai/client");
    vi.mocked(client.assertAiAvailable).mockClear();
    parse.mockClear();
  });

  it("checks the cap once, as the run starts, so a run that goes over on the way finishes", async () => {
    const client = await import("@/lib/ai/client");
    const { runStage } = await import("./index");
    // 25 items: two triage batches of 20 and 5, then the brief.
    const { topic, status } = await addItems(25);

    const stats = await runStage(topic, "brief", "cli", { budgetSeconds: 120 });
    expect(client.assertAiAvailable).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(3);
    expect(stats.aiSkipped).toBeUndefined();
    expect(stats.triaged).toBe(25);
    expect(stats.stories).toBe(1);
    expect(new Set(await status())).toEqual(new Set(["triaged"]));
    expect(await client.aiSpentThisMonthUsd()).toBeCloseTo(2.4);
  });

  it("skips Claude in a run that starts over the cap, and leaves its items for a later run", async () => {
    const { runStage } = await import("./index");
    const { topic, status } = await addItems(3, 100);

    const stats = await runStage(topic, "brief", "cli", { budgetSeconds: 120 });
    expect(stats.aiSkipped).toMatch(/^this month's Claude budget of \$1 is used up \(\$2\.40 spent\)/);
    expect(stats.triaged).toBeUndefined();
    expect(stats.stories).toBeUndefined();
    expect(parse).not.toHaveBeenCalled();
    expect(await status()).toEqual(["new", "new", "new"]);
  });

  it("still collects in a run that starts over the cap, and doesn't check the cap to collect", async () => {
    const client = await import("@/lib/ai/client");
    const { collectTopic } = await import("./collect");
    const { getDefaultTopic } = await import("@/lib/topics/store");
    const { runStage } = await import("./index");
    const topic = (await getDefaultTopic())!;

    await runStage(topic, "collect", "cli", { budgetSeconds: 120 });
    expect(client.assertAiAvailable).not.toHaveBeenCalled();
    expect(collectTopic).toHaveBeenCalledTimes(1);

    const stats = await runStage(topic, "full", "cli", { budgetSeconds: 120 });
    expect(collectTopic).toHaveBeenCalledTimes(2);
    expect(stats.aiSkipped).toMatch(/budget of \$1 is used up/);
    expect(parse).not.toHaveBeenCalled();
  });
});
