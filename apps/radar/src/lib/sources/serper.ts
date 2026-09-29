import type { QueryOutcome } from "@/db/schema";
import { domainOf } from "@/lib/url";
import { activityTime, hashtagQuery, linkedInQuery, parseLinkedInPost, profileUrl } from "./linkedin";
import { searchSchedule, SerperBudgetError, serperEnabled, serperSearch, type SerperNews, type SerperSearch } from "./serper-client";
import type { Connector, RawItem } from "./types";

// Each search runs at most once a day: Google takes a day or more to index LinkedIn posts,
// and Serper's free plan is 2,500 searches in all.
const SEARCH_EVERY_MS = 20 * 3_600_000;
// Posts older than this aren't news any more, even when Google shows them.
const MAX_POST_AGE_MS = 21 * 86_400_000;

/** Serper returns dates like "3 hours ago" or "Sep 21, 2026". */
export function parseSerperDate(value: string | undefined, now = new Date()): Date | undefined {
  if (!value) return undefined;
  const rel = value.match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i);
  if (rel) {
    const unitMs: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 7 * 86_400_000,
      month: 30 * 86_400_000,
      year: 365 * 86_400_000,
    };
    return new Date(now.getTime() - Number(rel[1]) * unitMs[rel[2].toLowerCase()]);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Kept for the parser tests and older callers. */
export function parseLinkedInResult(link: string, title: string): { vanity: string | null; name: string | null; text: string } {
  const post = parseLinkedInPost(link, title);
  return { vanity: post.vanity, name: post.name, text: post.text };
}

function newsItems(data: SerperNews, key: string): RawItem[] {
  return (data.news ?? []).map((r) => ({
    source: "serper_news" as const,
    url: r.link,
    title: r.title,
    snippet: r.snippet,
    outlet: r.source,
    sourceKey: domainOf(r.link) ?? r.source ?? "unknown",
    sourceKind: "publication" as const,
    publishedAt: parseSerperDate(r.date),
    matchedQuery: key,
    applyKeywordFilter: false,
  }));
}

/** LinkedIn posts and articles from Google results. Radar never opens linkedin.com itself. */
export function linkedInItems(data: SerperSearch, key: string, timeLimited: boolean, now = Date.now()): RawItem[] {
  const out: RawItem[] = [];
  for (const r of data.organic ?? []) {
    if (!/linkedin\.com\/(posts|pulse)\//i.test(r.link)) continue;
    const post = parseLinkedInPost(r.link, r.title, r.snippet);
    const publishedAt = activityTime(r.link) ?? parseSerperDate(r.date);
    if (publishedAt && now - publishedAt.getTime() > MAX_POST_AGE_MS) continue;
    // Without a date or a time filter there's no telling whether an article is new.
    if (!publishedAt && !timeLimited) continue;
    const account = post.vanity ? profileUrl(post.vanity, post.org) : undefined;
    out.push({
      source: "linkedin",
      url: r.link.replace(/^https?:\/\/[a-z]{2}\.linkedin\.com/i, "https://www.linkedin.com"),
      title: post.text || r.title,
      snippet: r.snippet,
      author: post.name ?? undefined,
      authorUrl: post.name ? account : undefined,
      outlet: post.name ? `${post.name} on LinkedIn` : post.kind === "article" ? "LinkedIn article" : "LinkedIn",
      sourceKey: post.vanity ? `linkedin:${post.vanity}` : "linkedin.com",
      sourceHomepage: account,
      sourceKind: "social_account",
      publishedAt,
      matchedQuery: key,
      applyKeywordFilter: false,
    });
  }
  return out;
}

// Serper: Google News with publishers' own links, and public LinkedIn posts, articles and
// hashtags through Google. Stopped at SERPER_MONTHLY_QUERIES searches a month.
export const serper: Connector = {
  id: "serper_news",
  label: "Serper (news and LinkedIn)",
  unavailable: () => (serperEnabled() ? null : "add SERPER_API_KEY to enable"),
  async collect({ topic, lookbackHours, log, noteQuery = () => {}, info = () => {} }) {
    if (!serperEnabled()) return [];
    const { serper: searches, hashtags } = topic.config.queries;
    const newsTbs = lookbackHours <= 24 ? "qdr:d" : lookbackHours <= 24 * 7 ? "qdr:w" : "qdr:m";
    const plan = [
      ...searches.news.map((q) => ({ key: q, kind: "news" as const, q, tbs: newsTbs })),
      ...searches.linkedin.map((q) => ({ key: q, kind: "linkedin" as const, q: linkedInQuery(q, "posts"), tbs: "qdr:w" })),
      ...hashtags.map((tag) => ({ key: `#${tag.replace(/^#/, "")}`, kind: "linkedin" as const, q: hashtagQuery(tag), tbs: "qdr:w" })),
    ];
    const schedule = await searchSchedule(topic.id);
    const due = plan.filter((p) => schedule.due(p.key, SEARCH_EVERY_MS));
    if (plan.length && !due.length) {
      info("every search ran in the last day; each runs once a day");
      return [];
    }

    const out: RawItem[] = [];
    try {
      for (const p of due) {
        let outcome: QueryOutcome;
        try {
          const result =
            p.kind === "news"
              ? await serperSearch<SerperNews>("news", p.q, { tbs: p.tbs })
              : await serperSearch<SerperSearch>("search", p.q, { tbs: p.tbs });
          schedule.ran(p.key);
          if (!result) {
            outcome = { found: 0, error: "Serper's free plan refused this search, even in simpler forms" };
          } else {
            const found =
              p.kind === "news"
                ? newsItems(result.data as SerperNews, p.key)
                : linkedInItems(result.data as SerperSearch, p.key, result.timeLimited);
            out.push(...found);
            outcome = { found: found.length, ...(result.ranAs ? { ranAs: result.ranAs } : {}) };
          }
        } catch (error) {
          if (error instanceof SerperBudgetError) {
            log(error.message);
            break;
          }
          outcome = { found: 0, error: (error as Error).message.slice(0, 200) };
          log(`serper "${p.key}": ${(error as Error).message}`);
        }
        noteQuery(p.key, outcome);
      }
    } finally {
      await schedule.save();
    }
    if (due.length < plan.length) info(`${plan.length - due.length} searches ran in the last day and wait for tomorrow`);
    return out;
  },
};
