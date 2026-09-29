import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { items, sources, type ConnectorStat, type NewItem, type QueryOutcome, type Topic } from "@/db/schema";
import { connectors, type RawItem } from "@/lib/sources";
import { compileKeywordFilter, titleKey, truncate } from "@/lib/text";
import { canonicalizeUrl, domainOf, isHttpUrl } from "@/lib/url";
import type { Deadline, ProgressUpdate } from "./runs";

export type CollectResult = {
  connectors: Record<string, ConnectorStat>;
  prefiltered: number;
  inserted: number;
  notes: string[];
};

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function toRow(topicId: number, raw: RawItem): NewItem | null {
  if (!isHttpUrl(raw.url) || !raw.title?.trim()) return null;
  const canonicalUrl = canonicalizeUrl(raw.url);
  return {
    topicId,
    source: raw.source,
    externalId: raw.externalId ? truncate(raw.externalId, 300) : null,
    url: raw.url,
    canonicalUrl,
    titleKey: titleKey(raw.title),
    title: truncate(raw.title.trim(), 400),
    snippet: raw.snippet ? truncate(raw.snippet, 1200) : null,
    author: raw.author ?? null,
    authorUrl: raw.authorUrl ?? null,
    outlet: raw.outlet ?? null,
    sourceKey: raw.sourceKey ?? domainOf(raw.url) ?? "unknown",
    publishedAt: raw.publishedAt && raw.publishedAt.getTime() <= Date.now() + 3_600_000 ? raw.publishedAt : null,
    engagement: raw.engagement ?? null,
    matchedQuery: raw.matchedQuery ?? null,
    // Google News links are redirects; direct links resolve to themselves.
    resolvedUrl: raw.source === "google_news" ? null : raw.url,
  };
}

/** Runs every available connector for a topic and stores new, on-topic items. */
export async function collectTopic(
  topic: Topic,
  deadline: Deadline,
  log: (m: string) => void,
  onProgress: (p: ProgressUpdate) => void = () => {},
): Promise<CollectResult> {
  const db = await getDb();
  const lookbackHours = topic.config.lookbackHours;
  const since = new Date(Date.now() - lookbackHours * 3_600_000);
  const keywords = compileKeywordFilter(topic.config.keywords);
  const stats: Record<string, ConnectorStat> = {};
  const notes: string[] = [];

  let finished = 0;
  const settled = await Promise.all(
    connectors.map(async (connector) => {
      const started = Date.now();
      const reason = connector.unavailable?.();
      if (reason) {
        stats[connector.id] = { fetched: 0, inserted: 0, skipped: reason, ms: 0 };
        return [] as RawItem[];
      }
      const messages: string[] = [];
      const infos: string[] = [];
      const queries: Record<string, QueryOutcome> = {};
      const extras = () => ({
        ...(Object.keys(queries).length ? { queries } : {}),
        ...(infos.length ? { info: truncate(infos.join("; "), 300) } : {}),
      });
      try {
        const found = await withTimeout(
          connector.collect({
            topic,
            since,
            lookbackHours,
            log: (m) => messages.push(m),
            noteQuery: (key, outcome) => (queries[key] = outcome),
            info: (m) => infos.push(m),
          }),
          Math.max(10_000, Math.min(150_000, deadline.remainingMs - 30_000)),
          connector.label,
        );
        stats[connector.id] = { fetched: found.length, inserted: 0, ms: Date.now() - started, ...extras() };
        if (messages.length) stats[connector.id].error = truncate(messages.join("; "), 500);
        return found;
      } catch (error) {
        stats[connector.id] = { fetched: 0, inserted: 0, error: (error as Error).message, ms: Date.now() - started, ...extras() };
        return [] as RawItem[];
      } finally {
        messages.forEach((m) => log(m));
        finished += 1;
        onProgress({ phase: "collect", done: finished, total: connectors.length, detail: connector.label });
      }
    }),
  );

  // Exclusions apply to everything. Keyword groups apply to general sources (trade-press
  // feeds, subreddits, Hacker News); topic searches are already scoped by their query.
  let prefiltered = 0;
  const byUrl = new Map<string, NewItem>();
  for (const raw of settled.flat()) {
    const text = `${raw.title} ${raw.snippet ?? ""}`;
    if (keywords.excluded(text) || (raw.applyKeywordFilter !== false && !keywords.matchesGroups(text))) {
      prefiltered += 1;
      continue;
    }
    const row = toRow(topic.id, raw);
    if (!row) continue;
    const existing = byUrl.get(row.canonicalUrl);
    // Prefer the richer record when two connectors return the same URL.
    if (!existing || (!existing.snippet && row.snippet)) byUrl.set(row.canonicalUrl, row);
  }

  // The same article often arrives twice: once as a Google News redirect and once with its
  // publisher link (GDELT, Serper, RSS). Match on headline + outlet and keep one row,
  // borrowing the direct link for the Google News copy.
  const candidates = [...byUrl.values()];
  const keys = [...new Set(candidates.map((c) => c.titleKey))];
  const existingRows = keys.length
    ? await db
        .select({ id: items.id, titleKey: items.titleKey, sourceKey: items.sourceKey, resolvedUrl: items.resolvedUrl })
        .from(items)
        .where(and(eq(items.topicId, topic.id), inArray(items.titleKey, keys)))
    : [];
  const stored = new Map(existingRows.map((r) => [`${r.titleKey}|${r.sourceKey}`, r]));
  const freshByKey = new Map<string, NewItem>();
  for (const row of candidates) {
    const key = `${row.titleKey}|${row.sourceKey}`;
    const match = stored.get(key);
    if (match) {
      if (!match.resolvedUrl && row.resolvedUrl) {
        await db.update(items).set({ resolvedUrl: row.resolvedUrl }).where(eq(items.id, match.id));
        match.resolvedUrl = row.resolvedUrl;
      }
      continue;
    }
    const pending = freshByKey.get(key);
    if (!pending) {
      freshByKey.set(key, row);
    } else if (pending.source === "google_news" && row.source !== "google_news") {
      // Keep the copy with the publisher's own link.
      freshByKey.set(key, { ...row, snippet: row.snippet ?? pending.snippet, publishedAt: row.publishedAt ?? pending.publishedAt });
    } else if (!pending.snippet && row.snippet) {
      pending.snippet = row.snippet;
    }
  }
  const fresh = [...freshByKey.values()];

  let inserted: { id: number; source: string; sourceKey: string }[] = [];
  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    const rows = await db
      .insert(items)
      .values(chunk)
      .onConflictDoNothing({ target: [items.topicId, items.canonicalUrl] })
      .returning({ id: items.id, source: items.source, sourceKey: items.sourceKey });
    inserted = inserted.concat(rows);
  }

  for (const row of inserted) {
    const stat = stats[row.source === "linkedin" ? "serper_news" : row.source];
    if (stat) stat.inserted += 1;
  }

  // Keep a record of every source we've seen, with counts.
  const rawByKey = new Map<string, RawItem>();
  for (const raw of settled.flat()) if (raw.sourceKey && !rawByKey.has(raw.sourceKey)) rawByKey.set(raw.sourceKey, raw);
  const countByKey = new Map<string, number>();
  for (const row of inserted) countByKey.set(row.sourceKey, (countByKey.get(row.sourceKey) ?? 0) + 1);
  const sourceRows = [...countByKey.entries()].map(([key, count]) => {
    const raw = rawByKey.get(key);
    return {
      key,
      name: truncate(raw?.outlet ?? key, 120),
      kind: raw?.sourceKind ?? "publication",
      homepage: raw?.sourceHomepage ?? null,
      feedUrl: raw?.feedUrl ?? null,
      itemCount: count,
    };
  });
  for (let i = 0; i < sourceRows.length; i += 100) {
    await db
      .insert(sources)
      .values(sourceRows.slice(i, i + 100))
      .onConflictDoUpdate({
        target: sources.key,
        set: {
          itemCount: sql`${sources.itemCount} + excluded.item_count`,
          lastSeenAt: sql`now()`,
          homepage: sql`coalesce(${sources.homepage}, excluded.homepage)`,
          feedUrl: sql`coalesce(${sources.feedUrl}, excluded.feed_url)`,
        },
      });
  }

  if (prefiltered) notes.push(`${prefiltered} off-topic items dropped by the keyword filter`);
  return { connectors: stats, prefiltered, inserted: inserted.length, notes };
}
