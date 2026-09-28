import { config } from "@/lib/config";
import { fetchJson } from "@/lib/http";
import { domainOf } from "@/lib/url";
import { addUsage, getUsage } from "@/lib/usage";
import type { Connector, RawItem } from "./types";

type SerperNews = { news?: Array<{ title: string; link: string; snippet?: string; date?: string; source?: string }> };
type SerperSearch = { organic?: Array<{ title: string; link: string; snippet?: string; date?: string }> };

/** Serper returns dates like "3 hours ago" or "Sep 21, 2026". */
export function parseSerperDate(value: string | undefined, now = new Date()): Date | undefined {
  if (!value) return undefined;
  const rel = value.match(/(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i);
  if (rel) {
    const unitMs: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 7 * 86_400_000,
      month: 30 * 86_400_000,
    };
    return new Date(now.getTime() - Number(rel[1]) * unitMs[rel[2].toLowerCase()]);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Pulls the author out of a public LinkedIn post URL and result title. */
export function parseLinkedInResult(link: string, title: string): { vanity: string | null; name: string | null; text: string } {
  const vanity = link.match(/linkedin\.com\/posts\/([^_/?#]+)_/i)?.[1] ?? null;
  const onLinkedIn = title.match(/^(.+?) on LinkedIn:\s*(.*)$/i);
  if (onLinkedIn) return { vanity, name: onLinkedIn[1].trim(), text: onLinkedIn[2].trim() };
  const parts = title.split(" | ").map((p) => p.trim());
  if (parts.length >= 2 && /^[\p{Lu}][\p{L}'.-]+(?:\s+[\p{Lu}][\p{L}'.-]+){1,3}$/u.test(parts[1])) {
    return { vanity, name: parts[1], text: parts[0] };
  }
  return { vanity, name: null, text: title };
}

async function query<T>(endpoint: "news" | "search", body: Record<string, unknown>): Promise<T> {
  const res = await fetchJson<T>(`https://google.serper.dev/${endpoint}`, {
    method: "POST",
    headers: { "x-api-key": config.serperApiKey() ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
    retries: 0,
  });
  await addUsage("serper_queries", 1);
  return res;
}

// Serper (free tier: 2,500 queries): Google News results with real publisher links, and
// discovery of public LinkedIn posts through Google. Stopped at SERPER_MONTHLY_QUERIES.
export const serper: Connector = {
  id: "serper_news",
  label: "Serper (Google News + LinkedIn)",
  unavailable: () => (config.serperApiKey() ? null : "add SERPER_API_KEY to enable"),
  async collect({ topic, lookbackHours, log }) {
    if (!config.serperApiKey()) return [];
    const tbs = lookbackHours <= 24 ? "qdr:d" : lookbackHours <= 24 * 7 ? "qdr:w" : "qdr:m";
    const { news, linkedin } = topic.config.queries.serper;
    const out: RawItem[] = [];
    const hasBudget = async () => (await getUsage("serper_queries")) < config.serperMonthlyQueries;

    for (const q of news) {
      if (!(await hasBudget())) {
        log("serper: monthly query cap reached");
        return out;
      }
      try {
        const data = await query<SerperNews>("news", { q, tbs, num: 20, gl: "us", hl: "en" });
        for (const r of data.news ?? []) {
          out.push({
            source: "serper_news",
            url: r.link,
            title: r.title,
            snippet: r.snippet,
            outlet: r.source,
            sourceKey: domainOf(r.link) ?? r.source ?? "unknown",
            sourceKind: "publication",
            publishedAt: parseSerperDate(r.date),
            matchedQuery: q,
            applyKeywordFilter: false,
          });
        }
      } catch (error) {
        log(`serper news "${q}": ${(error as Error).message}`);
      }
    }

    for (const q of linkedin) {
      if (!(await hasBudget())) {
        log("serper: monthly query cap reached");
        return out;
      }
      try {
        const data = await query<SerperSearch>("search", { q, tbs, num: 20, gl: "us", hl: "en" });
        for (const r of data.organic ?? []) {
          if (!/linkedin\.com\/(posts|pulse|feed)\//i.test(r.link)) continue;
          const post = parseLinkedInResult(r.link, r.title);
          out.push({
            source: "linkedin",
            url: r.link,
            title: post.text || r.title,
            snippet: r.snippet,
            author: post.name ?? post.vanity ?? undefined,
            authorUrl: post.vanity ? `https://www.linkedin.com/in/${post.vanity}` : undefined,
            outlet: post.name ? `${post.name} on LinkedIn` : "LinkedIn",
            sourceKey: post.vanity ? `linkedin:${post.vanity.toLowerCase()}` : "linkedin.com",
            sourceHomepage: post.vanity ? `https://www.linkedin.com/in/${post.vanity}` : undefined,
            sourceKind: "social_account",
            publishedAt: parseSerperDate(r.date),
            matchedQuery: q,
            applyKeywordFilter: false,
          });
        }
      } catch (error) {
        log(`serper linkedin "${q}": ${(error as Error).message}`);
      }
    }
    return out;
  },
};
