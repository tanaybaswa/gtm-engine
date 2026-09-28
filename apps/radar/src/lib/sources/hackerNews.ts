import { fetchJson } from "@/lib/http";
import { stripHtml, truncate } from "@/lib/text";
import { domainOf } from "@/lib/url";
import type { Connector, RawItem } from "./types";

type AlgoliaHit = {
  objectID: string;
  created_at_i: number;
  author: string;
  title?: string | null;
  url?: string | null;
  points?: number | null;
  num_comments?: number | null;
  comment_text?: string | null;
  story_title?: string | null;
  story_url?: string | null;
  _tags?: string[];
};

// Hacker News full-text search through Algolia's free API.
export const hackerNews: Connector = {
  id: "hacker_news",
  label: "Hacker News",
  async collect({ topic, since, log }) {
    const out: RawItem[] = [];
    for (const query of topic.config.queries.hackerNews) {
      const url =
        "https://hn.algolia.com/api/v1/search_by_date?" +
        new URLSearchParams({
          query,
          tags: "(story,comment)",
          numericFilters: `created_at_i>${Math.floor(since.getTime() / 1000)}`,
          hitsPerPage: "50",
        });
      try {
        const data = await fetchJson<{ hits: AlgoliaHit[] }>(url);
        for (const hit of data.hits) {
          const hnUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
          const isComment = hit._tags?.includes("comment");
          const link = isComment ? hnUrl : hit.url || hnUrl;
          out.push({
            source: "hacker_news",
            externalId: hit.objectID,
            url: link,
            title: isComment ? `Comment on "${hit.story_title ?? "a story"}"` : hit.title ?? "(untitled)",
            snippet: isComment ? truncate(stripHtml(hit.comment_text), 600) : undefined,
            author: hit.author,
            authorUrl: `https://news.ycombinator.com/user?id=${hit.author}`,
            outlet: "Hacker News",
            sourceKey: domainOf(link) ?? "news.ycombinator.com",
            sourceKind: link === hnUrl ? "community" : "publication",
            publishedAt: new Date(hit.created_at_i * 1000),
            engagement: isComment ? undefined : { points: hit.points ?? 0, comments: hit.num_comments ?? 0 },
            matchedQuery: query,
          });
        }
      } catch (error) {
        log(`hacker_news "${query}": ${(error as Error).message}`);
      }
    }
    return out;
  },
};
