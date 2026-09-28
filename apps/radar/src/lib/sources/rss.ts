import { fetchText, mapLimit } from "@/lib/http";
import { truncate } from "@/lib/text";
import { domainOf } from "@/lib/url";
import { readFeed } from "./feed";
import type { Connector, RawItem } from "./types";

// Any RSS, Atom or JSON feed: trade press, law-firm alerts, press wires, regulators,
// newsletters, podcasts. Feeds without dates contribute their 25 newest entries.
export const rss: Connector = {
  id: "rss",
  label: "RSS feeds",
  async collect({ topic, since, log }) {
    const results = await mapLimit(topic.config.feeds, 4, async (feedConfig) => {
      const items: RawItem[] = [];
      try {
        const feed = readFeed(await fetchText(feedConfig.url, { timeoutMs: 15_000 }));
        const outlet = feedConfig.name ?? feed.title ?? domainOf(feedConfig.url) ?? feedConfig.url;
        const homepage = feed.link ?? feedConfig.url;
        for (const entry of feed.entries.slice(0, 50)) {
          if (!entry.link || !entry.title) continue;
          if (entry.published && entry.published < since) continue;
          if (!entry.published && items.length >= 25) break;
          items.push({
            source: "rss",
            externalId: entry.id,
            url: entry.link,
            title: entry.title,
            snippet: entry.summary ? truncate(entry.summary, 600) : undefined,
            author: entry.author,
            authorUrl: entry.authorUrl,
            outlet,
            sourceKey: domainOf(homepage) ?? domainOf(entry.link) ?? feedConfig.url,
            sourceHomepage: homepage,
            sourceKind: feedConfig.kind ?? "publication",
            feedUrl: feedConfig.url,
            publishedAt: entry.published,
            matchedQuery: outlet,
            applyKeywordFilter: feedConfig.filter,
          });
        }
      } catch (error) {
        log(`rss ${feedConfig.url}: ${(error as Error).message}`);
      }
      return items;
    });
    return results.flat();
  },
};
