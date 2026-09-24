import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Claude is replaced with canned replies so the whole enrich-and-brief path runs without a key.
const replies: unknown[] = [];
vi.mock("@/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/client")>();
  return {
    ...actual,
    assertAiAvailable: vi.fn(async () => {}),
    structuredCall: vi.fn(async () => {
      if (!replies.length) throw new Error("no canned reply left");
      return replies.shift();
    }),
  };
});
// Article pages are not fetched in tests.
vi.mock("./article", () => ({ fetchArticle: vi.fn(async () => null), decodeGoogleNewsUrl: vi.fn(async () => null) }));

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "radar-test-"));
  process.env.PGLITE_DIR = dir;
  (globalThis as { __radarDb?: unknown }).__radarDb = undefined;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("enrich and brief", () => {
  it("scores items, saves people and organizations, credits origin sources, and writes the brief", async () => {
    const { getDb } = await import("@/db");
    const { items, people, orgs, personMentions, sources, stories } = await import("@/db/schema");
    const { getDefaultTopic } = await import("@/lib/topics/store");
    const { runStage } = await import("./index");

    const topic = (await getDefaultTopic())!;
    const db = await getDb();
    await db.insert(sources).values([
      { key: "beazley.com", name: "Beazley", kind: "company", itemCount: 1 },
      { key: "cityam.com", name: "City AM", itemCount: 1 },
    ]);
    const inserted = await db
      .insert(items)
      .values([
        {
          topicId: topic.id,
          source: "rss",
          url: "https://www.beazley.com/news/ai-endorsements",
          canonicalUrl: "https://beazley.com/news/ai-endorsements",
          titleKey: "beazley launches ai endorsements",
          title: "Beazley launches AI endorsements",
          sourceKey: "beazley.com",
          publishedAt: new Date(),
          resolvedUrl: "https://www.beazley.com/news/ai-endorsements",
        },
        {
          topicId: topic.id,
          source: "google_news",
          url: "https://news.google.com/rss/articles/CBMi1",
          canonicalUrl: "https://news.google.com/rss/articles/CBMi1",
          titleKey: "beazley expands cyber cover for ai",
          title: "Beazley expands cyber cover for AI",
          outlet: "City AM",
          sourceKey: "cityam.com",
          publishedAt: new Date(),
        },
        {
          topicId: topic.id,
          source: "hacker_news",
          url: "https://news.ycombinator.com/item?id=1",
          canonicalUrl: "https://news.ycombinator.com/item?id=1",
          titleKey: "comment on grocery pricing",
          title: 'Comment on "grocery pricing"',
          sourceKey: "news.ycombinator.com",
        },
      ])
      .returning({ id: items.id });
    const [originId, echoId, noiseId] = inserted.map((r) => r.id);

    replies.push(
      {
        items: [
          {
            id: originId,
            relevance: 92,
            category: "product_launch",
            isOrigin: true,
            originHint: null,
            gist: "Beazley added endorsements that cover internal AI use.",
            people: [{ name: "Jane Smith", role: "Head of Cyber", org: "Beazley", relation: "quoted" }],
            orgs: [{ name: "Beazley plc", kind: "carrier", relation: "subject" }],
          },
          {
            id: echoId,
            relevance: 80,
            category: "product_launch",
            isOrigin: false,
            originHint: "Beazley press release, Sep 2026",
            gist: "City AM reports on the Beazley launch.",
            people: [{ name: "Jane Smith", role: null, org: null, relation: "quoted" }],
            orgs: [{ name: "Beazley", kind: "carrier", relation: "subject" }],
          },
          { id: noiseId, relevance: 5, category: "other", isOrigin: false, originHint: null, gist: "Off topic.", people: [], orgs: [] },
        ],
      },
      {
        stories: [
          {
            title: "Beazley adds cover for internal AI use",
            summary: "Beazley launched cyber endorsements for AI.",
            whyItMatters: "Affirmative AI cover is arriving in cyber.",
            originItemId: originId,
            itemIds: [echoId, 99999],
            people: ["Jane Smith"],
            orgs: ["Beazley"],
          },
        ],
      },
    );

    const stats = await runStage(topic, "brief", "cli", { budgetSeconds: 120 });
    expect(stats.triaged).toBe(3);
    expect(stats.relevant).toBe(2);
    expect(stats.stories).toBe(1);

    const [jane] = await db.select().from(people);
    expect(jane.name).toBe("Jane Smith");
    expect(jane.role).toBe("Head of Cyber");
    expect(jane.mentionCount).toBe(2);
    expect(await db.select().from(personMentions)).toHaveLength(2);

    const orgRows = await db.select().from(orgs);
    expect(orgRows).toHaveLength(1); // "Beazley plc" and "Beazley" are the same organization
    expect(orgRows[0].mentionCount).toBe(2);

    const sourceRows = Object.fromEntries((await db.select().from(sources)).map((s) => [s.key, s]));
    expect(sourceRows["beazley.com"].originCount).toBe(1);
    expect(sourceRows["cityam.com"].relevantCount).toBe(1);
    expect(sourceRows["cityam.com"].originCount).toBe(0);

    const [story] = await db.select().from(stories);
    expect(story.originItemId).toBe(originId);
    expect(story.itemIds).toEqual([originId, echoId]); // unknown ids dropped, origin first

    const noise = (await db.select().from(items)).find((i) => i.id === noiseId)!;
    expect(noise.relevance).toBe(5);
    expect(noise.status).toBe("triaged");
  });
});

describe("prompts", () => {
  it("never contain em dashes", async () => {
    const { analystSystemPrompt, briefPrompt, extractPrompt, triagePrompt } = await import("@/lib/ai/prompts");
    const { aiLiabilityInsurance } = await import("@/lib/topics/defaults");
    const topic = { id: 1, ...aiLiabilityInsurance, active: true, createdAt: new Date(), updatedAt: new Date() };
    const text = [
      analystSystemPrompt(topic),
      triagePrompt([]),
      briefPrompt("2026-09-24", []),
      extractPrompt({ title: "t", outlet: null, url: "https://x.com", publishedAt: null, text: "body", truncated: false, links: [] }),
    ].join("\n");
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false); // no em dashes
  });
});
