import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchText } from "@/lib/http";
import { domainOf, isHttpUrl } from "@/lib/url";

export type Article = {
  url: string;
  text: string;
  truncated: boolean;
  byline: string | null;
  links: { text: string; href: string }[];
};

const MAX_CHARS = 40_000;

/** Google News links are redirects. Decodes one to the publisher's URL, or returns null. */
export async function decodeGoogleNewsUrl(url: string): Promise<string | null> {
  if (!/news\.google\.com\/(rss\/)?articles\//.test(url)) return url;
  try {
    const { GoogleDecoder } = await import("google-news-url-decoder");
    const result = await new GoogleDecoder().decode(url);
    return result.status && isHttpUrl(result.decoded_url) ? result.decoded_url : null;
  } catch {
    return null;
  }
}

/**
 * Fetches a page and pulls out the readable article text plus its outbound links, which are
 * where primary sources (reports, filings, announcements) usually hide.
 */
export async function fetchArticle(url: string): Promise<Article | null> {
  let html: string;
  try {
    html = await fetchText(url, { timeoutMs: 15_000, retries: 0, headers: { accept: "text/html,application/xhtml+xml" } });
  } catch {
    return null;
  }
  const { document } = parseHTML(html);
  const parsed = new Readability(document as unknown as Document).parse();
  const text = (parsed?.textContent ?? "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (text.length < 300) return null;

  const links: { text: string; href: string }[] = [];
  if (parsed?.content) {
    const fragment = parseHTML(`<html><body>${parsed.content}</body></html>`).document;
    const host = domainOf(url);
    for (const a of Array.from(fragment.querySelectorAll("a[href]"))) {
      const href = new URL(a.getAttribute("href") ?? "", url).toString();
      const label = (a.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!isHttpUrl(href) || !label || domainOf(href) === host) continue;
      if (!links.some((l) => l.href === href)) links.push({ text: label.slice(0, 120), href });
      if (links.length >= 25) break;
    }
  }
  return {
    url,
    text: text.slice(0, MAX_CHARS),
    truncated: text.length > MAX_CHARS,
    byline: parsed?.byline ?? null,
    links,
  };
}
