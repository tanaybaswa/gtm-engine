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

describe("youtube", () => {
  const now = new Date().toISOString();
  const video = (id: string, duration: string, title: string, channelId = "UCcXFMZ7LQas6Uf0Pmy5opfA", views = "22", extra: Record<string, string> = {}) => ({
    id,
    snippet: { publishedAt: now, channelId, channelTitle: `Channel ${channelId.slice(-4)}`, title, description: "Jeremy Epstein, Founder & CEO of Mayflower Specialty, on AI liability insurance.", ...extra },
    contentDetails: { duration },
    statistics: { viewCount: views },
  });
  // Two channels: the followed one is small, the other is big.
  const followedId = "UCcXFMZ7LQas6Uf0Pmy5opfA";
  const bigId = "UCbigbigbigbigbigbigbig1";
  const smallId = "UCsmallsmallsmallsmall01";
  type Request = { url: string; key: string | null };

  function stubYouTube(requests: Request[], videos: ReturnType<typeof video>[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const headers = (init.headers ?? {}) as Record<string, string>;
        requests.push({ url, key: headers["x-goog-api-key"] ?? null });
        if (url.includes("/youtube/v3/search")) return Response.json({ items: videos.filter((v) => !v.id.startsWith("feed")).map((v) => ({ id: { videoId: v.id } })) });
        if (url.includes("/feeds/videos.xml")) {
          return new Response(`<feed><title>Age of the MGA</title><entry><yt:videoId>feedvideo01</yt:videoId><published>${now}</published></entry></feed>`);
        }
        if (url.includes("/youtube/v3/videos")) {
          const ids = new URL(url).searchParams.get("id")!.split(",");
          return Response.json({ items: videos.filter((v) => ids.includes(v.id)) });
        }
        if (url.includes("/youtube/v3/channels")) {
          return Response.json({
            items: [
              { id: followedId, statistics: { subscriberCount: "40", videoCount: "90", viewCount: "5000" } },
              { id: bigId, statistics: { subscriberCount: "12000", videoCount: "300", viewCount: "900000" } },
              { id: smallId, statistics: { hiddenSubscriberCount: true, videoCount: "3", viewCount: "40" } },
            ],
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
  }

  it("searches, reads followed channels, skips Shorts, and keeps the key out of URLs", async () => {
    const { youtube, youtubeResults, youtubeSearchesToday } = await import("@/lib/sources/youtube");
    const { getDefaultTopic } = await import("@/lib/topics/store");
    const topic = (await getDefaultTopic())!;
    const config = structuredClone(topic.config);
    config.queries.youtube = {
      ...config.queries.youtube,
      search: ['"AI exclusions" insurance'],
      channels: [`https://www.youtube.com/channel/${followedId}`, "not a channel"],
    };
    const saved = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "test-youtube-key";
    const requests: Request[] = [];
    stubYouTube(requests, [
      video("aaaaaaaaaaa", "PT35M", "AI exclusions explained", bigId, "5400"),
      video("bbbbbbbbbbb", "PT40S", "Quick take", bigId),
      video("feedvideo01", "PT1M17S", "AI Liability Isn't Just Cyber"),
    ]);
    try {
      const before = await youtubeSearchesToday();
      const infos: string[] = [];
      const context = { topic: { ...topic, config }, since: new Date(Date.now() - 36 * 3_600_000), lookbackHours: 36, log: () => {}, info: (m: string) => infos.push(m) };
      const found = await youtube.collect(context);
      expect(found.map((i) => [i.externalId, i.applyKeywordFilter, i.engagement?.subscribers])).toEqual([
        ["aaaaaaaaaaa", true, 12000],
        ["feedvideo01", true, 40],
      ]);
      expect(infos.join(" ")).toMatch(/skipped 1 Shorts or upcoming streams/);
      expect(await youtubeSearchesToday()).toBe(before + 1);
      // Searches look back 90 days by default and ask for 50 results.
      const search = new URL(requests.find((r) => r.url.includes("/search"))!.url).searchParams;
      expect(search.get("maxResults")).toBe("50");
      expect(Date.now() - Date.parse(search.get("publishedAfter")!)).toBeGreaterThan(89 * 86_400_000);
      // The key travels in a header only: request URLs end up in error messages.
      expect(requests.some((r) => r.url.includes("test-youtube-key"))).toBe(false);
      expect(requests.filter((r) => r.url.includes("googleapis.com")).every((r) => r.key === "test-youtube-key")).toBe(true);
      const results = await youtubeResults(topic.id);
      expect(results['youtube:"AI exclusions" insurance']).toMatchObject({ found: 2 });
      expect(results[`channel:https://www.youtube.com/channel/${followedId}`]).toMatchObject({ found: 1, label: "Age of the MGA" });
      expect(results["channel:not a channel"]?.error).toMatch(/Not a channel/);
      // Straight away again: the search waits for tomorrow, the channel feed is read again for free.
      const searches = requests.filter((r) => r.url.includes("/search")).length;
      await youtube.collect(context);
      expect(requests.filter((r) => r.url.includes("/search")).length).toBe(searches);
      expect(requests.filter((r) => r.url.includes("/feeds/")).length).toBe(2);
      // New search settings run the searches again at once.
      config.queries.youtube.windowDays = 0;
      config.queries.youtube.order = "both";
      await youtube.collect(context);
      const rerun = requests.filter((r) => r.url.includes("/search")).slice(searches);
      expect(rerun.map((r) => new URL(r.url).searchParams.get("order"))).toEqual(["relevance", "viewCount"]);
      expect(rerun.every((r) => !new URL(r.url).searchParams.has("publishedAfter"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      if (saved === undefined) delete process.env.YOUTUBE_API_KEY;
      else process.env.YOUTUBE_API_KEY = saved;
    }
  });

  it("keeps only videos that clear the topic's floors, except from followed channels", async () => {
    const { youtube } = await import("@/lib/sources/youtube");
    const { getDefaultTopic } = await import("@/lib/topics/store");
    const topic = (await getDefaultTopic())!;
    const config = structuredClone(topic.config);
    config.queries.youtube = {
      ...config.queries.youtube,
      search: ['"silent AI" insurance'],
      channels: [`https://www.youtube.com/channel/${followedId}`],
      hiddenChannels: ["UChiddenhiddenhiddenhid1"],
      minSubscribers: 1000,
      minViews: 100,
      minMinutes: 5,
    };
    const saved = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "test-youtube-key";
    stubYouTube(
      [],
      [
        video("keepbigchan", "PT20M", "AI exclusions explained", bigId, "5400"),
        video("lowviews001", "PT20M", "Few views", bigId, "12"),
        video("tooshort001", "PT3M", "A short clip", bigId, "9000"),
        video("hiddensubs1", "PT20M", "Hidden subscriber count", smallId, "9000"),
        video("hiddenchan1", "PT20M", "From a hidden channel", "UChiddenhiddenhiddenhid1", "9000"),
        video("korean00001", "PT20M", "AI가 잘못 송금했다면? 누가 책임질까", bigId, "9000"),
        video("followed001", "PT20M", "Small but followed", followedId, "150"),
      ],
    );
    try {
      const infos: string[] = [];
      const found = await youtube.collect({ topic: { ...topic, config }, since: new Date(), lookbackHours: 36, log: () => {}, info: (m: string) => infos.push(m) });
      expect(found.map((i) => i.externalId).sort()).toEqual(["followed001", "keepbigchan"]);
      const text = infos.join(" ");
      expect(text).toMatch(/1 under 100 views/);
      expect(text).toMatch(/1 shorter than 5 min/);
      expect(text).toMatch(/1 from channels under 1,000 subscribers/);
      expect(text).toMatch(/1 from hidden channels/);
      expect(text).toMatch(/1 not in English/);
    } finally {
      vi.unstubAllGlobals();
      if (saved === undefined) delete process.env.YOUTUBE_API_KEY;
      else process.env.YOUTUBE_API_KEY = saved;
    }
  });
});

describe("youtube reading", () => {
  it("reads a relevant video from its description and saves its speakers", async () => {
    const { getDb } = await import("@/db");
    const { items, people, personMentions } = await import("@/db/schema");
    const { getDefaultTopic } = await import("@/lib/topics/store");
    const { enrichTopic } = await import("./enrich");
    const { Deadline } = await import("./runs");
    const { eq } = await import("drizzle-orm");
    const topic = (await getDefaultTopic())!;
    const db = await getDb();
    const [video] = await db
      .insert(items)
      .values({
        topicId: topic.id,
        source: "youtube",
        externalId: "9IT1CwuI4Vo",
        url: "https://www.youtube.com/watch?v=9IT1CwuI4Vo",
        canonicalUrl: "https://youtube.com/watch?v=9IT1CwuI4Vo",
        titleKey: "ai liability insurtech innovation",
        title: "AI Liability, Insurtech Innovation & The Future of Reinsurance",
        outlet: "The InsurTech Geek Podcast",
        sourceKey: "youtube:UCzTi0B_BHft1O4hmM8_ehoQ",
        status: "triaged",
        relevance: 90,
        gist: "Gallagher Re's Freddie Scarratt on AI liability.",
      })
      .returning({ id: items.id });
    const saved = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "test-youtube-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          items: [
            {
              id: "9IT1CwuI4Vo",
              snippet: {
                publishedAt: "2026-07-10T12:00:00Z",
                channelId: "UCzTi0B_BHft1O4hmM8_ehoQ",
                channelTitle: "The InsurTech Geek Podcast",
                title: "AI Liability, Insurtech Innovation & The Future of Reinsurance",
                description:
                  "Freddie Scarratt, Global Deputy Head of InsurTech at Gallagher Re, joins hosts James Benham and Rob Galbraith to explore AI liability, insurtech's shift from disruption to partnership, and why risk-originating businesses can never scale the way SaaS companies do. Report: https://example.com/ai-risk-report",
              },
            },
          ],
        }),
      ),
    );
    replies.push({
      summary: "Freddie Scarratt of Gallagher Re discusses AI liability.",
      whyItMatters: "A reinsurer's view on pricing AI risk.",
      isOrigin: true,
      primarySources: [{ title: "AI risk report", url: "https://example.com/ai-risk-report", kind: "report", publisher: "Gallagher Re" }],
      people: [{ name: "Freddie Scarratt", role: "Global Deputy Head of InsurTech", org: "Gallagher Re", relation: "speaker", quote: null }],
      orgs: [{ name: "Gallagher Re", kind: "reinsurer", relation: "subject" }],
    });
    try {
      await enrichTopic(topic, new Deadline(120), () => {});
      const [row] = await db.select().from(items).where(eq(items.id, video.id));
      expect(row).toMatchObject({ status: "extracted", summary: "Freddie Scarratt of Gallagher Re discusses AI liability.", isOrigin: true });
      const speakers = await db
        .select({ name: people.name, relation: personMentions.relation })
        .from(personMentions)
        .innerJoin(people, eq(people.id, personMentions.personId))
        .where(eq(personMentions.itemId, video.id));
      expect(speakers).toEqual([{ name: "Freddie Scarratt", relation: "speaker" }]);
    } finally {
      vi.unstubAllGlobals();
      if (saved === undefined) delete process.env.YOUTUBE_API_KEY;
      else process.env.YOUTUBE_API_KEY = saved;
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
