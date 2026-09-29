"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getDb } from "@/db";
import { orgs, people, sources, topics, type RunStage, type Topic } from "@/db/schema";
import { checkPassword, isValidSession, passwordConfigured, SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { config } from "@/lib/config";
import { markChanged } from "@/lib/console/changes";
import { toTopicDTO } from "@/lib/console/data";
import { followState } from "@/lib/console/follow";
import type { TopicDTO } from "@/lib/console/types";
import { activeRun } from "@/lib/pipeline/runs";
import { defaultTopics } from "@/lib/topics/defaults";
import { getTopic } from "@/lib/topics/store";
import { SOURCE_KINDS, topicConfigSchema, type TopicConfig } from "@/lib/topics/types";
import { domainOf } from "@/lib/url";

export type FormState = { error?: string; ok?: string } | undefined;
export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

async function signedIn(): Promise<boolean> {
  const store = await cookies();
  return isValidSession(store.get(SESSION_COOKIE)?.value);
}

const SIGNED_OUT = { ok: false as const, error: "Your session ended. Reload the page to sign in again." };

// Vercel's free plan stops a function 300 seconds after the request arrived, background work
// included. Runs keep a margin under that.
const FUNCTION_LIMIT_SECONDS = 290;

/** Runs a stage after the response is sent. The pipeline loads only when a run starts. */
function startInBackground(topic: Topic, stage: RunStage, requestStartedAt = Date.now()): void {
  after(async () => {
    try {
      const { runStage } = await import("@/lib/pipeline");
      const left = FUNCTION_LIMIT_SECONDS - (Date.now() - requestStartedAt) / 1000;
      await runStage(topic, stage, "manual", { budgetSeconds: Math.max(45, Math.min(config.runBudgetSeconds, Math.floor(left))) });
    } catch (error) {
      console.error(`Run failed for topic ${topic.id}:`, error);
    }
  });
}

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

/** Starts a run in the background and returns at once; the console shows its progress. */
export async function runTopic(topicId: number, stage: RunStage): Promise<Result> {
  if (!(await signedIn())) return SIGNED_OUT;
  if (!STAGES.includes(stage)) return { ok: false, error: `Unknown stage "${stage}".` };
  const topic = await getTopic(topicId);
  if (!topic) return { ok: false, error: "That topic no longer exists." };
  if (await activeRun(topicId)) return { ok: false, error: "A run is already going for this topic." };
  startInBackground(topic, stage);
  return { ok: true };
}

export async function setWatched(kind: "person" | "org", id: number, watched: boolean): Promise<Result> {
  if (!(await signedIn())) return SIGNED_OUT;
  const db = await getDb();
  if (kind === "person") await db.update(people).set({ watched }).where(eq(people.id, id));
  else await db.update(orgs).set({ watched }).where(eq(orgs.id, id));
  await markChanged();
  return { ok: true };
}

/**
 * Following a source makes the next run collect from it directly: X accounts join the X
 * watchlist, subreddits join the Reddit list, and websites get their RSS feed added.
 */
export async function setFollowed(
  topicId: number,
  sourceId: number,
  follow: boolean,
): Promise<Result<{ followed: boolean; feedUrl: string | null; topic: TopicDTO }>> {
  if (!(await signedIn())) return SIGNED_OUT;
  const db = await getDb();
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId));
  const topic = await getTopic(topicId);
  if (!source || !topic) return { ok: false, error: "That source or topic no longer exists." };

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
      if (!feedUrl) {
        const { discoverFeed } = await import("@/lib/sources/discover");
        feedUrl = next.feeds.find((f) => sameSite(f.url))?.url ?? (await discoverFeed(source.homepage ?? `https://${source.key}`));
      }
      if (!feedUrl) return { ok: false, error: `No RSS or Atom feed was found on ${source.key}. Add a search for it in Settings instead.` };
      if (!next.feeds.some((f) => f.url === feedUrl)) {
        const kind = (SOURCE_KINDS as readonly string[]).includes(source.kind) ? source.kind : "publication";
        next.feeds.push({ url: feedUrl, name: source.name, kind, filter: true });
      }
    } else {
      next.feeds = next.feeds.filter((f) => f.url !== feedUrl && !sameSite(f.url));
    }
  } else {
    return { ok: false, error: "This kind of source can't be followed." };
  }

  const [updated] = await db.update(topics).set({ config: next, updatedAt: new Date() }).where(eq(topics.id, topicId)).returning();
  if (feedUrl !== source.feedUrl) await db.update(sources).set({ feedUrl }).where(eq(sources.id, sourceId));
  await markChanged();
  const parsed = { ...updated, config: topicConfigSchema.parse(updated.config) };
  const state = followState({ key: source.key, followed: follow, feedUrl }, parsed.config);
  return { ok: true, followed: state.followed, feedUrl: state.feedUrl, topic: toTopicDTO(parsed) };
}

export async function saveTopicSettings(
  topicId: number,
  input: { name: string; description: string; config: unknown },
): Promise<Result<{ topic: TopicDTO }>> {
  if (!(await signedIn())) return SIGNED_OUT;
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || !description) return { ok: false, error: "Name and description are both required." };
  const parsed = topicConfigSchema.safeParse(input.config);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Settings problem at "${issue.path.join(".") || "root"}": ${issue.message}` };
  }
  const db = await getDb();
  const [updated] = await db
    .update(topics)
    .set({ name, description, config: parsed.data, updatedAt: new Date() })
    .where(eq(topics.id, topicId))
    .returning();
  if (!updated) return { ok: false, error: "That topic no longer exists." };
  await markChanged();
  return { ok: true, topic: toTopicDTO({ ...updated, config: parsed.data }) };
}

export async function resetTopicSettings(topicId: number): Promise<Result<{ topic: TopicDTO }>> {
  if (!(await signedIn())) return SIGNED_OUT;
  const topic = await getTopic(topicId);
  const seed = defaultTopics.find((t) => t.slug === topic?.slug);
  if (!topic || !seed) return { ok: false, error: "This topic has no defaults to reset to." };
  const configValue = topicConfigSchema.parse(seed.config);
  const db = await getDb();
  const [updated] = await db
    .update(topics)
    .set({ name: seed.name, description: seed.description, config: configValue, updatedAt: new Date() })
    .where(eq(topics.id, topicId))
    .returning();
  await markChanged();
  return { ok: true, topic: toTopicDTO({ ...updated, config: configValue }) };
}

/** Archived topics keep their data but stop running on the schedule. */
export async function setTopicActive(topicId: number, active: boolean): Promise<Result> {
  if (!(await signedIn())) return SIGNED_OUT;
  const db = await getDb();
  await db.update(topics).set({ active, updatedAt: new Date() }).where(eq(topics.id, topicId));
  await markChanged();
  return { ok: true };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "topic"
  );
}

/**
 * Creates a topic from a plain-English request. Claude designs its searches, filters, feeds
 * and watchlist; feeds are checked live; then the first run starts in the background.
 */
export async function createTopic(input: { name: string; brief: string }): Promise<Result<{ id: number; notes: string[] }>> {
  const startedAt = Date.now();
  if (!(await signedIn())) return SIGNED_OUT;
  const name = input.name.trim().slice(0, 80);
  const brief = input.brief.trim().slice(0, 2000);
  if (!name) return { ok: false, error: "Give the topic a name." };

  let compiled;
  try {
    const { compileTopic } = await import("@/lib/topics/compile");
    compiled = await compileTopic({ name, brief });
  } catch (error) {
    return { ok: false, error: `Couldn't design this topic: ${(error as Error).message}` };
  }

  const db = await getDb();
  const taken = new Set((await db.select({ slug: topics.slug }).from(topics)).map((t) => t.slug));
  const base = slugify(compiled.name);
  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;

  const [created] = await db
    .insert(topics)
    .values({ slug, name: compiled.name, description: compiled.description, config: compiled.config })
    .returning();
  await markChanged();
  // Claude's design used part of this request's time; the first run gets the rest.
  startInBackground({ ...created, config: compiled.config }, "full", startedAt);
  return { ok: true, id: created.id, notes: compiled.notes };
}
