import type { QueryOutcome } from "@/db/schema";
import { config } from "@/lib/config";
import { fetchJson, HttpError } from "@/lib/http";
import { getKv, setKv } from "@/lib/kv";
import { listTopics } from "@/lib/topics/store";
import type { TopicConfig } from "@/lib/topics/types";
import { addUsage, getUsage } from "@/lib/usage";
import { simplerQuery } from "./linkedin";

export type SerperNews = { news?: Array<{ title: string; link: string; snippet?: string; date?: string; source?: string }> };
export type SerperSearch = {
  organic?: Array<{ title: string; link: string; snippet?: string; date?: string; subtitle?: string }>;
};

export class SerperBudgetError extends Error {}

export const serperEnabled = (): boolean => Boolean(config.serperApiKey());

export async function serperSearchesLeft(): Promise<number> {
  return config.serperMonthlyQueries - (await getUsage("serper_queries"));
}

// Serper's free plan rejects some search patterns with a 400 ("Query pattern not allowed
// for free accounts"). Rejections don't use up searches, so it is cheap to try again.
const isRefusal = (error: unknown): boolean => error instanceof HttpError && error.status === 400 && /not allowed/i.test(error.message);

async function request<T>(endpoint: "news" | "search", body: Record<string, unknown>): Promise<T> {
  const data = await fetchJson<T>(`https://google.serper.dev/${endpoint}`, {
    method: "POST",
    headers: { "x-api-key": config.serperApiKey() ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
    retries: 0,
    timeoutMs: 20_000,
  });
  await addUsage("serper_queries", 1);
  return data;
}

/**
 * Runs a search. When Serper refuses its pattern, tries again without the time filter, then
 * with just the first phrase. `ranAs` says which form ran when it wasn't the original; the
 * result is null when every form was refused.
 */
export async function serperSearch<T>(
  endpoint: "news" | "search",
  q: string,
  options: { tbs?: string; num?: number } = {},
): Promise<{ data: T; ranAs?: string; timeLimited: boolean } | null> {
  if ((await serperSearchesLeft()) <= 0) {
    throw new SerperBudgetError(`the monthly cap of ${config.serperMonthlyQueries} Serper searches is reached`);
  }
  const attempts: { q: string; tbs?: string; ranAs?: string }[] = [{ q, tbs: options.tbs }];
  if (options.tbs) attempts.push({ q, ranAs: `${q} (without the time filter)` });
  const simpler = simplerQuery(q);
  if (simpler) attempts.push({ q: simpler, ranAs: simpler });
  for (const attempt of attempts) {
    try {
      const data = await request<T>(endpoint, {
        q: attempt.q,
        ...(attempt.tbs ? { tbs: attempt.tbs } : {}),
        // Serper's free plan refuses more than 10 results per search; paid plans bill 20 as two.
        num: options.num ?? 10,
        gl: "us",
        hl: "en",
      });
      return { data, ranAs: attempt.ranAs, timeLimited: Boolean(attempt.tbs) };
    } catch (error) {
      if (!isRefusal(error)) throw error;
    }
  }
  return null;
}

/** A search's latest result, shown under it in Settings. */
export type SearchResult = QueryOutcome & { at: string };

// People matched from the news in a day, on average: up to 5 while there are new people.
const MATCHES_A_DAY = 3;

/** About how many Serper searches a topic makes in a day. */
export function dailySearches(topic: TopicConfig): number {
  const q = topic.queries;
  return q.serper.news.length + q.serper.linkedin.length + q.hashtags.length + q.serper.profiles.length / 7 + MATCHES_A_DAY;
}

/**
 * How much longer than planned to wait between searches, so every active topic's searches fit
 * in what's left of this month's cap: 1 is as planned, 2.5 is two and a half times as long.
 */
export function searchPace(plannedPerDay: number, left: number, now = Date.now()): number {
  if (left <= 0 || plannedPerDay <= 0) return 1;
  const date = new Date(now);
  const daysLeft = Math.max(1, (Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - now) / 86_400_000);
  return Math.max(1, plannedPerDay / (left / daysLeft));
}

const resultsKey = (topicId: number) => `serper:results:${topicId}`;

/** Each of a topic's searches' latest result. */
export async function searchResults(topicId: number): Promise<Record<string, SearchResult>> {
  return (await getKv<Record<string, SearchResult>>(resultsKey(topicId))) ?? {};
}

/**
 * When each of a topic's searches last ran and what it found. Each runs at most once per
 * interval, stretched by the pace when the month's cap is tight.
 */
export async function searchSchedule(topicId: number) {
  const runsKey = `serper:last-run:${topicId}`;
  const [lastRuns, results, topics, left] = await Promise.all([
    getKv<Record<string, string>>(runsKey),
    searchResults(topicId),
    listTopics(),
    serperSearchesLeft(),
  ]);
  const last = lastRuns ?? {};
  const planned = topics.filter((t) => t.active).reduce((n, t) => n + dailySearches(t.config), 0);
  const pace = searchPace(planned, left);
  return {
    pace,
    /** "once a day", or "about every 2.5 days" when the cap is tight. */
    every: (intervalMs: number) => {
      const days = (intervalMs * pace) / 86_400_000;
      return pace <= 1.05 ? null : `about every ${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
    },
    due: (search: string, intervalMs: number) => !last[search] || Date.now() - Date.parse(last[search]) >= intervalMs * pace,
    ran: (search: string) => {
      last[search] = new Date().toISOString();
    },
    note: (search: string, outcome: QueryOutcome) => {
      results[search] = { ...outcome, at: new Date().toISOString() };
    },
    save: () => Promise.all([setKv(runsKey, last), setKv(resultsKey(topicId), results)]),
  };
}
