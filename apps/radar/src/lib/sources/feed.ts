import { parseFeed } from "feedsmith";
import { stripHtml } from "@/lib/text";

export type FeedEntry = {
  id?: string;
  title: string;
  link?: string;
  summary?: string;
  author?: string;
  authorUrl?: string;
  published?: Date;
  sourceTitle?: string;
  sourceUrl?: string;
};

export type ParsedFeed = { title?: string; link?: string; entries: FeedEntry[] };

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const raw = String(value).trim();
  let date = new Date(raw);
  // Some feeds (the UK FCA's, for one) use "Wednesday, September 23, 2026 - 12:17".
  if (Number.isNaN(date.getTime())) date = new Date(raw.replace(/\s+-\s+/, " "));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Parses RSS, Atom, RDF or JSON Feed into one flat entry shape. */
export function readFeed(body: string): ParsedFeed {
  const parsed = parseFeed(body);
  switch (parsed.format) {
    case "rss": {
      const feed = parsed.feed;
      return {
        title: feed.title,
        link: feed.link,
        entries: (feed.items ?? []).map((item) => ({
          id: item.guid?.value ?? item.link,
          title: stripHtml(item.title ?? ""),
          link: item.link ?? (item.guid?.isPermaLink ? item.guid.value : undefined),
          summary: stripHtml(item.description ?? item.content?.encoded ?? ""),
          author: item.authors?.[0]?.name ?? item.dc?.creators?.[0],
          published: toDate(item.pubDate ?? item.dc?.dates?.[0]),
          sourceTitle: item.source?.title,
          sourceUrl: item.source?.url,
        })),
      };
    }
    case "rdf": {
      const feed = parsed.feed;
      return {
        title: feed.title,
        link: feed.link,
        entries: (feed.items ?? []).map((item) => ({
          id: item.link,
          title: stripHtml(item.title ?? ""),
          link: item.link,
          summary: stripHtml(item.description ?? ""),
          author: item.dc?.creators?.[0],
          published: toDate(item.dc?.dates?.[0]),
        })),
      };
    }
    case "atom": {
      const feed = parsed.feed;
      const altLink = (links?: Array<{ href?: string; rel?: string }>) =>
        links?.find((l) => !l.rel || l.rel === "alternate")?.href ?? links?.[0]?.href;
      return {
        title: feed.title?.value,
        link: altLink(feed.links),
        entries: (feed.entries ?? []).map((entry) => ({
          id: entry.id,
          title: stripHtml(entry.title?.value ?? ""),
          link: altLink(entry.links),
          summary: stripHtml(entry.summary?.value ?? entry.content?.value ?? ""),
          author: entry.authors?.[0]?.name,
          authorUrl: entry.authors?.[0]?.uri,
          published: toDate(entry.published ?? entry.updated),
        })),
      };
    }
    case "json": {
      const feed = parsed.feed;
      return {
        title: feed.title,
        link: feed.home_page_url,
        entries: (feed.items ?? []).map((item) => ({
          id: item.id,
          title: stripHtml(item.title ?? ""),
          link: item.url ?? item.external_url,
          summary: stripHtml(item.summary ?? item.content_text ?? item.content_html ?? ""),
          author: item.authors?.[0]?.name,
          authorUrl: item.authors?.[0]?.url,
          published: toDate(item.date_published ?? item.date_modified),
        })),
      };
    }
  }
}
