import { fetchText } from "@/lib/http";
import { isHttpUrl } from "@/lib/url";
import { readFeed } from "./feed";

const COMMON_PATHS = ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/index.xml", "/feed/", "/rss/"];

async function isFeed(url: string): Promise<boolean> {
  try {
    return readFeed(await fetchText(url, { timeoutMs: 10_000, retries: 0 })).entries.length > 0;
  } catch {
    return false;
  }
}

/** Finds an RSS/Atom feed for a site: the page's <link rel="alternate"> first, then common paths. */
export async function discoverFeed(siteUrl: string): Promise<string | null> {
  const base = isHttpUrl(siteUrl) ? siteUrl : `https://${siteUrl}`;
  try {
    const html = await fetchText(base, { timeoutMs: 10_000, retries: 0, headers: { accept: "text/html" } });
    const tags = html.match(/<link[^>]+>/gi) ?? [];
    for (const tag of tags) {
      if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (!href) continue;
      const url = new URL(href, base).toString();
      if (await isFeed(url)) return url;
    }
  } catch {
    // Fall through to guessing common paths.
  }
  const origin = new URL(base).origin;
  for (const path of COMMON_PATHS) {
    const url = origin + path;
    if (await isFeed(url)) return url;
  }
  return null;
}
