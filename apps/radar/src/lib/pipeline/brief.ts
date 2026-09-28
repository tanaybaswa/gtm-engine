import { and, desc, eq, gte, inArray, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { items, people, personMentions, stories, type Topic } from "@/db/schema";
import { AiBudgetError, AiUnavailableError, structuredCall } from "@/lib/ai/client";
import { analystSystemPrompt, briefPrompt } from "@/lib/ai/prompts";
import { briefSchema } from "@/lib/ai/schemas";
import { localDate } from "@/lib/config";
import { truncate } from "@/lib/text";

/** Groups the day's relevant items into stories, each led by its original source. Replaces today's brief. */
export async function writeBrief(topic: Topic, log: (m: string) => void): Promise<{ stories: number; notes: string[] }> {
  const db = await getDb();
  const since = new Date(Date.now() - topic.config.lookbackHours * 3_600_000);
  const relevant = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.topicId, topic.id),
        gte(items.relevance, topic.config.relevanceThreshold),
        or(gte(items.publishedAt, since), and(gte(items.collectedAt, since))),
      ),
    )
    .orderBy(desc(items.relevance), desc(items.publishedAt))
    .limit(80);

  if (!relevant.length) return { stories: 0, notes: ["No relevant items in the window, so no brief was written."] };

  // People who speak, write or post in each item, described so Claude can pick the ones that
  // matter to each story. Passing mentions are left out.
  const mentions = await db
    .select({
      itemId: personMentions.itemId,
      name: people.name,
      relation: personMentions.relation,
      role: personMentions.role,
      orgName: personMentions.orgName,
    })
    .from(personMentions)
    .innerJoin(people, eq(people.id, personMentions.personId))
    .where(and(inArray(personMentions.itemId, relevant.map((i) => i.id)), ne(personMentions.relation, "mentioned")));
  const peopleByItem = new Map<number, string[]>();
  for (const m of mentions) {
    const role = [m.role, m.orgName].filter(Boolean).join(" at ");
    const label = `${m.name} (${m.relation}${role ? `, ${role}` : ""})`;
    peopleByItem.set(m.itemId, [...(peopleByItem.get(m.itemId) ?? []), label]);
  }

  const date = localDate();
  let result;
  try {
    result = await structuredCall({
      system: analystSystemPrompt(topic),
      prompt: briefPrompt(
        date,
        relevant.map((i) => ({
          id: i.id,
          title: i.title,
          outlet: i.outlet,
          publishedAt: i.publishedAt,
          relevance: i.relevance,
          isOrigin: i.isOrigin,
          originHint: i.originHint,
          summary: i.summary ?? i.gist,
          people: peopleByItem.get(i.id) ?? [],
        })),
      ),
      schema: briefSchema,
      effort: "medium",
    });
  } catch (error) {
    if (error instanceof AiUnavailableError || error instanceof AiBudgetError) {
      return { stories: 0, notes: [`Brief skipped: ${error.message}`] };
    }
    throw error;
  }

  const byId = new Map(relevant.map((i) => [i.id, i]));
  const rows = result.stories
    .map((story, index) => {
      const itemIds = story.itemIds.filter((id) => byId.has(id));
      let origin = story.originItemId && byId.has(story.originItemId) ? story.originItemId : null;
      // If Claude didn't name an origin but one of the story's items was judged to be the
      // original source, lead with it.
      origin ??=
        itemIds
          .map((id) => byId.get(id)!)
          .filter((i) => i.isOrigin)
          .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))[0]?.id ?? null;
      if (origin) itemIds.splice(0, itemIds.length, origin, ...itemIds.filter((id) => id !== origin));
      // Keep bare names even if Claude echoed the "(quoted, role)" label.
      const peopleNames = [...new Set(story.people.map((p) => p.replace(/\s*\(.*\)\s*$/, "").trim()).filter(Boolean))];
      return {
        topicId: topic.id,
        briefDate: date,
        rank: index + 1,
        title: truncate(story.title, 200),
        summary: story.summary,
        whyItMatters: story.whyItMatters,
        originItemId: origin,
        itemIds,
        peopleNames: peopleNames.slice(0, 12),
        orgNames: story.orgs.slice(0, 12),
      };
    })
    .filter((row) => row.itemIds.length > 0);

  await db.delete(stories).where(and(eq(stories.topicId, topic.id), eq(stories.briefDate, date)));
  if (rows.length) await db.insert(stories).values(rows);
  log(`brief: ${rows.length} stories for ${date}`);
  return { stories: rows.length, notes: [`Brief for ${date}: ${rows.length} stories`] };
}
