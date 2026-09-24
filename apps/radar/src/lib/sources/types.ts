import type { Topic } from "@/db/schema";
import type { SourceKind } from "@/lib/topics/types";

export type SourceId =
  | "google_news"
  | "gdelt"
  | "hacker_news"
  | "reddit"
  | "rss"
  | "x"
  | "serper_news"
  | "linkedin";

/** What every connector returns before it is normalized and stored. */
export type RawItem = {
  source: SourceId;
  externalId?: string;
  url: string;
  title: string;
  snippet?: string;
  author?: string;
  authorUrl?: string;
  /** Where we saw it: publication name, account, community. */
  outlet?: string;
  /** Stable key for the source record: a domain, "x:@handle", "reddit:r/name". */
  sourceKey?: string;
  sourceKind?: SourceKind;
  sourceHomepage?: string;
  feedUrl?: string;
  publishedAt?: Date;
  engagement?: Record<string, number>;
  matchedQuery?: string;
  /** False for topic-specific feeds whose items should skip the keyword filter. */
  applyKeywordFilter?: boolean;
};

export type CollectContext = {
  topic: Topic;
  since: Date;
  lookbackHours: number;
  log: (message: string) => void;
};

export type Connector = {
  id: SourceId;
  label: string;
  /** Returns a reason when the connector can't run (for example a missing API key). */
  unavailable?: () => string | null;
  collect: (ctx: CollectContext) => Promise<RawItem[]>;
};
