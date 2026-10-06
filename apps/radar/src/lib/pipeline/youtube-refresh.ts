import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { items, type Topic } from "@/db/schema";
import { videoItem, videoDetails, youtubeEnabled } from "@/lib/sources/youtube";
import { titleKey, truncate } from "@/lib/text";
import type { Deadline } from "./runs";

// YouTube's rules let Radar keep data about other people's videos for up to 30 days, after
// which it has to be refreshed or deleted. Refreshing is cheap (one unit per 50 videos) and
// keeps view counts current, so every video is refreshed after 25 days.
const REFRESH_AFTER_MS = 25 * 86_400_000;
const MAX_PER_RUN = 500;

export type RefreshResult = { refreshed: number; removed: number; error?: string };

export async function refreshYouTube(topic: Topic, deadline: Deadline, log: (m: string) => void): Promise<RefreshResult> {
  const result: RefreshResult = { refreshed: 0, removed: 0 };
  if (!youtubeEnabled()) return result;
  const db = await getDb();
  const before = Date.now() - REFRESH_AFTER_MS;
  const stale = await db
    .select({ id: items.id, videoId: items.externalId, matchedQuery: items.matchedQuery })
    .from(items)
    .where(
      and(
        eq(items.topicId, topic.id),
        eq(items.source, "youtube"),
        sql`coalesce((${items.engagement}->>'refreshedAt')::bigint, 0) < ${before}`,
      ),
    )
    .orderBy(asc(items.id))
    .limit(MAX_PER_RUN);

  try {
    for (let i = 0; i < stale.length; i += 50) {
      if (deadline.near(20_000)) break;
      const chunk = stale.slice(i, i + 50);
      const videos = new Map((await videoDetails(chunk.map((r) => r.videoId ?? "").filter(Boolean))).map((v) => [v.id, v]));
      for (const row of chunk) {
        const video = row.videoId ? videos.get(row.videoId) : undefined;
        // Shorts and upcoming streams never get stored, so a null here means the video is gone.
        const fresh = video ? videoItem(video, row.matchedQuery ?? "", false) : null;
        if (fresh) {
          await db
            .update(items)
            .set({
              title: truncate(fresh.title, 400),
              titleKey: titleKey(fresh.title),
              snippet: fresh.snippet ? truncate(fresh.snippet, 1200) : null,
              author: fresh.author,
              outlet: fresh.outlet,
              engagement: fresh.engagement,
            })
            .where(eq(items.id, row.id));
          result.refreshed += 1;
        } else {
          // Private, deleted or taken down: keep the row for the brief's links, drop YouTube's data.
          await db
            .update(items)
            .set({ title: "Video no longer available on YouTube", snippet: null, engagement: { refreshedAt: Date.now(), removed: 1 } })
            .where(eq(items.id, row.id));
          result.removed += 1;
        }
      }
    }
  } catch (error) {
    result.error = (error as Error).message;
    log(`youtube refresh: ${result.error}`);
  }
  return result;
}
