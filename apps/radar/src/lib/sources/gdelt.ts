import { fetchJson, HttpError, sleep } from "@/lib/http";
import { domainOf } from "@/lib/url";
import type { Connector, RawItem } from "./types";

type GdeltResponse = {
  articles?: Array<{
    url: string;
    title: string;
    seendate: string; // 20260924T123000Z
    domain: string;
    language?: string;
    sourcecountry?: string;
  }>;
};

function parseSeenDate(value: string): Date | undefined {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

// GDELT DOC 2.0: free global news index (commercial use allowed with attribution).
// It asks for at most one request every five seconds.
export const gdelt: Connector = {
  id: "gdelt",
  label: "GDELT",
  async collect({ topic, lookbackHours, log }) {
    const queries = topic.config.queries.gdelt;
    const timespan = `${Math.min(lookbackHours, 24 * 90)}h`;
    const out: RawItem[] = [];
    for (const [i, query] of queries.entries()) {
      if (i > 0) await sleep(5500);
      const url =
        "https://api.gdeltproject.org/api/v2/doc/doc?" +
        new URLSearchParams({
          query: `${query} sourcelang:english`,
          mode: "ArtList",
          format: "json",
          maxrecords: "75",
          timespan,
          sort: "DateDesc",
        });
      try {
        let data: GdeltResponse;
        try {
          data = await fetchJson<GdeltResponse>(url, { timeoutMs: 20_000, retries: 0 });
        } catch (error) {
          // Shared cloud IPs often trip GDELT's one-request-per-5-seconds limit. Wait, retry once.
          if (!(error instanceof HttpError && error.status === 429)) throw error;
          await sleep(6500);
          data = await fetchJson<GdeltResponse>(url, { timeoutMs: 20_000, retries: 0 });
        }
        for (const a of data.articles ?? []) {
          out.push({
            source: "gdelt",
            url: a.url,
            title: a.title,
            outlet: a.domain,
            sourceKey: domainOf(a.url) ?? a.domain,
            sourceKind: "publication",
            publishedAt: parseSeenDate(a.seendate),
            matchedQuery: query,
            applyKeywordFilter: false,
          });
        }
      } catch (error) {
        // GDELT answers malformed queries with a plain-text message instead of JSON.
        const message = error instanceof HttpError ? error.message : `unexpected response (${(error as Error).message})`;
        log(`gdelt "${query}": ${message}`);
      }
    }
    return out;
  },
};
