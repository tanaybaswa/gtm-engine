import { describe, expect, it } from "vitest";
import { topicGuide } from "@/lib/ai/prompts";
import type { Topic } from "@/db/schema";
import { aiLiabilityInsurance } from "@/lib/topics/defaults";
import { topicConfigSchema } from "@/lib/topics/types";
import { followState, isFollowable, sourceLink } from "./follow";
import { streamOf } from "./types";

const topic = (slug: string, config: unknown): Topic => ({
  id: 1,
  slug,
  name: "Test",
  description: "Test topic",
  config: topicConfigSchema.parse(config),
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("streams", () => {
  it("puts social platforms first, then goes by the kind of source", () => {
    expect(streamOf("reddit", "trade_press")).toBe("social");
    expect(streamOf("x", null)).toBe("social");
    expect(streamOf("rss", "trade_press")).toBe("trade");
    expect(streamOf("google_news", "regulator")).toBe("legal");
    expect(streamOf("rss", "law_firm")).toBe("legal");
    expect(streamOf("rss", "wire")).toBe("companies");
    expect(streamOf("rss", "newsletter")).toBe("research");
    expect(streamOf("google_news", "publication")).toBe("news");
    expect(streamOf("gdelt", undefined)).toBe("news");
  });
});

describe("following", () => {
  const config = topicConfigSchema.parse({
    keywords: {},
    queries: { x: { accounts: ["@SomeAnalyst"] }, reddit: { subreddits: ["Insurance"] } },
    feeds: [{ url: "https://www.example.com/feed/", name: "Example" }],
  });

  it("reads follow state from the topic's own settings", () => {
    expect(followState({ key: "x:@someanalyst", followed: false, feedUrl: null }, config).followed).toBe(true);
    expect(followState({ key: "reddit:r/insurance", followed: false, feedUrl: null }, config).followed).toBe(true);
    expect(followState({ key: "example.com", followed: false, feedUrl: null }, config)).toEqual({
      followed: true,
      feedUrl: "https://www.example.com/feed/",
    });
    // The global flag on the source row doesn't leak across topics.
    expect(followState({ key: "other.com", followed: true, feedUrl: null }, config).followed).toBe(false);
  });

  it("knows which sources can be followed and where they live", () => {
    expect(isFollowable("example.com")).toBe(true);
    expect(isFollowable("x:@someone")).toBe(true);
    expect(isFollowable("linkedin:jane")).toBe(false);
    expect(sourceLink("reddit:r/insurance", null)).toBe("https://www.reddit.com/r/insurance/");
    expect(sourceLink("x:@someone", null)).toBe("https://x.com/someone");
  });
});

describe("topic guide", () => {
  it("uses the topic's own guide, then its seed's, then a general one", () => {
    const seeded = topicGuide(topic(aiLiabilityInsurance.slug, { ...aiLiabilityInsurance.config, guide: {} }));
    expect(seeded.relevance).toContain("insuring or transferring AI risk");

    const custom = topicGuide(topic("cyber-smb", { keywords: {}, queries: {}, guide: { audience: "a cyber MGA's sales team" } }));
    expect(custom.audience).toBe("a cyber MGA's sales team");
    expect(custom.relevance).toContain("directly about the topic as described");
    expect(custom.relevance).not.toContain("insur");
  });
});

describe("new topics without Claude", () => {
  it("start with a plain search for their name", async () => {
    const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    try {
      const { compileTopic } = await import("@/lib/topics/compile");
      const compiled = await compileTopic({ name: "Parametric insurance", brief: "" });
      expect(compiled.config.queries.googleNews).toEqual(['"Parametric insurance"']);
      expect(compiled.config.keywords.groups).toEqual([]);
      expect(compiled.notes[0]).toContain("Claude is off");
    } finally {
      if (saved.key) process.env.ANTHROPIC_API_KEY = saved.key;
      if (saved.token) process.env.ANTHROPIC_AUTH_TOKEN = saved.token;
    }
  });
});
