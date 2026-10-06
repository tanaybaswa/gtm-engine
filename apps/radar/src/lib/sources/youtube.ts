import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { items, type QueryOutcome } from "@/db/schema";
import { config } from "@/lib/config";
import { fetchJson, fetchText, HttpError } from "@/lib/http";
import { getKv, setKv } from "@/lib/kv";
import { decodeEntities } from "@/lib/text";
import { addUsage, getUsage } from "@/lib/usage";
import type { Connector, RawItem } from "./types";

// YouTube through its official Data API, with a free key: about 100 searches a day, and video
// details at 1 unit per 50 videos out of 10,000 units a day. Channels are read through their
// public feeds, which need no key and cost nothing.

const API = "https://www.googleapis.com/youtube/v3";
// Each search runs at most once a day per topic.
const SEARCH_EVERY_MS = 20 * 3_600_000;
// Searches and channel feeds look back two weeks: YouTube indexes videos late, and repeats are dropped.
const WINDOW_MS = 14 * 86_400_000;

export class YouTubeQuotaError extends Error {}

export const youtubeEnabled = (): boolean => Boolean(config.youtubeApiKey());

/** YouTube's quota resets at midnight Pacific time, so searches are counted per Pacific day. */
export const youtubeDay = (date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

export async function youtubeSearchesToday(): Promise<number> {
  return getUsage("youtube_searches", youtubeDay());
}

type Thumbnail = { url: string; width?: number; height?: number };
export type YouTubeVideo = {
  id: string;
  snippet?: {
    publishedAt: string;
    channelId: string;
    channelTitle: string;
    title: string;
    description?: string;
    tags?: string[];
    liveBroadcastContent?: string;
    thumbnails?: Record<string, Thumbnail>;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};
type SearchResponse = { items?: { id?: { videoId?: string } }[] };
type VideosResponse = { items?: YouTubeVideo[] };
type ChannelsResponse = { items?: { id: string; snippet?: { title?: string } }[] };

// The key goes in a header, never the URL: request URLs end up in error messages and Health.
async function api<T>(path: string, params: Record<string, string>): Promise<T> {
  try {
    return await fetchJson<T>(`${API}/${path}?${new URLSearchParams(params)}`, {
      headers: { "x-goog-api-key": config.youtubeApiKey() ?? "" },
      retries: 0,
      timeoutMs: 20_000,
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 403 && /quota/i.test(error.message)) {
      throw new YouTubeQuotaError("YouTube's daily quota is used up. Searching resumes tomorrow.");
    }
    throw error;
  }
}

/** Video ids for a search, most relevant first, from the last two weeks. */
export async function searchVideos(q: string, publishedAfter: Date): Promise<string[]> {
  if ((await youtubeSearchesToday()) >= config.youtubeDailySearches) {
    throw new YouTubeQuotaError(`The daily cap of ${config.youtubeDailySearches} YouTube searches is reached. Searching resumes tomorrow.`);
  }
  // Google counts a search even when it fails, so count it first.
  await addUsage("youtube_searches", 1, youtubeDay());
  const data = await api<SearchResponse>("search", {
    part: "id",
    type: "video",
    q,
    maxResults: "25",
    order: "relevance",
    relevanceLanguage: "en",
    publishedAfter: publishedAfter.toISOString(),
  });
  return (data.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => Boolean(id));
}

/** Title, description, length and counts for up to any number of videos, 50 per call. */
export async function videoDetails(ids: string[]): Promise<YouTubeVideo[]> {
  const out: YouTubeVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    await addUsage("youtube_units", 1, youtubeDay());
    const data = await api<VideosResponse>("videos", { part: "snippet,contentDetails,statistics", id: ids.slice(i, i + 50).join(","), maxResults: "50" });
    out.push(...(data.items ?? []));
  }
  return out;
}

/** "PT1H5M44S" -> 3944. Null when YouTube gives no length (a live stream). */
export function durationSeconds(iso: string | undefined): number | null {
  const m = iso?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [days, hours, minutes, seconds] = m.slice(1).map((v) => Number(v ?? 0));
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

/** Shorts are a minute or less, or say so; they rarely carry anything worth a brief. */
export function isShort(video: YouTubeVideo, seconds: number | null): boolean {
  const s = video.snippet;
  if (seconds !== null && seconds > 0 && seconds <= 60) return true;
  return /#shorts\b/i.test(`${s?.title ?? ""} ${s?.description ?? ""}`) || Boolean(s?.tags?.some((t) => t.toLowerCase() === "shorts"));
}

/** A description without the link and hashtag lines, which crowd out what it says. */
export function cleanDescription(text: string | undefined): string {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(https?:\/\/\S+|(#\w+\s*)+)$/i.test(line))
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const count = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));

/** A video as an item. Null for Shorts and streams that haven't started. */
export function videoItem(video: YouTubeVideo, matchedQuery: string, applyKeywordFilter: boolean, now = Date.now()): RawItem | null {
  const s = video.snippet;
  if (!s?.title || s.liveBroadcastContent === "upcoming") return null;
  const seconds = durationSeconds(video.contentDetails?.duration);
  if (isShort(video, seconds)) return null;
  const channelUrl = `https://www.youtube.com/channel/${s.channelId}`;
  const engagement = Object.fromEntries(
    Object.entries({
      views: count(video.statistics?.viewCount),
      likes: count(video.statistics?.likeCount),
      comments: count(video.statistics?.commentCount),
      durationSec: seconds ?? undefined,
      // YouTube's rules: data about other people's videos is refreshed or deleted within 30 days.
      refreshedAt: now,
    }).filter(([, v]) => typeof v === "number" && Number.isFinite(v)),
  ) as Record<string, number>;
  return {
    source: "youtube",
    externalId: video.id,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    title: s.title,
    snippet: cleanDescription(s.description) || undefined,
    author: s.channelTitle,
    authorUrl: channelUrl,
    outlet: s.channelTitle,
    sourceKey: `youtube:${s.channelId}`,
    sourceKind: "video",
    sourceHomepage: channelUrl,
    publishedAt: new Date(s.publishedAt),
    engagement,
    matchedQuery,
    applyKeywordFilter,
  };
}

export type ChannelRef = { id: string } | { handle: string } | { username: string };

/** A channel as people paste it: an ID, a channel URL, an @handle or a /user/ URL. */
export function parseChannel(input: string): ChannelRef | null {
  const s = input.trim();
  const id = s.match(/(?:^|\/channel\/)(UC[\w-]{22})(?=$|[/?#])/);
  if (id) return { id: id[1] };
  const handle = s.match(/(?:^|youtube\.com\/)@([\w.-]{3,30})/i);
  if (handle) return { handle: handle[1] };
  const user = s.match(/youtube\.com\/user\/([\w.-]+)/i);
  return user ? { username: user[1] } : null;
}

type ChannelInfo = { id: string; title?: string };

/** Turns handles into channel IDs, once: each lookup costs a unit, so answers are kept. */
async function resolveChannel(input: string, known: Record<string, ChannelInfo>): Promise<ChannelInfo | null> {
  const ref = parseChannel(input);
  if (!ref) return null;
  if ("id" in ref) return { id: ref.id, title: known[input]?.title };
  if (known[input]) return known[input];
  await addUsage("youtube_units", 1, youtubeDay());
  const data = await api<ChannelsResponse>("channels", {
    part: "snippet",
    ...("handle" in ref ? { forHandle: `@${ref.handle}` } : { forUsername: ref.username }),
  });
  const channel = data.items?.[0];
  if (!channel) return null;
  known[input] = { id: channel.id, title: channel.snippet?.title };
  return known[input];
}

/** A channel's public feed: its name and latest videos (YouTube lists 15). */
export function channelFeed(xml: string): { title: string | null; videos: { id: string; published: Date | null; short: boolean }[] } {
  const [head, ...entries] = xml.split("<entry>");
  const title = head.match(/<title>([^<]*)<\/title>/)?.[1];
  return {
    title: title ? decodeEntities(title).trim() : null,
    videos: entries.flatMap((entry) => {
      const id = entry.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
      if (!id) return [];
      const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
      const date = published ? new Date(published) : null;
      return [{ id, published: date && !Number.isNaN(date.getTime()) ? date : null, short: /youtube\.com\/shorts\//.test(entry) }];
    }),
  };
}

/** When each of a topic's YouTube searches last ran and what each search and channel found. */
async function youtubeSchedule(topicId: number) {
  const runsKey = `youtube:last-run:${topicId}`;
  const resultsKey = `youtube:results:${topicId}`;
  const [lastRuns, results] = await Promise.all([getKv<Record<string, string>>(runsKey), getKv<Record<string, YouTubeResult>>(resultsKey)]);
  const last = lastRuns ?? {};
  const found = results ?? {};
  return {
    due: (key: string) => !last[key] || Date.now() - Date.parse(last[key]) >= SEARCH_EVERY_MS,
    ran: (key: string) => {
      last[key] = new Date().toISOString();
    },
    note: (key: string, outcome: QueryOutcome) => {
      found[key] = { ...outcome, at: new Date().toISOString() };
    },
    save: () => Promise.all([setKv(runsKey, last), setKv(resultsKey, found)]),
  };
}

export type YouTubeResult = QueryOutcome & { at: string };

/** Each YouTube search's and channel's latest result, keyed youtube:<search> and channel:<channel>. */
export async function youtubeResults(topicId: number): Promise<Record<string, YouTubeResult>> {
  return (await getKv<Record<string, YouTubeResult>>(`youtube:results:${topicId}`)) ?? {};
}

/** Videos this topic already has, so their details aren't fetched again. */
async function knownVideos(topicId: number, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const db = await getDb();
  const rows = await db
    .select({ id: items.externalId })
    .from(items)
    .where(and(eq(items.topicId, topicId), eq(items.source, "youtube"), inArray(items.externalId, ids)));
  return new Set(rows.map((r) => r.id).filter((id): id is string => Boolean(id)));
}

const errorText = (error: unknown) => (error as Error).message.slice(0, 200);

export const youtube: Connector = {
  id: "youtube",
  label: "YouTube",
  unavailable: () => (youtubeEnabled() ? null : "add YOUTUBE_API_KEY to enable"),
  async collect({ topic, log, noteQuery = () => {}, info = () => {} }) {
    if (!youtubeEnabled()) return [];
    const { search, channels } = topic.config.queries.youtube;
    const after = new Date(Date.now() - WINDOW_MS);
    const schedule = await youtubeSchedule(topic.id);
    // Video id -> how it was found. Search results already match the topic; channel videos
    // go through the keyword filter, since most channels cover more than one subject.
    const found = new Map<string, { query: string; filter: boolean }>();
    const outcomes: Record<string, QueryOutcome> = {};
    let quotaHit = false;

    try {
      const due = search.filter((q) => schedule.due(`youtube:${q}`));
      if (search.length && !due.length) info("searches ran in the last day; each runs once a day");
      for (const q of due) {
        try {
          const ids = await searchVideos(q, after);
          schedule.ran(`youtube:${q}`);
          for (const id of ids) if (!found.has(id)) found.set(id, { query: q, filter: false });
          outcomes[`youtube:${q}`] = { found: ids.length };
        } catch (error) {
          if (error instanceof YouTubeQuotaError) {
            quotaHit = true;
            log(error.message);
            break;
          }
          outcomes[`youtube:${q}`] = { found: 0, error: errorText(error) };
          log(`youtube "${q}": ${errorText(error)}`);
        }
      }

      const known = (await getKv<Record<string, ChannelInfo>>("youtube:channels")) ?? {};
      for (const input of channels) {
        const key = `channel:${input}`;
        try {
          const channel = await resolveChannel(input, known);
          if (!channel) {
            outcomes[key] = { found: 0, error: "Not a channel Radar recognizes. Use its @handle, its URL or its ID (UC...)." };
            continue;
          }
          const feed = channelFeed(await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`, { timeoutMs: 15_000 }));
          if (feed.title) known[input] = { id: channel.id, title: feed.title };
          const recent = feed.videos.filter((v) => !v.short && (!v.published || v.published >= after));
          for (const v of recent) if (!found.has(v.id)) found.set(v.id, { query: `channel:${feed.title ?? input}`, filter: true });
          outcomes[key] = { found: recent.length, ...(feed.title ? { label: feed.title } : {}) };
        } catch (error) {
          if (error instanceof YouTubeQuotaError) {
            quotaHit = true;
            log(error.message);
            break;
          }
          outcomes[key] = { found: 0, error: errorText(error) };
          log(`youtube channel ${input}: ${errorText(error)}`);
        }
      }
      await setKv("youtube:channels", known);

      const ids = [...found.keys()];
      const stored = await knownVideos(topic.id, ids);
      const fresh = ids.filter((id) => !stored.has(id));
      const videos = fresh.length && !quotaHit ? await videoDetails(fresh) : [];
      const out: RawItem[] = [];
      let skipped = 0;
      for (const video of videos) {
        const how = found.get(video.id);
        const item = how ? videoItem(video, how.query, how.filter) : null;
        if (item) out.push(item);
        else skipped += 1;
      }
      if (skipped) info(`${skipped} Shorts and upcoming streams skipped`);
      if (stored.size) info(`${stored.size} videos already collected`);
      return out;
    } finally {
      for (const [key, outcome] of Object.entries(outcomes)) {
        schedule.note(key, outcome);
        noteQuery(key, outcome);
      }
      await schedule.save();
    }
  },
};
