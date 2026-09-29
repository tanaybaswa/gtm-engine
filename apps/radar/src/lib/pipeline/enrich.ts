import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { items, type Item, type Topic } from "@/db/schema";
import { AiBudgetError, AiUnavailableError, assertAiAvailable, structuredCall } from "@/lib/ai/client";
import { analystSystemPrompt, extractPrompt, triagePrompt } from "@/lib/ai/prompts";
import { extractSchema, triageSchema } from "@/lib/ai/schemas";
import { config } from "@/lib/config";
import { sleep } from "@/lib/http";
import { decodeGoogleNewsUrl, fetchArticle } from "./article";
import { creditSource, saveEntities } from "./entities";
import type { Deadline, ProgressUpdate } from "./runs";

export type EnrichResult = { triaged: number; relevant: number; extracted: number; skipped?: string; notes: string[] };

/**
 * Two passes. Triage scores every new item cheaply from its headline and snippet, and pulls
 * out people and organizations. Extraction then reads the most relevant articles in full to
 * find primary sources and quotes.
 */
export async function enrichTopic(
  topic: Topic,
  deadline: Deadline,
  log: (m: string) => void,
  onProgress: (p: ProgressUpdate) => void = () => {},
): Promise<EnrichResult> {
  const result: EnrichResult = { triaged: 0, relevant: 0, extracted: 0, notes: [] };
  try {
    await assertAiAvailable();
  } catch (error) {
    if (error instanceof AiUnavailableError || error instanceof AiBudgetError) {
      result.skipped = error.message;
      return result;
    }
    throw error;
  }

  const db = await getDb();
  const system = analystSystemPrompt(topic);
  const threshold = topic.config.relevanceThreshold;

  // Pass 1: triage new items in batches, newest first.
  const pending = await db
    .select()
    .from(items)
    .where(and(eq(items.topicId, topic.id), eq(items.status, "new")))
    .orderBy(desc(items.collectedAt))
    .limit(config.maxTriagePerRun);

  for (let i = 0; i < pending.length && !deadline.near(45_000); i += config.triageBatchSize) {
    const batch = pending.slice(i, i + config.triageBatchSize);
    onProgress({ phase: "score", done: i, total: pending.length });
    try {
      const { items: scored } = await structuredCall({
        system,
        prompt: triagePrompt(batch),
        schema: triageSchema,
        effort: "low",
      });
      const byId = new Map(batch.map((b) => [b.id, b]));
      for (const s of scored) {
        const item = byId.get(s.id);
        if (!item) continue;
        byId.delete(s.id);
        const relevance = Math.max(0, Math.min(100, s.relevance));
        const relevant = relevance >= threshold;
        await db
          .update(items)
          .set({
            status: "triaged",
            relevance,
            category: s.category,
            isOrigin: s.isOrigin,
            originHint: s.originHint,
            gist: s.gist,
            enrichedAt: new Date(),
          })
          .where(eq(items.id, item.id));
        if (relevant) {
          await saveEntities(db, item, { people: s.people, orgs: s.orgs });
          await creditSource(db, item.sourceKey, true, s.isOrigin);
          result.relevant += 1;
        }
        result.triaged += 1;
      }
      // Anything Claude skipped goes back in the queue next time.
      if (byId.size) log(`triage: ${byId.size} items were not scored and stay queued`);
    } catch (error) {
      if (error instanceof AiBudgetError) {
        result.skipped = error.message;
        return result;
      }
      log(`triage batch failed: ${(error as Error).message}`);
      result.notes.push(`A triage batch failed: ${(error as Error).message}`);
    }
  }

  // Pass 2: read the most relevant articles in full.
  const extractFloor = Math.max(threshold, 65);
  const toRead = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.topicId, topic.id),
        eq(items.status, "triaged"),
        gte(items.relevance, extractFloor),
        or(isNull(items.summary), eq(items.summary, "")),
        inArray(items.source, ["google_news", "gdelt", "rss", "serper_news", "hacker_news", "linkedin"]),
      ),
    )
    .orderBy(desc(items.relevance), desc(items.publishedAt))
    .limit(config.maxExtractPerRun);

  for (const [index, item] of toRead.entries()) {
    if (deadline.near(35_000)) break;
    onProgress({ phase: "read", done: index, total: toRead.length, detail: item.outlet ?? item.sourceKey });
    try {
      await extractOne(item, system);
      result.extracted += 1;
    } catch (error) {
      if (error instanceof AiBudgetError) {
        result.skipped = error.message;
        break;
      }
      log(`extract ${item.id}: ${(error as Error).message}`);
      await db.update(items).set({ status: "error", error: (error as Error).message.slice(0, 300) }).where(eq(items.id, item.id));
    }
  }

  if (result.triaged) result.notes.push(`${result.triaged} items scored, ${result.relevant} relevant`);
  if (result.extracted) result.notes.push(`${result.extracted} articles read in full`);
  return result;
}

async function extractOne(item: Item, system: string): Promise<void> {
  const db = await getDb();
  let url = item.resolvedUrl ?? item.url;
  if (item.source === "google_news" && !item.resolvedUrl) {
    const decoded = await decodeGoogleNewsUrl(item.url);
    await sleep(300);
    if (decoded) {
      url = decoded;
      await db.update(items).set({ resolvedUrl: decoded }).where(eq(items.id, item.id));
    }
  }

  const article = url.includes("news.google.com") ? null : await fetchArticle(url);
  if (!article) {
    // Can't read the page (paywall, bot wall, or no text): keep the triage result.
    await db.update(items).set({ status: "extracted", summary: item.gist }).where(eq(items.id, item.id));
    return;
  }

  const found = await structuredCall({
    system,
    prompt: extractPrompt({
      title: item.title,
      outlet: item.outlet,
      url,
      publishedAt: item.publishedAt,
      text: article.text,
      truncated: article.truncated,
      links: article.links,
    }),
    schema: extractSchema,
    effort: "medium",
  });

  await db
    .update(items)
    .set({
      status: "extracted",
      summary: found.summary,
      whyItMatters: found.whyItMatters,
      isOrigin: found.isOrigin,
      primarySources: found.primarySources,
      author: item.author ?? article.byline,
      enrichedAt: new Date(),
    })
    .where(eq(items.id, item.id));
  await saveEntities(db, item, { people: found.people, orgs: found.orgs });
}
