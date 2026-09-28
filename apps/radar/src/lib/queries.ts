import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { items, orgMentions, orgs, people, personMentions, sources, stories, type Item } from "@/db/schema";

export async function briefDates(topicId: number, limit = 14): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ date: stories.briefDate })
    .from(stories)
    .where(eq(stories.topicId, topicId))
    .orderBy(desc(stories.briefDate))
    .limit(limit);
  return rows.map((r) => r.date);
}

export type StoryView = {
  id: number;
  rank: number;
  title: string;
  summary: string;
  whyItMatters: string | null;
  origin: Item | null;
  others: Item[];
  peopleNames: string[];
  orgNames: string[];
};

export async function briefFor(topicId: number, date: string): Promise<StoryView[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(stories)
    .where(and(eq(stories.topicId, topicId), eq(stories.briefDate, date)))
    .orderBy(asc(stories.rank));
  const ids = [...new Set(rows.flatMap((r) => r.itemIds))];
  const itemRows = ids.length ? await db.select().from(items).where(inArray(items.id, ids)) : [];
  const byId = new Map(itemRows.map((i) => [i.id, i]));
  return rows.map((story) => {
    const storyItems = story.itemIds.map((id) => byId.get(id)).filter((i): i is Item => Boolean(i));
    const origin = story.originItemId ? byId.get(story.originItemId) ?? null : null;
    return {
      id: story.id,
      rank: story.rank,
      title: story.title,
      summary: story.summary,
      whyItMatters: story.whyItMatters,
      origin,
      others: storyItems.filter((i) => i.id !== origin?.id),
      peopleNames: story.peopleNames,
      orgNames: story.orgNames,
    };
  });
}

export type ItemFilters = { source?: string; minRelevance?: number; q?: string; limit?: number };

export async function listItems(topicId: number, filters: ItemFilters = {}): Promise<Item[]> {
  const db = await getDb();
  const where: SQL[] = [eq(items.topicId, topicId)];
  if (filters.source) where.push(eq(items.source, filters.source));
  if (filters.minRelevance) where.push(gte(items.relevance, filters.minRelevance));
  if (filters.q) where.push(or(ilike(items.title, `%${filters.q}%`), ilike(items.outlet, `%${filters.q}%`))!);
  return db
    .select()
    .from(items)
    .where(and(...where))
    .orderBy(sql`${items.publishedAt} desc nulls last`, desc(items.id))
    .limit(filters.limit ?? 200);
}

export async function itemCounts(topicId: number) {
  const db = await getDb();
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      scored: sql<number>`count(${items.relevance})::int`,
      sources: sql<number>`count(distinct ${items.source})::int`,
    })
    .from(items)
    .where(eq(items.topicId, topicId));
  return rows[0];
}

export type PeopleSort = "mentions" | "recent" | "name";

export async function listPeople(opts: { q?: string; sort?: PeopleSort; watchedOnly?: boolean; includePassing?: boolean } = {}) {
  const db = await getDb();
  const where: SQL[] = [];
  if (opts.q) where.push(or(ilike(people.name, `%${opts.q}%`), ilike(people.orgName, `%${opts.q}%`), ilike(people.role, `%${opts.q}%`))!);
  if (opts.watchedOnly) where.push(eq(people.watched, true));
  // By default, only people who spoke, wrote or posted somewhere; not ones merely name-checked.
  if (!opts.includePassing) {
    where.push(
      sql`exists (select 1 from ${personMentions} where ${personMentions.personId} = ${people.id} and ${personMentions.relation} <> 'mentioned')`,
    );
  }
  const order =
    opts.sort === "recent"
      ? [desc(people.lastSeenAt)]
      : opts.sort === "name"
        ? [asc(people.name)]
        : [desc(people.mentionCount), desc(people.lastSeenAt)];
  return db
    .select()
    .from(people)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...order)
    .limit(300);
}

/** How each person appears across items: quoted 3, author 1, and so on. */
export async function relationCounts(personIds: number[]): Promise<Map<number, Record<string, number>>> {
  const out = new Map<number, Record<string, number>>();
  if (!personIds.length) return out;
  const db = await getDb();
  const rows = await db
    .select({ personId: personMentions.personId, relation: personMentions.relation, n: sql<number>`count(*)::int` })
    .from(personMentions)
    .where(inArray(personMentions.personId, personIds))
    .groupBy(personMentions.personId, personMentions.relation);
  for (const row of rows) out.set(row.personId, { ...out.get(row.personId), [row.relation]: row.n });
  return out;
}

export async function getPerson(id: number) {
  const db = await getDb();
  const [person] = await db.select().from(people).where(eq(people.id, id));
  if (!person) return null;
  const mentions = await db
    .select({ mention: personMentions, item: items })
    .from(personMentions)
    .innerJoin(items, eq(items.id, personMentions.itemId))
    .where(eq(personMentions.personId, id))
    .orderBy(sql`${items.publishedAt} desc nulls last`)
    .limit(100);
  return { person, mentions };
}

export async function listOrgs(opts: { q?: string } = {}) {
  const db = await getDb();
  return db
    .select()
    .from(orgs)
    .where(opts.q ? ilike(orgs.name, `%${opts.q}%`) : undefined)
    .orderBy(desc(orgs.mentionCount), desc(orgs.lastSeenAt))
    .limit(300);
}

export async function getOrg(id: number) {
  const db = await getDb();
  const [org] = await db.select().from(orgs).where(eq(orgs.id, id));
  if (!org) return null;
  const mentions = await db
    .select({ mention: orgMentions, item: items })
    .from(orgMentions)
    .innerJoin(items, eq(items.id, orgMentions.itemId))
    .where(eq(orgMentions.orgId, id))
    .orderBy(sql`${items.publishedAt} desc nulls last`)
    .limit(100);
  const colleagues = await db
    .select()
    .from(people)
    .where(ilike(people.orgName, `%${org.name}%`))
    .orderBy(desc(people.mentionCount))
    .limit(30);
  return { org, mentions, colleagues };
}

export async function listSources() {
  const db = await getDb();
  return db
    .select()
    .from(sources)
    .orderBy(desc(sources.originCount), desc(sources.relevantCount), desc(sources.itemCount))
    .limit(300);
}

/** People who show up most in relevant items this week, for the brief's sidebar. */
export async function risingPeople(topicId: number, days = 7, limit = 8) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  return db
    .select({
      id: people.id,
      name: people.name,
      role: people.role,
      orgName: people.orgName,
      mentions: sql<number>`count(*)::int`,
    })
    .from(personMentions)
    .innerJoin(people, eq(people.id, personMentions.personId))
    .innerJoin(items, eq(items.id, personMentions.itemId))
    .where(
      and(
        eq(items.topicId, topicId),
        gte(personMentions.createdAt, since),
        isNotNull(items.relevance),
        ne(personMentions.relation, "mentioned"),
      ),
    )
    .groupBy(people.id, people.name, people.role, people.orgName)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}
