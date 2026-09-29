import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { getDb } from "@/db";
import {
  items,
  linkedinProfiles,
  orgMentions,
  orgs,
  people,
  personMentions,
  runs,
  sources,
  stories,
  topics,
  type Item,
  type Run,
  type Topic,
} from "@/db/schema";
import { fallbackGuide } from "@/lib/ai/prompts";
import { config, localDate, timeZone } from "@/lib/config";
import { defaultTopics } from "@/lib/topics/defaults";
import { getTopic, listTopics } from "@/lib/topics/store";
import { searchResults } from "@/lib/sources/serper-client";
import { domainOf } from "@/lib/url";
import { getMonthUsage } from "@/lib/usage";
import { changedAt, RADAR_TAG } from "./changes";
import { followState, isFollowable, sourceLink } from "./follow";
import {
  streamOf,
  type ConsoleData,
  type DailyCount,
  type EntityRef,
  type ItemDTO,
  type LiveStatus,
  type MentionDTO,
  type OrgDTO,
  type PersonDTO,
  type RunDTO,
  type SourceDTO,
  type StoryDTO,
  type TopicDTO,
  type TopicSummaries,
} from "./types";

// Bump when the payload shape changes: cached payloads outlive deployments.
const PAYLOAD_VERSION = "console-v3";
// Cached payloads refresh on their own at least this often, in the background.
const REVALIDATE_SECONDS = 900;
const ITEM_DAYS = 30;
const MAX_ITEMS = 500;
const MAX_BRIEFS = 14;
// Next's data cache stores entries up to 2 MB.
const MAX_PAYLOAD_CHARS = 1_600_000;
const STALE_RUN_MS = 12 * 60_000;

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

function clip(text: string | null | undefined, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Timestamps compared in SQL go in as ISO strings, which both database drivers accept. */
const at = (date: Date) => sql`${date.toISOString()}::timestamptz`;
const itemTime = sql`coalesce(${items.publishedAt}, ${items.collectedAt})`;

export function toTopicDTO(topic: Topic): TopicDTO {
  return {
    id: topic.id,
    slug: topic.slug,
    name: topic.name,
    description: topic.description,
    active: topic.active,
    config: topic.config,
    updatedAt: topic.updatedAt.toISOString(),
    hasDefaults: defaultTopics.some((t) => t.slug === topic.slug),
    guideDefaults: fallbackGuide(topic),
  };
}

export function toRunDTO(run: Run, now = Date.now()): RunDTO {
  const stats = run.stats ?? {};
  // A run still marked "running" long after it started was cut off by the platform.
  const stale = run.status === "running" && now - run.startedAt.getTime() > STALE_RUN_MS;
  return {
    id: run.id,
    stage: run.stage,
    trigger: run.trigger,
    status: stale ? "timeout" : run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: iso(run.finishedAt),
    error: run.error,
    notes: stats.notes ?? [],
    connectors: stats.connectors ?? null,
    counts: {
      triaged: stats.triaged,
      relevant: stats.relevant,
      extracted: stats.extracted,
      stories: stats.stories,
      prefiltered: stats.prefiltered,
    },
    aiSkipped: stats.aiSkipped ?? null,
    progress: stats.progress ?? null,
  };
}

/** Social sources are keyed by platform ("x:@handle", "reddit:r/name"); websites by domain. */
function connectorOfKey(key: string): string {
  if (key.startsWith("x:@")) return "x";
  if (key.startsWith("reddit:")) return "reddit";
  if (key.startsWith("linkedin:")) return "linkedin";
  return "web";
}

/** The last 14 dates in the team's timezone, oldest first. */
function lastDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) days.push(localDate(new Date(Date.now() - i * 86_400_000)));
  return [...new Set(days)];
}

async function buildConsoleData(topicId: number): Promise<ConsoleData | null> {
  const generatedAt = new Date().toISOString();
  const topic = await getTopic(topicId);
  if (!topic) return null;
  const db = await getDb();
  const threshold = topic.config.relevanceThreshold;
  const since = new Date(Date.now() - ITEM_DAYS * 86_400_000);
  const since14 = new Date(Date.now() - 15 * 86_400_000);
  const day = sql<string>`to_char((${itemTime} at time zone ${timeZone}), 'YYYY-MM-DD')`;

  const [itemRows, storyRows, personRows, orgRows, sourceRows, runRows, usage, dailyRows, totalRows, profileRows, searches] = await Promise.all([
    db
      .select({ item: items, kind: sources.kind })
      .from(items)
      .leftJoin(sources, eq(sources.key, items.sourceKey))
      .where(and(eq(items.topicId, topicId), sql`${itemTime} >= ${at(since)}`))
      .orderBy(sql`${itemTime} desc`, desc(items.id))
      .limit(MAX_ITEMS),
    db
      .select()
      .from(stories)
      .where(eq(stories.topicId, topicId))
      .orderBy(desc(stories.briefDate), stories.rank)
      .limit(MAX_BRIEFS * 10),
    db
      .select({
        id: people.id,
        name: people.name,
        role: people.role,
        orgName: people.orgName,
        linkedinUrl: people.linkedinUrl,
        linkedinHeadline: people.linkedinHeadline,
        xHandle: people.xHandle,
        watched: people.watched,
        lastSeenAt: people.lastSeenAt,
        itemId: personMentions.itemId,
        relation: personMentions.relation,
        mentionRole: personMentions.role,
        mentionOrg: personMentions.orgName,
        quote: personMentions.quote,
      })
      .from(personMentions)
      .innerJoin(items, eq(items.id, personMentions.itemId))
      .innerJoin(people, eq(people.id, personMentions.personId))
      .where(eq(items.topicId, topicId))
      .orderBy(desc(personMentions.createdAt))
      .limit(4000),
    db
      .select({
        id: orgs.id,
        name: orgs.name,
        kind: orgs.kind,
        watched: orgs.watched,
        lastSeenAt: orgs.lastSeenAt,
        itemId: orgMentions.itemId,
        relation: orgMentions.relation,
      })
      .from(orgMentions)
      .innerJoin(items, eq(items.id, orgMentions.itemId))
      .innerJoin(orgs, eq(orgs.id, orgMentions.orgId))
      .where(eq(items.topicId, topicId))
      .orderBy(desc(orgMentions.createdAt))
      .limit(4000),
    db
      .select({
        id: sources.id,
        key: sources.key,
        name: sources.name,
        kind: sources.kind,
        homepage: sources.homepage,
        feedUrl: sources.feedUrl,
        followed: sources.followed,
        items: sql<number>`count(${items.id})::int`,
        relevant: sql<number>`(count(*) filter (where ${items.relevance} >= ${threshold}))::int`,
        origins: sql<number>`(count(*) filter (where ${items.relevance} >= ${threshold} and ${items.isOrigin}))::int`,
        latestMs: sql<number | null>`(extract(epoch from max(${itemTime})) * 1000)::float8`,
      })
      .from(items)
      .innerJoin(sources, eq(sources.key, items.sourceKey))
      .where(eq(items.topicId, topicId))
      .groupBy(sources.id),
    db.select().from(runs).where(eq(runs.topicId, topicId)).orderBy(desc(runs.startedAt)).limit(25),
    getMonthUsage(),
    db
      .select({
        date: day,
        items: sql<number>`count(*)::int`,
        relevant: sql<number>`(count(*) filter (where ${items.relevance} >= ${threshold}))::int`,
      })
      .from(items)
      .where(and(eq(items.topicId, topicId), sql`${itemTime} >= ${at(since14)}`))
      .groupBy(sql`1`),
    db
      .select({
        items: sql<number>`count(*)::int`,
        scored: sql<number>`count(${items.relevance})::int`,
        relevant: sql<number>`(count(*) filter (where ${items.relevance} >= ${threshold}))::int`,
        origins: sql<number>`(count(*) filter (where ${items.relevance} >= ${threshold} and ${items.isOrigin}))::int`,
      })
      .from(items)
      .where(eq(items.topicId, topicId)),
    db
      .select()
      .from(linkedinProfiles)
      .where(eq(linkedinProfiles.topicId, topicId))
      .orderBy(desc(linkedinProfiles.lastSeenAt), desc(linkedinProfiles.id))
      .limit(300),
    searchResults(topicId),
  ]);

  // Stories: the latest briefs.
  const briefDates = [...new Set(storyRows.map((s) => s.briefDate))].slice(0, MAX_BRIEFS);
  const storyDTOs: StoryDTO[] = storyRows
    .filter((s) => briefDates.includes(s.briefDate))
    .map((s) => ({
      id: s.id,
      briefDate: s.briefDate,
      rank: s.rank,
      title: s.title,
      summary: s.summary,
      whyItMatters: s.whyItMatters,
      originItemId: s.originItemId,
      itemIds: s.itemIds,
      peopleNames: s.peopleNames,
      orgNames: s.orgNames,
    }));

  // People in this topic, with how they appear and their most useful mentions.
  const personById = new Map<number, PersonDTO>();
  const peopleByItem = new Map<number, EntityRef[]>();
  for (const row of personRows) {
    let person = personById.get(row.id);
    if (!person) {
      person = {
        id: row.id,
        name: row.name,
        role: row.role,
        orgName: row.orgName,
        linkedinUrl: row.linkedinUrl,
        linkedinHeadline: row.linkedinHeadline,
        xHandle: row.xHandle,
        watched: row.watched,
        lastSeenAt: row.lastSeenAt.toISOString(),
        mentions: 0,
        relations: {},
        voice: false,
        recent: [],
      };
      personById.set(row.id, person);
    }
    person.mentions += 1;
    person.relations[row.relation] = (person.relations[row.relation] ?? 0) + 1;
    if (row.relation !== "mentioned") person.voice = true;
    const mention: MentionDTO = {
      itemId: row.itemId,
      relation: row.relation,
      role: row.mentionRole,
      org: row.mentionOrg,
      quote: clip(row.quote, 400),
    };
    person.recent.push(mention);
    const refs = peopleByItem.get(row.itemId) ?? [];
    const existing = refs.find((r) => r.id === row.id);
    if (!existing) refs.push({ id: row.id, name: row.name, relation: row.relation });
    else if (existing.relation === "mentioned") existing.relation = row.relation;
    peopleByItem.set(row.itemId, refs);
  }
  const relationRank = (r: string) => (r === "mentioned" ? 1 : 0);
  const peopleDTOs = [...personById.values()]
    .map((p) => ({
      ...p,
      // Quotes and first-hand appearances first, then the most recent.
      recent: p.recent.sort((a, b) => relationRank(a.relation) - relationRank(b.relation) || Number(Boolean(b.quote)) - Number(Boolean(a.quote))).slice(0, 10),
    }))
    .sort((a, b) => Number(b.voice) - Number(a.voice) || b.mentions - a.mentions || b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 300);

  const orgById = new Map<number, OrgDTO>();
  const orgsByItem = new Map<number, EntityRef[]>();
  for (const row of orgRows) {
    let org = orgById.get(row.id);
    if (!org) {
      org = { id: row.id, name: row.name, kind: row.kind, watched: row.watched, lastSeenAt: row.lastSeenAt.toISOString(), mentions: 0, relations: {}, itemIds: [] };
      orgById.set(row.id, org);
    }
    org.mentions += 1;
    org.relations[row.relation] = (org.relations[row.relation] ?? 0) + 1;
    if (org.itemIds.length < 12 && !org.itemIds.includes(row.itemId)) org.itemIds.push(row.itemId);
    const refs = orgsByItem.get(row.itemId) ?? [];
    if (!refs.some((r) => r.id === row.id)) refs.push({ id: row.id, name: row.name, relation: row.relation });
    orgsByItem.set(row.itemId, refs);
  }
  const orgDTOs = [...orgById.values()].sort((a, b) => b.mentions - a.mentions || b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 200);

  // Items referenced by stories, people or organizations but older than the window.
  const loaded = new Map(itemRows.map((r) => [r.item.id, r]));
  const referenced = new Set<number>([
    ...storyDTOs.flatMap((s) => s.itemIds),
    ...peopleDTOs.flatMap((p) => p.recent.map((m) => m.itemId)),
    ...orgDTOs.flatMap((o) => o.itemIds),
  ]);
  const missing = [...referenced].filter((id) => !loaded.has(id)).slice(0, 300);
  if (missing.length) {
    const extra = await db
      .select({ item: items, kind: sources.kind })
      .from(items)
      .leftJoin(sources, eq(sources.key, items.sourceKey))
      .where(and(eq(items.topicId, topicId), inArray(items.id, missing)));
    for (const row of extra) loaded.set(row.item.id, row);
  }

  // The topic's own feed settings say what kind of outlet a site is; they beat first sightings.
  const kindByDomain = new Map<string, string>();
  for (const feed of topic.config.feeds) {
    const domain = domainOf(feed.url);
    if (domain && feed.kind && !kindByDomain.has(domain)) kindByDomain.set(domain, feed.kind);
  }
  const kindOf = (sourceKey: string, stored: string | null) => kindByDomain.get(sourceKey) ?? stored ?? "publication";

  const toItemDTO = ({ item, kind }: { item: Item; kind: string | null }): ItemDTO => {
    const sourceKind = kindOf(item.sourceKey, kind);
    return {
      id: item.id,
      source: item.source,
      sourceKey: item.sourceKey,
      sourceKind,
      stream: streamOf(item.source, sourceKind),
      outlet: item.outlet,
      title: item.title,
      href: item.resolvedUrl ?? item.url,
      snippet: clip(item.snippet, 360),
      gist: clip(item.gist, 300),
      summary: clip(item.summary, 900),
      whyItMatters: clip(item.whyItMatters, 400),
      author: item.author,
      authorUrl: item.authorUrl,
      publishedAt: iso(item.publishedAt),
      collectedAt: item.collectedAt.toISOString(),
      relevance: item.relevance,
      category: item.category,
      isOrigin: item.isOrigin,
      originHint: clip(item.originHint, 300),
      primarySources: (item.primarySources ?? []).slice(0, 6),
      engagement: item.engagement,
      matchedQuery: item.matchedQuery,
      people: peopleByItem.get(item.id) ?? [],
      orgs: (orgsByItem.get(item.id) ?? []).slice(0, 8),
    };
  };
  const byTime = (a: ItemDTO, b: ItemDTO) => (b.publishedAt ?? b.collectedAt).localeCompare(a.publishedAt ?? a.collectedAt) || b.id - a.id;
  let itemDTOs = [...loaded.values()].map(toItemDTO).sort(byTime);

  const sourceDTOs: SourceDTO[] = sourceRows
    .map((s) => {
      const state = followState(s, topic.config);
      const kind = kindOf(s.key, s.kind);
      return {
        id: s.id,
        key: s.key,
        name: s.name,
        kind,
        stream: streamOf(connectorOfKey(s.key), kind),
        link: sourceLink(s.key, s.homepage),
        feedUrl: state.feedUrl,
        followed: state.followed,
        followable: isFollowable(s.key),
        items: s.items,
        relevant: s.relevant,
        origins: s.origins,
        latestAt: s.latestMs ? new Date(Number(s.latestMs)).toISOString() : null,
      };
    })
    .sort((a, b) => b.origins - a.origins || b.relevant - a.relevant || b.items - a.items)
    .slice(0, 400);

  const dailyByDate = new Map(dailyRows.map((d) => [d.date, d]));
  const daily: DailyCount[] = lastDays(14).map((date) => ({
    date,
    items: dailyByDate.get(date)?.items ?? 0,
    relevant: dailyByDate.get(date)?.relevant ?? 0,
  }));

  const data: ConsoleData = {
    generatedAt,
    topic: toTopicDTO(topic),
    items: itemDTOs,
    stories: storyDTOs,
    briefDates,
    people: peopleDTOs,
    orgs: orgDTOs,
    profiles: profileRows.map((p) => ({
      id: p.id,
      vanity: p.vanity,
      url: p.url,
      name: p.name,
      headline: p.headline,
      company: p.company,
      location: p.location,
      about: clip(p.about, 400),
      matchedQuery: p.matchedQuery,
      firstSeenAt: p.firstSeenAt.toISOString(),
      lastSeenAt: p.lastSeenAt.toISOString(),
    })),
    searches,
    sources: sourceDTOs,
    runs: runRows.map((r) => toRunDTO(r)),
    spend: {
      model: config.model,
      ai: { enabled: config.aiEnabled(), usd: (usage.ai_cost_microusd ?? 0) / 1_000_000, capUsd: config.aiMonthlyBudgetUsd },
      x: { enabled: Boolean(config.xBearerToken()), usd: (usage.x_cost_microusd ?? 0) / 1_000_000, capUsd: config.xMonthlyBudgetUsd },
      serper: { enabled: Boolean(config.serperApiKey()), queries: usage.serper_queries ?? 0, cap: config.serperMonthlyQueries },
    },
    daily,
    totals: totalRows[0] ?? { items: 0, scored: 0, relevant: 0, origins: 0 },
  };

  // Stay under the cache's entry limit by dropping the oldest items nothing else points to.
  while (JSON.stringify(data).length > MAX_PAYLOAD_CHARS && itemDTOs.length > 50) {
    const keep = itemDTOs.filter((i) => referenced.has(i.id));
    const rest = itemDTOs.filter((i) => !referenced.has(i.id));
    itemDTOs = [...keep, ...rest.slice(0, Math.max(0, rest.length - 50))].sort(byTime);
    data.items = itemDTOs;
    if (!rest.length) break;
  }
  return data;
}

async function buildTopicSummaries(): Promise<TopicSummaries> {
  const generatedAt = new Date().toISOString();
  const all = await listTopics();
  const db = await getDb();
  const since24 = new Date(Date.now() - 86_400_000);
  const since14 = new Date(Date.now() - 15 * 86_400_000);
  const day = sql<string>`to_char((${itemTime} at time zone ${timeZone}), 'YYYY-MM-DD')`;
  const topicThreshold = sql`coalesce((${topics.config}->>'relevanceThreshold')::int, 55)`;

  const [counts, sparkRows, lastRuns] = await Promise.all([
    db
      .select({
        topicId: items.topicId,
        items: sql<number>`count(*)::int`,
        new24h: sql<number>`(count(*) filter (where ${itemTime} >= ${at(since24)}))::int`,
        relevant24h: sql<number>`(count(*) filter (where ${itemTime} >= ${at(since24)} and ${items.relevance} >= ${topicThreshold}))::int`,
      })
      .from(items)
      .innerJoin(topics, eq(topics.id, items.topicId))
      .groupBy(items.topicId),
    db
      .select({ topicId: items.topicId, date: day, n: sql<number>`count(*)::int` })
      .from(items)
      .where(sql`${itemTime} >= ${at(since14)}`)
      .groupBy(sql`1, 2`),
    db
      .selectDistinctOn([runs.topicId], { topicId: runs.topicId, status: runs.status, stage: runs.stage, startedAt: runs.startedAt })
      .from(runs)
      .orderBy(runs.topicId, desc(runs.startedAt)),
  ]);

  const days = lastDays(14);
  const summaries = all.map((topic) => {
    const c = counts.find((row) => row.topicId === topic.id);
    const spark = new Map(sparkRows.filter((r) => r.topicId === topic.id).map((r) => [r.date, r.n]));
    const last = lastRuns.find((r) => r.topicId === topic.id);
    return {
      id: topic.id,
      slug: topic.slug,
      name: topic.name,
      active: topic.active,
      items: c?.items ?? 0,
      new24h: c?.new24h ?? 0,
      relevant24h: c?.relevant24h ?? 0,
      spark: days.map((d) => spark.get(d) ?? 0),
      lastRun: last ? { status: last.status, stage: last.stage, at: last.startedAt.toISOString() } : null,
    };
  });
  return { generatedAt, topics: summaries };
}

/** One topic's whole console, from Next's data cache. Refreshed after runs and edits. */
export function getConsoleData(topicId: number): Promise<ConsoleData | null> {
  return unstable_cache(() => buildConsoleData(topicId), [PAYLOAD_VERSION, "console", String(topicId)], {
    tags: [RADAR_TAG],
    revalidate: REVALIDATE_SECONDS,
  })();
}

export const getTopicSummaries = unstable_cache(buildTopicSummaries, [PAYLOAD_VERSION, "summaries"], {
  tags: [RADAR_TAG],
  revalidate: REVALIDATE_SECONDS,
});

/** Straight from the database, for a console that knows its copy is out of date. */
export const freshConsoleData = buildConsoleData;
export const freshTopicSummaries = buildTopicSummaries;

/** Cheap and uncached: which runs are going, and when data last changed. */
export async function liveStatus(): Promise<LiveStatus> {
  const db = await getDb();
  const now = Date.now();
  const [running, changed] = await Promise.all([
    db
      .select()
      .from(runs)
      .where(and(eq(runs.status, "running"), sql`${runs.startedAt} >= ${at(new Date(now - STALE_RUN_MS))}`))
      .orderBy(desc(runs.startedAt)),
    changedAt(),
  ]);
  const seen = new Set<number>();
  const active = running.filter((r) => !seen.has(r.topicId) && seen.add(r.topicId));
  return {
    now: new Date(now).toISOString(),
    changedAt: changed,
    running: active.map((run) => ({ topicId: run.topicId, run: toRunDTO(run, now) })),
  };
}
