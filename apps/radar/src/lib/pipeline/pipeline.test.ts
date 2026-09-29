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
  const ids = { origin: 0, echo: 0 };

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
    Object.assign(ids, { origin: originId, echo: echoId });

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

  it("leads a story with the item judged to be the origin when Claude names none", async () => {
    const { getDb } = await import("@/db");
    const { stories } = await import("@/db/schema");
    const { getDefaultTopic } = await import("@/lib/topics/store");
    const { writeBrief } = await import("./brief");
    replies.push({
      stories: [
        {
          title: "Beazley adds cover for internal AI use",
          summary: "Beazley launched cyber endorsements for AI.",
          whyItMatters: "Affirmative AI cover is arriving in cyber.",
          originItemId: null,
          itemIds: [ids.echo, ids.origin],
          people: [],
          orgs: [],
        },
      ],
    });
    await writeBrief((await getDefaultTopic())!, () => {});
    const [story] = await (await getDb()).select().from(stories);
    expect(story.originItemId).toBe(ids.origin);
    expect(story.itemIds).toEqual([ids.origin, ids.echo]);
    expect(story.peopleNames).toEqual([]); // only whom Claude picked
  });
});

describe("console data", () => {
  it("packs a topic into one payload: streams, voices, stories, follow state and totals", async () => {
    const { getDefaultTopic } = await import("@/lib/topics/store");
    const { freshConsoleData } = await import("@/lib/console/data");
    const topic = (await getDefaultTopic())!;
    const data = (await freshConsoleData(topic.id))!;

    const byTitle = Object.fromEntries(data.items.map((i) => [i.title, i]));
    expect(byTitle["Beazley launches AI endorsements"].stream).toBe("companies"); // a company's own site
    expect(byTitle["Beazley expands cyber cover for AI"].stream).toBe("news");
    expect(byTitle['Comment on "grocery pricing"'].stream).toBe("social");
    expect(byTitle["Beazley launches AI endorsements"].people).toEqual([{ id: expect.any(Number), name: "Jane Smith", relation: "quoted" }]);

    const jane = data.people.find((p) => p.name === "Jane Smith")!;
    expect(jane.voice).toBe(true);
    expect(jane.relations).toEqual({ quoted: 2 });
    expect(jane.recent).toHaveLength(2);

    expect(data.stories).toHaveLength(1);
    expect(data.briefDates).toHaveLength(1);
    expect(data.totals).toMatchObject({ items: 3, scored: 3, relevant: 2, origins: 1 });
    expect(data.orgs[0]).toMatchObject({ mentions: 2 });

    const beazley = data.sources.find((s) => s.key === "beazley.com")!;
    expect(beazley).toMatchObject({ items: 1, relevant: 1, origins: 1, followable: true, followed: false });

    // Finished runs keep their final stats, not the live progress.
    expect(data.runs[0].status).toBe("ok");
    expect(data.runs[0].progress).toBeNull();
    expect(data.daily).toHaveLength(14);
    // Plain JSON: it goes through Next's data cache and the network unchanged.
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it("summarizes every topic for the rail and reports live status", async () => {
    const { freshTopicSummaries, liveStatus } = await import("@/lib/console/data");
    const summaries = await freshTopicSummaries();
    expect(summaries.topics[0]).toMatchObject({ slug: "ai-liability-insurance", items: 3, active: true });
    expect(summaries.topics[0].spark).toHaveLength(14);
    const status = await liveStatus();
    expect(status.running).toEqual([]);
    expect(status.changedAt).not.toBeNull(); // runs announce each finished stage
  });
});

describe("serper searches", () => {
  it("retries a refused search in a simpler form, and counts only searches that ran", async () => {
    const { serperSearch } = await import("@/lib/sources/serper-client");
    const { getUsage } = await import("@/lib/usage");
    const saved = process.env.SERPER_API_KEY;
    process.env.SERPER_API_KEY = "test-key";
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        return bodies.length < 3
          ? new Response(JSON.stringify({ message: "Query pattern not allowed for free accounts.", statusCode: 400 }), { status: 400 })
          : new Response(JSON.stringify({ organic: [] }), { status: 200 });
      }),
    );
    try {
      const before = await getUsage("serper_queries");
      const result = await serperSearch("search", 'site:linkedin.com/posts "AI liability" insurance', { tbs: "qdr:w" });
      expect(result?.ranAs).toBe('site:linkedin.com/posts "AI liability"');
      expect(bodies.map((b) => JSON.parse(b))).toMatchObject([
        { q: 'site:linkedin.com/posts "AI liability" insurance', tbs: "qdr:w", num: 10 },
        { q: 'site:linkedin.com/posts "AI liability" insurance', num: 10 },
        { q: 'site:linkedin.com/posts "AI liability"', num: 10 },
      ]);
      expect(await getUsage("serper_queries")).toBe(before + 1);
    } finally {
      vi.unstubAllGlobals();
      if (saved === undefined) delete process.env.SERPER_API_KEY;
      else process.env.SERPER_API_KEY = saved;
    }
  });
});

describe("serper pacing", () => {
  it("runs searches once a day while the cap allows, and spreads them out when it doesn't", async () => {
    const { searchPace } = await import("@/lib/sources/serper-client");
    const oct1 = Date.UTC(2026, 9, 1);
    // One topic, about 13 searches a day, 500 left for October's 31 days: once a day.
    expect(searchPace(13, 500, oct1)).toBe(1);
    // Four topics: about 52 a day against 16 a day left, so each search waits about 3.2 days.
    expect(searchPace(52, 500, oct1)).toBeCloseTo(3.22, 1);
    // Late in the month with spare searches, back to once a day.
    expect(searchPace(52, 300, Date.UTC(2026, 9, 28))).toBe(1);
    // On the last day, what's left is today's allowance; when nothing is left, the cap error says so.
    expect(searchPace(52, 26, Date.UTC(2026, 9, 31, 20))).toBe(2);
    expect(searchPace(52, 0, oct1)).toBe(1);
  });

  it("keeps each search's latest result under its own key, and doesn't repeat a search the same day", async () => {
    const { serper } = await import("@/lib/sources/serper");
    const { searchResults } = await import("@/lib/sources/serper-client");
    const { getDefaultTopic } = await import("@/lib/topics/store");
    const topic = (await getDefaultTopic())!;
    // The same phrase as a news search and a LinkedIn search stays two separate results.
    const config = structuredClone(topic.config);
    config.queries.serper = { news: ['"AI liability"'], linkedin: ['"AI liability"'], profiles: [] };
    config.queries.hashtags = ["AIliability"];
    const saved = process.env.SERPER_API_KEY;
    process.env.SERPER_API_KEY = "test-key";
    const post = (id: number) => ({
      title: "Jane Smith's Post",
      link: `https://www.linkedin.com/posts/jane-smith_ai-liability-activity-${(BigInt(Date.now() - 86_400_000) << BigInt(22)) + BigInt(id)}-abcd`,
      snippet: "Who pays when an AI agent gets it wrong? #AIliability",
    });
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { q: string };
        requests.push(`${url.split("/").pop()} ${body.q}`);
        return url.endsWith("/news")
          ? new Response(JSON.stringify({ news: [] }), { status: 200 })
          : new Response(JSON.stringify({ organic: body.q.includes("#") ? [post(1)] : [post(2), post(3)] }), { status: 200 });
      }),
    );
    try {
      const context = { topic: { ...topic, config }, since: new Date(Date.now() - 36 * 3_600_000), lookbackHours: 36, log: () => {} };
      const found = await serper.collect(context);
      expect(found).toHaveLength(3);
      expect(requests).toEqual(['news "AI liability"', 'search site:linkedin.com/posts "AI liability"', "search site:linkedin.com/posts #AIliability"]);
      const results = await searchResults(topic.id);
      expect(results['news:"AI liability"']).toMatchObject({ found: 0 });
      expect(results['posts:"AI liability"']).toMatchObject({ found: 2 });
      expect(results["#AIliability"]).toMatchObject({ found: 1 });
      // Run again straight away: nothing is due.
      const infos: string[] = [];
      expect(await serper.collect({ ...context, info: (m) => infos.push(m) })).toEqual([]);
      expect(requests).toHaveLength(3);
      expect(infos.join(" ")).toMatch(/ran recently/);
    } finally {
      vi.unstubAllGlobals();
      if (saved === undefined) delete process.env.SERPER_API_KEY;
      else process.env.SERPER_API_KEY = saved;
    }
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
