// Shapes the console sends to the browser. Plain JSON only (dates are ISO strings), so the
// same objects can sit in Next's data cache, cross the network, and live in client state.
// This module has no server imports; client components import it too.

import type { ConnectorStat, PrimarySource, RunProgress, RunStage } from "@/db/schema";
import type { TopicConfig } from "@/lib/topics/types";

export const STREAMS = [
  { id: "news", label: "News", hint: "News searches and general publications" },
  { id: "linkedin", label: "LinkedIn", hint: "Public LinkedIn posts and articles that Google has found" },
  { id: "trade", label: "Trade press", hint: "Industry publications" },
  { id: "legal", label: "Legal and regulatory", hint: "Law firms, regulators and courts" },
  { id: "companies", label: "Companies and wires", hint: "Company blogs and press releases" },
  { id: "research", label: "Research and newsletters", hint: "Research groups, newsletters, podcasts and blogs" },
  { id: "social", label: "Social and community", hint: "X, Reddit and Hacker News" },
] as const;
export type StreamId = (typeof STREAMS)[number]["id"];

const SOCIAL_CONNECTORS = new Set(["x", "reddit", "hacker_news"]);

/** Which stream an item belongs to: LinkedIn and social connectors first, then the kind of source. */
export function streamOf(source: string, kind: string | null | undefined): StreamId {
  if (source === "linkedin") return "linkedin";
  if (SOCIAL_CONNECTORS.has(source)) return "social";
  switch (kind) {
    case "trade_press":
      return "trade";
    case "law_firm":
    case "regulator":
      return "legal";
    case "company":
    case "wire":
      return "companies";
    case "research":
    case "newsletter":
    case "podcast":
    case "blog":
      return "research";
    case "community":
    case "social_account":
      return "social";
    default:
      return "news";
  }
}

/** Labels for where an item came from (items.source). */
export const SOURCE_LABELS: Record<string, string> = {
  google_news: "Google News",
  gdelt: "GDELT",
  rss: "Feed",
  hacker_news: "Hacker News",
  reddit: "Reddit",
  serper_news: "Serper",
  linkedin: "LinkedIn",
  x: "X",
};

/** Labels for collection connectors, as they appear in run stats. */
export const CONNECTOR_LABELS: Record<string, string> = {
  google_news: "Google News",
  gdelt: "GDELT",
  rss: "RSS feeds",
  hacker_news: "Hacker News",
  reddit: "Reddit",
  serper_news: "Serper (news and LinkedIn)",
  linkedin_people: "LinkedIn people (Serper)",
  x: "X",
};

export type { RunProgress };

export type EntityRef = { id: number; name: string; relation?: string };

export type ItemDTO = {
  id: number;
  source: string;
  sourceKey: string;
  sourceKind: string;
  stream: StreamId;
  outlet: string | null;
  title: string;
  href: string;
  snippet: string | null;
  gist: string | null;
  summary: string | null;
  whyItMatters: string | null;
  author: string | null;
  authorUrl: string | null;
  publishedAt: string | null;
  collectedAt: string;
  relevance: number | null;
  category: string | null;
  isOrigin: boolean | null;
  originHint: string | null;
  primarySources: PrimarySource[];
  engagement: Record<string, number> | null;
  matchedQuery: string | null;
  people: EntityRef[];
  orgs: EntityRef[];
};

export type StoryDTO = {
  id: number;
  briefDate: string;
  rank: number;
  title: string;
  summary: string;
  whyItMatters: string | null;
  originItemId: number | null;
  itemIds: number[];
  peopleNames: string[];
  orgNames: string[];
};

export type MentionDTO = { itemId: number; relation: string; role: string | null; org: string | null; quote: string | null };

export type PersonDTO = {
  id: number;
  name: string;
  role: string | null;
  orgName: string | null;
  linkedinUrl: string | null;
  linkedinHeadline: string | null;
  xHandle: string | null;
  watched: boolean;
  lastSeenAt: string;
  /** Mentions in this topic, and how they break down (quoted 3, author 1, ...). */
  mentions: number;
  relations: Record<string, number>;
  /** Spoke, wrote or posted somewhere, rather than only being named. */
  voice: boolean;
  recent: MentionDTO[];
};

export type OrgDTO = {
  id: number;
  name: string;
  kind: string | null;
  watched: boolean;
  lastSeenAt: string;
  mentions: number;
  relations: Record<string, number>;
  itemIds: number[];
};

/** Someone whose public LinkedIn profile matched one of the topic's people searches. */
export type ProfileDTO = {
  id: number;
  vanity: string;
  url: string;
  name: string;
  headline: string | null;
  company: string | null;
  location: string | null;
  about: string | null;
  matchedQuery: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type SourceDTO = {
  id: number;
  key: string;
  name: string;
  kind: string;
  stream: StreamId;
  link: string | null;
  feedUrl: string | null;
  followed: boolean;
  /** Following is possible: websites (via their feed), X accounts and subreddits. */
  followable: boolean;
  items: number;
  relevant: number;
  origins: number;
  latestAt: string | null;
};

export type RunDTO = {
  id: number;
  stage: RunStage;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  notes: string[];
  connectors: Record<string, ConnectorStat> | null;
  counts: { triaged?: number; relevant?: number; extracted?: number; stories?: number; prefiltered?: number };
  aiSkipped: string | null;
  progress: RunProgress | null;
};

export type TopicDTO = {
  id: number;
  slug: string;
  name: string;
  description: string;
  active: boolean;
  config: TopicConfig;
  updatedAt: string;
  hasDefaults: boolean;
  /** The guide Claude uses for any field the topic leaves empty. */
  guideDefaults: { relevance: string; audience: string; orgs: string };
};

export type SpendDTO = {
  model: string;
  ai: { enabled: boolean; usd: number; capUsd: number };
  x: { enabled: boolean; usd: number; capUsd: number };
  serper: { enabled: boolean; queries: number; cap: number };
};

export type DailyCount = { date: string; items: number; relevant: number };

/** A Serper search's latest result, shown under it in Settings. */
export type SearchResultDTO = { found: number; ranAs?: string; error?: string; at: string };

export type ConsoleData = {
  /** When this payload was assembled (start of the build). */
  generatedAt: string;
  topic: TopicDTO;
  items: ItemDTO[];
  stories: StoryDTO[];
  briefDates: string[];
  people: PersonDTO[];
  orgs: OrgDTO[];
  profiles: ProfileDTO[];
  /** Serper searches' latest results, by key: news:<search>, posts:<search>, #<tag>, people:<search>, matching. */
  searches: Record<string, SearchResultDTO>;
  sources: SourceDTO[];
  runs: RunDTO[];
  spend: SpendDTO;
  daily: DailyCount[];
  totals: { items: number; scored: number; relevant: number; origins: number };
};

export type TopicSummary = {
  id: number;
  slug: string;
  name: string;
  active: boolean;
  items: number;
  new24h: number;
  relevant24h: number;
  spark: number[];
  lastRun: { status: string; stage: string; at: string } | null;
};

export type TopicSummaries = { generatedAt: string; topics: TopicSummary[] };

export type LiveStatus = {
  now: string;
  /** Last time anything changed: a run stage finished, or someone edited settings. */
  changedAt: string | null;
  running: { topicId: number; run: RunDTO }[];
};
