import { z } from "zod";
import { structuredCall } from "@/lib/ai/client";
import { config } from "@/lib/config";
import { fetchText, mapLimit } from "@/lib/http";
import { readFeed } from "@/lib/sources/feed";
import { isPublicHttpUrl } from "@/lib/url";
import { SOURCE_KINDS, topicConfigSchema, type FeedConfig, type TopicConfig } from "./types";

// What Claude designs for a new topic. Everything lands in the topic's settings, where it
// can be edited later.
const designSchema = z.object({
  name: z.string(),
  description: z.string(),
  audience: z.string(),
  relevance: z.object({ high: z.string(), useful: z.string(), loose: z.string(), off: z.string() }),
  orgKinds: z.string(),
  keywordGroups: z.array(z.array(z.string())),
  exclude: z.array(z.string()),
  googleNews: z.array(z.string()),
  gdelt: z.array(z.string()),
  hackerNews: z.array(z.string()),
  redditSearch: z.array(z.string()),
  subreddits: z.array(z.string()),
  xSearch: z.array(z.string()),
  serperNews: z.array(z.string()),
  linkedin: z.array(z.string()),
  hashtags: z.array(z.string()),
  linkedinPeople: z.array(z.string()),
  youtube: z.array(z.string()),
  feeds: z.array(z.object({ url: z.string(), name: z.string(), kind: z.enum(SOURCE_KINDS), onTopic: z.boolean() })),
  watchOrgs: z.array(z.string()),
  watchPeople: z.array(z.string()),
});

const SYSTEM = `You set up topics for Radar, a market-intelligence tool for a go-to-market team. Every day Radar collects news and posts about each topic from free sources, Claude scores every item, and a morning brief traces each story to its original source and the people behind it.

Given a topic request, design everything Radar needs:

- name: 2 to 5 words, sentence case.
- description: 2 to 4 sentences on what is in scope and what is not. The scorer reads it.
- audience: who reads the brief, for example "a go-to-market team selling cyber insurance to mid-market companies". Infer it from the request; if it is unclear, write "a go-to-market team following this market".
- relevance: what scores 80-100 (high), 55-79 (useful), 20-54 (loose) and 0-19 (off), each one specific to this topic.
- orgKinds: a comma-separated list of the kinds of organizations worth tracking.
- keywordGroups: one or two groups of 8 to 20 terms each. Items from general feeds must match at least one term from every group. Put the subject in the first group and the angle (if any) in the second. A trailing * matches word prefixes (insur* matches insurer, insurance).
- exclude: phrases that cause false matches, such as other meanings of an acronym.
- googleNews: 8 to 14 Google News searches. Use quotes, OR, parentheses and -minus. Add 2 to 4 site: searches for important outlets in this space that likely have no RSS feed.
- gdelt: 1 or 2 searches in GDELT syntax (quoted phrases, OR inside parentheses).
- hackerNews: 1 to 3 quoted phrases, only if the topic has a technology angle; otherwise none.
- redditSearch: 1 or 2 searches. subreddits: 2 to 6 real, active subreddits, names only.
- xSearch: one X API v2 query ending in -is:retweet lang:en.
- serperNews: 1 to 3 plain searches.
- linkedin: 3 to 5 LinkedIn post searches, each a single quoted phrase people would write in a post, such as "AI liability". Keep them that simple: the search service refuses complex ones.
- hashtags: 3 to 6 hashtags people use on LinkedIn for this topic, without the #, such as AIinsurance.
- linkedinPeople: 2 to 4 quoted phrases that people working on this topic put in their LinkedIn headline or About section, such as "AI insurance".
- youtube: 2 to 4 YouTube searches that find webinars, conference talks, podcasts and demos on the topic: a quoted phrase plus a word that pins down the field, such as "AI exclusions" insurance. OR between phrases works.
- feeds: 6 to 16 RSS or Atom feeds you are confident exist: trade publications, company newsrooms, regulators, law firm blogs, research groups, newsletters (Substack feeds end in /feed), podcasts. onTopic is true only when a feed is entirely about this topic; general feeds are filtered by the keywords. Every feed is checked live and dropped if it fails, so prefer ones you are sure of.
- watchOrgs: 5 to 20 organizations central to the topic. watchPeople: people clearly central to it, only when you are confident (up to 10).

Style: plain words, no hype. Do not use em dashes.`;

export type CompiledTopic = {
  name: string;
  description: string;
  config: TopicConfig;
  notes: string[];
};

/** Keeps the feeds that answer with a parseable feed that has entries. */
async function workingFeeds(feeds: FeedConfig[]): Promise<FeedConfig[]> {
  // Claude suggests these, so only public web addresses are fetched.
  const unique = [...new Map(feeds.filter((f) => isPublicHttpUrl(f.url)).map((f) => [f.url, f])).values()].slice(0, 24);
  const checked = await mapLimit(unique, 8, async (feed) => {
    try {
      const parsed = readFeed(await fetchText(feed.url, { timeoutMs: 8_000, retries: 0 }));
      return parsed.entries.length ? feed : null;
    } catch {
      return null;
    }
  });
  return checked.filter((f): f is FeedConfig => f !== null);
}

const clean = (list: string[], max: number) => [...new Set(list.map((s) => s.trim()).filter(Boolean))].slice(0, max);

/** A starting point without Claude: search for the name everywhere, no filters. */
function basicConfig(name: string): TopicConfig {
  const phrase = `"${name.replace(/"/g, "")}"`;
  return topicConfigSchema.parse({
    keywords: { groups: [], exclude: [] },
    queries: {
      googleNews: [phrase],
      gdelt: [phrase],
      hackerNews: [phrase],
      reddit: { search: [phrase], subreddits: [] },
      x: { search: [`${phrase} -is:retweet lang:en`], accounts: [] },
      serper: { news: [name], linkedin: [phrase], profiles: [phrase] },
      youtube: { search: [phrase], channels: [] },
    },
  });
}

/** Turns a plain-English request into a topic: searches, filters, feeds, watchlist and scoring guide. */
export async function compileTopic(input: { name: string; brief: string }): Promise<CompiledTopic> {
  const name = input.name.trim();
  const brief = input.brief.trim();
  if (!config.aiEnabled()) {
    return {
      name,
      description: brief || name,
      config: basicConfig(name),
      notes: ["Claude is off, so this topic starts with a basic search for its name. Add ANTHROPIC_API_KEY for a full setup."],
    };
  }

  const design = await structuredCall({
    system: SYSTEM,
    prompt: `Topic request\nName: ${name}\nWhat to track: ${brief || "(nothing more; infer it from the name)"}`,
    schema: designSchema,
    effort: "medium",
    maxTokens: 12_000,
  });

  const proposed: FeedConfig[] = design.feeds.map((f) => ({ url: f.url.trim(), name: f.name.trim(), kind: f.kind, filter: !f.onTopic }));
  const feeds = await workingFeeds(proposed);
  const groups = design.keywordGroups.map((g) => clean(g, 30)).filter((g) => g.length).slice(0, 3);

  const topicConfig = topicConfigSchema.parse({
    keywords: { groups, exclude: clean(design.exclude, 30) },
    queries: {
      googleNews: clean(design.googleNews, 16),
      gdelt: clean(design.gdelt, 2),
      hackerNews: clean(design.hackerNews, 3),
      reddit: { search: clean(design.redditSearch, 2), subreddits: clean(design.subreddits.map((s) => s.replace(/^\/?r\//i, "")), 8) },
      x: { search: clean(design.xSearch, 2), accounts: [] },
      serper: {
        news: clean(design.serperNews, 3),
        linkedin: clean(design.linkedin, 5),
        profiles: clean(design.linkedinPeople, 4),
      },
      hashtags: clean(design.hashtags.map((t) => t.replace(/^#/, "").replace(/\s+/g, "")), 6),
      youtube: { search: clean(design.youtube, 4), channels: [] },
    },
    feeds,
    watch: { orgs: clean(design.watchOrgs, 25), people: clean(design.watchPeople, 12) },
    guide: {
      relevance: [
        `80-100: ${design.relevance.high}`,
        `55-79: ${design.relevance.useful}`,
        `20-54: ${design.relevance.loose}`,
        `0-19: ${design.relevance.off}`,
      ].join("\n"),
      audience: design.audience.trim(),
      orgs: design.orgKinds.trim(),
    },
  });

  const dropped = proposed.length - feeds.length;
  return {
    name: design.name.trim() || name,
    description: design.description.trim() || brief || name,
    config: topicConfig,
    notes: [
      `${topicConfig.queries.googleNews.length} news searches, ${feeds.length} feeds, ${topicConfig.queries.hashtags.length} hashtags, ${topicConfig.queries.youtube.search.length} YouTube searches, ${topicConfig.watch.orgs.length} organizations to watch.`,
      ...(dropped > 0 ? [`${dropped} suggested feeds didn't respond and were left out.`] : []),
    ],
  };
}
