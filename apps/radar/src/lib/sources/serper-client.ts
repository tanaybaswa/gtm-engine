import { config } from "@/lib/config";
import { fetchJson, HttpError } from "@/lib/http";
import { getKv, setKv } from "@/lib/kv";
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

/** When each of a topic's searches last ran, so each runs at most once per interval. */
export async function searchSchedule(topicId: number) {
  const key = `serper:last-run:${topicId}`;
  const last = (await getKv<Record<string, string>>(key)) ?? {};
  return {
    due: (search: string, intervalMs: number) => !last[search] || Date.now() - Date.parse(last[search]) >= intervalMs,
    lastRun: (search: string) => last[search],
    ran: (search: string) => {
      last[search] = new Date().toISOString();
    },
    save: () => setKv(key, last),
  };
}
