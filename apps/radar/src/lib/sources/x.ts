import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { kv } from "@/db/schema";
import { config } from "@/lib/config";
import { fetchJson, HttpError } from "@/lib/http";
import { truncate } from "@/lib/text";
import { addUsage, getUsage } from "@/lib/usage";
import type { Connector, RawItem } from "./types";

const API = "https://api.x.com/2";
const POST_READ_MICROUSD = 5_000; // $0.005
const USER_READ_MICROUSD = 10_000; // $0.010
const TWEET_FIELDS = "created_at,public_metrics,author_id,lang";
const USER_FIELDS = "name,username,description,verified";

type XUser = { id: string; name: string; username: string; description?: string };
type XTweet = {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number; quote_count?: number; impression_count?: number };
};
type XPage = { data?: XTweet[]; includes?: { users?: XUser[] }; meta?: { result_count?: number } };

async function spentMicroUsd(): Promise<number> {
  return getUsage("x_cost_microusd");
}

async function charge(posts: number, users: number): Promise<void> {
  await addUsage("x_post_reads", posts);
  await addUsage("x_user_reads", users);
  await addUsage("x_cost_microusd", posts * POST_READ_MICROUSD + users * USER_READ_MICROUSD);
}

function toItems(page: XPage, query: string): RawItem[] {
  const users = new Map((page.includes?.users ?? []).map((u) => [u.id, u]));
  return (page.data ?? []).map((tweet) => {
    const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
    const handle = user?.username ?? "unknown";
    const m = tweet.public_metrics ?? {};
    return {
      source: "x" as const,
      externalId: tweet.id,
      url: `https://x.com/${handle}/status/${tweet.id}`,
      title: truncate(tweet.text.replace(/\s+/g, " "), 140),
      snippet: tweet.text,
      author: user?.name ?? handle,
      authorUrl: `https://x.com/${handle}`,
      outlet: `@${handle}`,
      sourceKey: `x:@${handle.toLowerCase()}`,
      sourceHomepage: `https://x.com/${handle}`,
      sourceKind: "social_account" as const,
      publishedAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
      engagement: {
        likes: m.like_count ?? 0,
        reposts: m.retweet_count ?? 0,
        replies: m.reply_count ?? 0,
        quotes: m.quote_count ?? 0,
      },
      matchedQuery: query,
      applyKeywordFilter: false,
    };
  });
}

async function cachedUserIds(handles: string[], token: string, budgetLeft: () => Promise<number>): Promise<Map<string, XUser>> {
  const db = await getDb();
  const found = new Map<string, XUser>();
  const missing: string[] = [];
  for (const handle of handles) {
    const rows = await db.select().from(kv).where(eq(kv.key, `x:user:${handle.toLowerCase()}`));
    if (rows[0]) found.set(handle.toLowerCase(), rows[0].value as XUser);
    else missing.push(handle);
  }
  if (missing.length && (await budgetLeft()) >= missing.length * USER_READ_MICROUSD) {
    const url = `${API}/users/by?${new URLSearchParams({ usernames: missing.slice(0, 100).join(","), "user.fields": USER_FIELDS })}`;
    const res = await fetchJson<{ data?: XUser[] }>(url, { headers: { authorization: `Bearer ${token}` } });
    await charge(0, res.data?.length ?? 0);
    for (const user of res.data ?? []) {
      found.set(user.username.toLowerCase(), user);
      await db
        .insert(kv)
        .values({ key: `x:user:${user.username.toLowerCase()}`, value: user })
        .onConflictDoUpdate({ target: kv.key, set: { value: user, updatedAt: new Date() } });
    }
  }
  return found;
}

// Official X API, pay-per-use. Starts small: a couple of tight searches plus a short list
// of accounts, stopped at X_MONTHLY_BUDGET_USD.
export const x: Connector = {
  id: "x",
  label: "X",
  unavailable: () => (config.xBearerToken() ? null : "add X_BEARER_TOKEN to enable"),
  async collect({ topic, since, log }) {
    const token = config.xBearerToken();
    if (!token) return [];
    const budget = config.xMonthlyBudgetUsd * 1_000_000;
    const budgetLeft = async () => budget - (await spentMicroUsd());
    const headers = { authorization: `Bearer ${token}` };
    // Recent search only reaches back 7 days.
    const startTime = new Date(Math.max(since.getTime(), Date.now() - 6.9 * 24 * 3600 * 1000)).toISOString();
    const out: RawItem[] = [];

    const tags = topic.config.queries.hashtags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
    const searches = [...topic.config.queries.x.search, ...(tags.length ? [`(${tags.map((t) => `#${t}`).join(" OR ")}) -is:retweet lang:en`] : [])];
    for (const query of searches) {
      const maxResults = 25;
      if ((await budgetLeft()) < maxResults * (POST_READ_MICROUSD + USER_READ_MICROUSD)) {
        log("x: monthly budget reached, skipping search");
        break;
      }
      const url = `${API}/tweets/search/recent?${new URLSearchParams({
        query,
        max_results: String(maxResults),
        start_time: startTime,
        "tweet.fields": TWEET_FIELDS,
        expansions: "author_id",
        "user.fields": USER_FIELDS,
      })}`;
      try {
        const page = await fetchJson<XPage>(url, { headers, retries: 0 });
        await charge(page.data?.length ?? 0, page.includes?.users?.length ?? 0);
        out.push(...toItems(page, query));
      } catch (error) {
        log(`x search: ${error instanceof HttpError ? error.message : (error as Error).message}`);
      }
    }

    const handles = topic.config.queries.x.accounts.map((h) => h.replace(/^@/, "")).filter(Boolean);
    if (handles.length) {
      try {
        const users = await cachedUserIds(handles, token, budgetLeft);
        for (const handle of handles) {
          const user = users.get(handle.toLowerCase());
          if (!user) continue;
          if ((await budgetLeft()) < 10 * POST_READ_MICROUSD) {
            log("x: monthly budget reached, skipping account timelines");
            break;
          }
          const url = `${API}/users/${user.id}/tweets?${new URLSearchParams({
            max_results: "10",
            start_time: startTime,
            exclude: "retweets,replies",
            "tweet.fields": TWEET_FIELDS,
          })}`;
          const page = await fetchJson<XPage>(url, { headers, retries: 0 });
          await charge(page.data?.length ?? 0, 0);
          out.push(...toItems({ ...page, includes: { users: [user] } }, `@${user.username}`));
        }
      } catch (error) {
        log(`x accounts: ${(error as Error).message}`);
      }
    }
    return out;
  },
};
