import { fetchText, sleep } from "@/lib/http";
import { splitOutletSuffix } from "@/lib/text";
import { domainOf } from "@/lib/url";
import { readFeed } from "./feed";
import type { Connector, RawItem } from "./types";

// Google News RSS search. Free, but its terms cover personal use only, so treat it as a
// prototyping source; Serper returns the same results with publisher links for production.
export const googleNews: Connector = {
  id: "google_news",
  label: "Google News",
  async collect({ topic, lookbackHours, log }) {
    const queries = topic.config.queries.googleNews;
    const when = lookbackHours <= 24 ? "1d" : `${Math.min(30, Math.ceil(lookbackHours / 24))}d`;
    const out: RawItem[] = [];
    for (const query of queries) {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${when}`)}&hl=en-US&gl=US&ceid=US:en`;
      try {
        const feed = readFeed(await fetchText(url));
        for (const entry of feed.entries) {
          if (!entry.link || !entry.title) continue;
          const { title, outlet } = splitOutletSuffix(entry.title, entry.sourceTitle);
          const outletDomain = domainOf(entry.sourceUrl);
          out.push({
            source: "google_news",
            externalId: entry.id,
            url: entry.link,
            title,
            outlet: outlet ?? undefined,
            sourceKey: outletDomain ?? (outlet ? `outlet:${outlet.toLowerCase()}` : "news.google.com"),
            sourceHomepage: entry.sourceUrl,
            sourceKind: "publication",
            publishedAt: entry.published,
            matchedQuery: query,
            // "site:" searches stand in for an outlet's feed, so they get the keyword filter
            // like any general feed; topic searches are already scoped by their query.
            applyKeywordFilter: query.trim().startsWith("site:"),
          });
        }
      } catch (error) {
        log(`google_news "${query}": ${(error as Error).message}`);
      }
      await sleep(500);
    }
    return out;
  },
};
