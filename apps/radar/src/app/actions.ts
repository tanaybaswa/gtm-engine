"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/db";
import { orgs, people, sources, topics, type RunStage } from "@/db/schema";
import { checkPassword, isValidSession, passwordConfigured, SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { runStage } from "@/lib/pipeline";
import { activeRun } from "@/lib/pipeline/runs";
import { discoverFeed } from "@/lib/sources/discover";
import { domainOf } from "@/lib/url";
import { defaultTopics } from "@/lib/topics/defaults";
import { getTopic } from "@/lib/topics/store";
import { SOURCE_KINDS, topicConfigSchema, type TopicConfig } from "@/lib/topics/types";

async function requireSession(): Promise<void> {
  const store = await cookies();
  if (!(await isValidSession(store.get(SESSION_COOKIE)?.value))) throw new Error("Please sign in again.");
}

export type FormState = { error?: string; ok?: string } | undefined;

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!passwordConfigured()) return { error: "RADAR_PASSWORD isn't set on the server yet. Add it in Vercel, then redeploy." };
  if (!(await checkPassword(password))) return { error: "That password didn't match." };
  const store = await cookies();
  store.set(SESSION_COOKIE, (await sessionToken())!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

const STAGES: RunStage[] = ["collect", "enrich", "brief", "full"];

/** Starts a run in the background and returns right away; the topic page shows progress. */
export async function runNow(formData: FormData): Promise<void> {
  await requireSession();
  const topicId = Number(formData.get("topicId"));
  const stage = String(formData.get("stage") ?? "full") as RunStage;
  if (!STAGES.includes(stage)) throw new Error(`Unknown stage "${stage}".`);
  const topic = await getTopic(topicId);
  if (!topic) throw new Error("Topic not found.");
  if (await activeRun(topicId)) redirect(`/topics/${topicId}?busy=1`);
  after(async () => {
    try {
      await runStage(topic, stage, "manual");
    } catch (error) {
      console.error(`Run failed for topic ${topicId}:`, error);
    }
  });
  redirect(`/topics/${topicId}?started=${stage}`);
}

export async function saveTopic(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name || !description) return { error: "Name and description are both required." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("config") ?? "{}"));
  } catch (error) {
    return { error: `The settings aren't valid JSON: ${(error as Error).message}` };
  }
  const parsed = topicConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `Settings problem at "${issue.path.join(".") || "root"}": ${issue.message}` };
  }
  const db = await getDb();
  await db.update(topics).set({ name, description, config: parsed.data, updatedAt: new Date() }).where(eq(topics.id, id));
  refresh();
  return { ok: "Saved. The next run uses these settings." };
}

export async function resetTopic(formData: FormData): Promise<void> {
  await requireSession();
  const id = Number(formData.get("id"));
  const topic = await getTopic(id);
  const seed = defaultTopics.find((t) => t.slug === topic?.slug);
  if (!topic || !seed) throw new Error("This topic has no defaults to reset to.");
  const db = await getDb();
  await db
    .update(topics)
    .set({ name: seed.name, description: seed.description, config: topicConfigSchema.parse(seed.config), updatedAt: new Date() })
    .where(eq(topics.id, id));
  redirect(`/topics/${id}?reset=1`);
}

export async function toggleWatch(formData: FormData): Promise<void> {
  await requireSession();
  const kind = String(formData.get("kind"));
  const id = Number(formData.get("id"));
  const watched = formData.get("watched") === "true";
  const db = await getDb();
  if (kind === "person") await db.update(people).set({ watched }).where(eq(people.id, id));
  else if (kind === "org") await db.update(orgs).set({ watched }).where(eq(orgs.id, id));
  refresh();
}

/**
 * Following a source makes the next run collect from it directly: X accounts join the X
 * watchlist, subreddits join the Reddit list, and websites get their RSS feed added.
 */
export async function toggleFollow(formData: FormData): Promise<void> {
  await requireSession();
  const sourceId = Number(formData.get("sourceId"));
  const topicId = Number(formData.get("topicId"));
  const follow = formData.get("follow") === "true";
  const db = await getDb();
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  const topic = await getTopic(topicId);
  if (!source || !topic) throw new Error("Source or topic not found.");

  const next: TopicConfig = structuredClone(topic.config);
  let feedUrl = source.feedUrl;

  if (source.key.startsWith("x:@")) {
    const handle = source.key.slice(3);
    next.queries.x.accounts = follow
      ? [...new Set([...next.queries.x.accounts, handle])]
      : next.queries.x.accounts.filter((h) => h.toLowerCase().replace(/^@/, "") !== handle);
  } else if (source.key.startsWith("reddit:r/")) {
    const sub = source.key.slice("reddit:r/".length);
    next.queries.reddit.subreddits = follow
      ? [...new Set([...next.queries.reddit.subreddits, sub])]
      : next.queries.reddit.subreddits.filter((s) => s.toLowerCase() !== sub);
  } else if (!source.key.includes(":")) {
    const sameSite = (url: string) => domainOf(url) === source.key;
    if (follow) {
      // Reuse a feed the topic already has for this site before searching the site for one.
      feedUrl ??= next.feeds.find((f) => sameSite(f.url))?.url ?? (await discoverFeed(source.homepage ?? `https://${source.key}`));
      if (feedUrl && !next.feeds.some((f) => f.url === feedUrl)) {
        const kind = (SOURCE_KINDS as readonly string[]).includes(source.kind) ? source.kind : "publication";
        next.feeds.push({ url: feedUrl, name: source.name, kind, filter: true });
      }
    } else {
      next.feeds = next.feeds.filter((f) => f.url !== feedUrl && !sameSite(f.url));
    }
  }
  // LinkedIn profiles have no feed we can legally poll; following just marks them.

  await db.update(topics).set({ config: next, updatedAt: new Date() }).where(eq(topics.id, topicId));
  await db.update(sources).set({ followed: follow, feedUrl }).where(eq(sources.id, sourceId));
  refresh();
}

export async function removeFeed(formData: FormData): Promise<void> {
  await requireSession();
  const topicId = Number(formData.get("topicId"));
  const url = String(formData.get("url"));
  const topic = await getTopic(topicId);
  if (!topic) throw new Error("Topic not found.");
  const next: TopicConfig = { ...topic.config, feeds: topic.config.feeds.filter((f) => f.url !== url) };
  const db = await getDb();
  await db.update(topics).set({ config: next, updatedAt: new Date() }).where(eq(topics.id, topicId));
  await db.update(sources).set({ followed: false }).where(eq(sources.feedUrl, url));
  refresh();
}
