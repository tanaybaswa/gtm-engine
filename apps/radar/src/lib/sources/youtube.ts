import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { items, type QueryOutcome } from "@/db/schema";
import { config } from "@/lib/config";
import { fetchJson, fetchText, HttpError } from "@/lib/http";
import { getKv, setKv } from "@/lib/kv";
import { decodeEntities } from "@/lib/text";
import type { TopicConfig, YouTubeOrder } from "@/lib/topics/types";
import { addUsage, getUsage } from "@/lib/usage";
import type { Connector, RawItem } from "./types";

type YouTubeSettings = TopicConfig["queries"]["youtube"];

// YouTube through its official Data API, with a free key: about 100 searches a day, and video
// details at 1 unit per 50 videos out of 10,000 units a day. Channels are read through their
// public feeds, which need no key and cost nothing.

const API = "https://www.googleapis.com/youtube/v3";
// Each search runs at most once a day per topic.
const SEARCH_EVERY_MS = 20 * 3_600_000;
// Followed channels' feeds look back two weeks; repeats are dropped.
const CHANNEL_WINDOW_MS = 14 * 86_400_000;
// Subscriber counts change slowly: each channel is looked up at most once a week.
const CHANNEL_STATS_MAX_AGE_MS = 7 * 86_400_000;

export class YouTubeQuotaError extends Error {}

const count = (v: string | undefined) => (v === undefined || v === "" ? undefined : Number(v));

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
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    thumbnails?: Record<string, Thumbnail>;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};
type SearchResponse = { items?: { id?: { videoId?: string } }[] };
type VideosResponse = { items?: YouTubeVideo[] };
type ChannelsResponse = {
  items?: {
    id: string;
    snippet?: { title?: string };
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string; viewCount?: string };
  }[];
};

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

/** Video ids for a search, in YouTube's order, published after a date when one is given. */
export async function searchVideos(
  q: string,
  options: { publishedAfter?: Date; order?: Exclude<YouTubeOrder, "both">; maxResults?: number } = {},
): Promise<string[]> {
  if ((await youtubeSearchesToday()) >= config.youtubeDailySearches) {
    throw new YouTubeQuotaError(`The daily cap of ${config.youtubeDailySearches} YouTube searches is reached. Searching resumes tomorrow.`);
  }
  // Google counts a search even when it fails, so count it first.
  await addUsage("youtube_searches", 1, youtubeDay());
  const data = await api<SearchResponse>("search", {
    part: "id",
    type: "video",
    q,
    maxResults: String(options.maxResults ?? 25),
    order: options.order ?? "relevance",
    relevanceLanguage: "en",
    ...(options.publishedAfter ? { publishedAfter: options.publishedAfter.toISOString() } : {}),
  });
  return (data.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => Boolean(id));
}

/** How big a channel is. YouTube lets channels hide their subscriber count. */
export type ChannelStats = { subscribers?: number; hidden?: boolean; videos?: number; views?: number; at: string };

const STATS_KEY = "youtube:channel-stats";
// YouTube's rules: data about other people's channels is refreshed or deleted within 30 days.
const STATS_KEEP_MS = 30 * 86_400_000;

/** Subscriber counts for channels, looked up 50 at a time and kept for a week. */
export async function channelStats(ids: string[], maxAgeMs = CHANNEL_STATS_MAX_AGE_MS): Promise<Map<string, ChannelStats>> {
  const cache = (await getKv<Record<string, ChannelStats>>(STATS_KEY)) ?? {};
  const unique = [...new Set(ids.filter(Boolean))];
  const stale = unique.filter((id) => !cache[id] || Date.now() - Date.parse(cache[id].at) > maxAgeMs);
  for (let i = 0; i < stale.length; i += 50) {
    await addUsage("youtube_units", 1, youtubeDay());
    const data = await api<ChannelsResponse>("channels", { part: "statistics", id: stale.slice(i, i + 50).join(","), maxResults: "50" });
    const at = new Date().toISOString();
    for (const channel of data.items ?? []) {
      const s = channel.statistics ?? {};
      cache[channel.id] = {
        ...(s.hiddenSubscriberCount ? { hidden: true } : { subscribers: count(s.subscriberCount) }),
        videos: count(s.videoCount),
        views: count(s.viewCount),
        at,
      };
    }
  }
  if (stale.length) {
    const keep = Object.fromEntries(Object.entries(cache).filter(([, v]) => Date.now() - Date.parse(v.at) < STATS_KEEP_MS));
    await setKv(STATS_KEY, keep);
  }
  return new Map(unique.flatMap((id) => (cache[id] ? [[id, cache[id]] as const] : [])));
}

/**
 * Whether a video is in English: the language it declares, or, when it declares none, a title
 * written mostly in the Latin alphabet.
 */
export function looksEnglish(video: YouTubeVideo): boolean {
  const s = video.snippet;
  const declared = (s?.defaultAudioLanguage ?? s?.defaultLanguage ?? "").toLowerCase();
  if (declared && declared !== "zxx" && declared !== "und") return declared.startsWith("en");
  const title = s?.title ?? "";
  const letters = title.match(/\p{L}/gu)?.length ?? 0;
  const latin = title.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return !letters || latin / letters >= 0.7;
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

/** A video as an item, with its channel's size when known. Null for Shorts and streams that haven't started. */
export function videoItem(
  video: YouTubeVideo,
  matchedQuery: string,
  applyKeywordFilter: boolean,
  now = Date.now(),
  channel?: ChannelStats,
): RawItem | null {
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
      subscribers: channel?.subscribers,
      subscribersHidden: channel?.hidden ? 1 : undefined,
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
async function youtubeSchedule(topicId: number, settings: string) {
  const runsKey = `youtube:last-run:${topicId}`;
  const resultsKey = `youtube:results:${topicId}`;
  const [lastRuns, results] = await Promise.all([getKv<Record<string, string>>(runsKey), getKv<Record<string, YouTubeResult>>(resultsKey)]);
  // New search settings (window, order, results) make every search due straight away.
  const last = lastRuns?.["#settings"] === settings ? lastRuns : { "#settings": settings };
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

/** Why a video wasn't kept, in words for Health. */
export type SkipReason = "short" | "language" | "length" | "views" | "subscribers" | "hidden";

const SKIP_LABELS: Record<SkipReason, (n: number, yt: YouTubeSettings) => string> = {
  short: (n) => `${n} Shorts or upcoming streams`,
  language: (n) => `${n} not in English`,
  length: (n, yt) => `${n} shorter than ${yt.minMinutes} min`,
  views: (n, yt) => `${n} under ${yt.minViews.toLocaleString("en-US")} views`,
  subscribers: (n, yt) => `${n} from channels under ${yt.minSubscribers.toLocaleString("en-US")} subscribers`,
  hidden: (n) => `${n} from hidden channels`,
};

/** Checks a video against the topic's YouTube settings. Followed channels skip the subscriber floor. */
export function skipReason(item: RawItem, video: YouTubeVideo, yt: YouTubeSettings, followed: Set<string>, hidden: Set<string>): SkipReason | null {
  const channelId = video.snippet?.channelId ?? "";
  if (hidden.has(channelId)) return "hidden";
  if (yt.englishOnly && !looksEnglish(video)) return "language";
  const e = item.engagement ?? {};
  if (yt.minMinutes && (e.durationSec ?? 0) < yt.minMinutes * 60) return "length";
  if (yt.minViews && (e.views ?? 0) < yt.minViews) return "views";
  if (yt.minSubscribers && !followed.has(channelId) && (e.subscribers ?? -1) < yt.minSubscribers) return "subscribers";
  return null;
}

/** Channel IDs for a list of channel inputs, looking up handles the first time. */
async function channelIds(inputs: string[], known: Record<string, ChannelInfo>): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const input of inputs) {
    try {
      const channel = await resolveChannel(input, known);
      if (channel) ids.add(channel.id);
    } catch {
      // An unresolvable handle just doesn't count; Settings shows the channels that work.
    }
  }
  return ids;
}

export const youtube: Connector = {
  id: "youtube",
  label: "YouTube",
  unavailable: () => (youtubeEnabled() ? null : "add YOUTUBE_API_KEY to enable"),
  async collect({ topic, log, noteQuery = () => {}, info = () => {} }) {
    if (!youtubeEnabled()) return [];
    const yt = topic.config.queries.youtube;
    const publishedAfter = yt.windowDays ? new Date(Date.now() - yt.windowDays * 86_400_000) : undefined;
    const orders: Exclude<YouTubeOrder, "both">[] = yt.order === "both" ? ["relevance", "viewCount"] : [yt.order];
    const schedule = await youtubeSchedule(topic.id, JSON.stringify([yt.windowDays, yt.order, yt.maxResults]));
    // Video id -> how it was found. Channel videos always go through the keyword filter, since
    // most channels cover more than one subject; search results do when the topic says so.
    const found = new Map<string, { query: string; filter: boolean }>();
    const outcomes: Record<string, QueryOutcome> = {};
    let quotaHit = false;

    try {
      const due = yt.search.filter((q) => schedule.due(`youtube:${q}`));
      if (yt.search.length && !due.length) info("searches ran in the last day; each runs once a day");
      searches: for (const q of due) {
        const ids = new Set<string>();
        try {
          for (const order of orders) {
            for (const id of await searchVideos(q, { publishedAfter, order, maxResults: yt.maxResults })) ids.add(id);
          }
          schedule.ran(`youtube:${q}`);
          for (const id of ids) if (!found.has(id)) found.set(id, { query: q, filter: yt.keywordFilter });
          outcomes[`youtube:${q}`] = { found: ids.size };
        } catch (error) {
          if (error instanceof YouTubeQuotaError) {
            quotaHit = true;
            log(error.message);
            break searches;
          }
          outcomes[`youtube:${q}`] = { found: ids.size, error: errorText(error) };
          log(`youtube "${q}": ${errorText(error)}`);
        }
      }

      const known = (await getKv<Record<string, ChannelInfo>>("youtube:channels")) ?? {};
      const after = new Date(Date.now() - CHANNEL_WINDOW_MS);
      for (const input of yt.channels) {
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
      const [followed, hidden] = await Promise.all([channelIds(yt.channels, known), channelIds(yt.hiddenChannels, known)]);
      await setKv("youtube:channels", known);

      const ids = [...found.keys()];
      const stored = await knownVideos(topic.id, ids);
      const fresh = ids.filter((id) => !stored.has(id));
      const videos = fresh.length && !quotaHit ? await videoDetails(fresh) : [];
      const stats = videos.length ? await channelStats(videos.map((v) => v.snippet?.channelId ?? "")) : new Map<string, ChannelStats>();
      const out: RawItem[] = [];
      const skipped: Partial<Record<SkipReason, number>> = {};
      for (const video of videos) {
        const how = found.get(video.id);
        const item = how ? videoItem(video, how.query, how.filter, Date.now(), stats.get(video.snippet?.channelId ?? "")) : null;
        const reason: SkipReason | null = item ? skipReason(item, video, yt, followed, hidden) : "short";
        if (item && !reason) out.push(item);
        else if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
      }
      const skippedText = (Object.entries(skipped) as [SkipReason, number][]).map(([reason, n]) => SKIP_LABELS[reason](n, yt));
      if (skippedText.length) info(`skipped ${skippedText.join(", ")}`);
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
