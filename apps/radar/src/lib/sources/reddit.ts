import { fetchText, HttpError, sleep } from "@/lib/http";
import { truncate } from "@/lib/text";
import { readFeed } from "./feed";
import type { Connector, RawItem } from "./types";

// Reddit's API now needs approval, but public RSS still works for light use.
// Reddit rate-limits RSS quickly, so requests are spaced out and capped per run.
const MAX_REQUESTS = 8;

function subredditOf(link: string): string | null {
  return link.match(/reddit\.com\/r\/([^/]+)/i)?.[1] ?? null;
}

export const reddit: Connector = {
  id: "reddit",
  label: "Reddit",
  async collect({ topic, since, lookbackHours, log }) {
    const { search, subreddits } = topic.config.queries.reddit;
    const window = lookbackHours <= 24 ? "day" : lookbackHours <= 24 * 7 ? "week" : "month";
    const requests = [
      ...search.map((q) => ({
        label: q,
        url: `https://www.reddit.com/search.rss?${new URLSearchParams({ q, sort: "new", t: window })}`,
        filter: false,
      })),
      ...subreddits.map((s) => ({
        label: `r/${s}`,
        url: `https://www.reddit.com/r/${encodeURIComponent(s)}/new/.rss`,
        filter: true,
      })),
    ].slice(0, MAX_REQUESTS);

    const out: RawItem[] = [];
    for (const [i, req] of requests.entries()) {
      if (i > 0) await sleep(2500);
      try {
        const feed = readFeed(await fetchText(req.url, { retries: 0 }));
        for (const entry of feed.entries) {
          // Search results also list whole subreddits (t5_); keep posts (t3_).
          if (!entry.link || !entry.id?.startsWith("t3_")) continue;
          if (entry.published && entry.published < since) continue;
          const sub = subredditOf(entry.link);
          out.push({
            source: "reddit",
            externalId: entry.id,
            url: entry.link,
            title: entry.title,
            snippet: entry.summary ? truncate(entry.summary, 600) : undefined,
            author: entry.author?.replace(/^\/u\//, "u/"),
            authorUrl: entry.authorUrl,
            outlet: sub ? `r/${sub}` : "Reddit",
            sourceKey: sub ? `reddit:r/${sub.toLowerCase()}` : "reddit.com",
            sourceHomepage: sub ? `https://www.reddit.com/r/${sub}/` : undefined,
            sourceKind: "community",
            publishedAt: entry.published,
            matchedQuery: req.label,
            applyKeywordFilter: req.filter,
          });
        }
      } catch (error) {
        log(`reddit ${req.label}: ${(error as Error).message}`);
        if (error instanceof HttpError && error.status === 429) break;
      }
    }
    return out;
  },
};
