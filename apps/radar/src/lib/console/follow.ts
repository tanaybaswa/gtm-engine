import type { TopicConfig } from "@/lib/topics/types";
import { domainOf } from "@/lib/url";

type SourceLike = { key: string; followed: boolean; feedUrl: string | null };

/** Websites (followed through their feed), X accounts and subreddits can be followed. */
export function isFollowable(key: string): boolean {
  return key.startsWith("x:@") || key.startsWith("reddit:r/") || !key.includes(":");
}

/** A source counts as followed when the topic already collects from it directly. */
export function followState(source: SourceLike, config: TopicConfig): { followed: boolean; feedUrl: string | null } {
  const { feeds, queries } = config;
  if (source.key.startsWith("x:@")) {
    const handle = source.key.slice(3);
    return { followed: queries.x.accounts.some((h) => h.toLowerCase().replace(/^@/, "") === handle), feedUrl: null };
  }
  if (source.key.startsWith("reddit:r/")) {
    const sub = source.key.slice("reddit:r/".length);
    return { followed: queries.reddit.subreddits.some((r) => r.toLowerCase() === sub), feedUrl: null };
  }
  const feed = feeds.find((f) => f.url === source.feedUrl || domainOf(f.url) === source.key);
  return { followed: Boolean(feed), feedUrl: feed?.url ?? source.feedUrl };
}

/** Where a source lives on the web. */
export function sourceLink(key: string, homepage: string | null): string | null {
  if (homepage) return homepage;
  if (key.startsWith("x:@")) return `https://x.com/${key.slice(3)}`;
  if (key.startsWith("reddit:r/")) return `https://www.reddit.com/r/${key.slice("reddit:r/".length)}/`;
  if (key.startsWith("linkedin:")) return `https://www.linkedin.com/in/${key.slice("linkedin:".length)}`;
  if (!key.includes(":")) return `https://${key}`;
  return null;
}
