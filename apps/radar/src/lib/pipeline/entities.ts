import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { orgMentions, orgs, people, personMentions, sources, type Item } from "@/db/schema";
import type { OrgRef, PersonRef } from "@/lib/ai/schemas";
import { orgKey, personKey, truncate } from "@/lib/text";

const NOT_A_PERSON = /\b(staff|editor|editors|team|newsroom|admin|unknown|reporter|contributor|desk|anonymous)\b/i;

function looksLikePerson(name: string): boolean {
  const key = personKey(name);
  const words = key.split(" ").filter(Boolean);
  return words.length >= 2 && words.length <= 5 && name.length <= 80 && !NOT_A_PERSON.test(name);
}

/** Saves the people and organizations Claude found in an item, with one mention each. */
export async function saveEntities(db: Db, item: Item, found: { people: PersonRef[]; orgs: OrgRef[] }): Promise<void> {
  for (const person of found.people) {
    if (!looksLikePerson(person.name)) continue;
    const isPoster = person.relation === "poster";
    const [row] = await db
      .insert(people)
      .values({
        nameKey: personKey(person.name),
        name: truncate(person.name.trim(), 80),
        role: person.role ? truncate(person.role, 120) : null,
        orgName: person.org ? truncate(person.org, 120) : null,
        xHandle: isPoster && item.source === "x" ? item.outlet : null,
        linkedinUrl: isPoster && item.source === "linkedin" ? item.authorUrl : null,
      })
      .onConflictDoUpdate({
        target: people.nameKey,
        set: {
          role: sql`coalesce(excluded.role, ${people.role})`,
          orgName: sql`coalesce(excluded.org_name, ${people.orgName})`,
          xHandle: sql`coalesce(${people.xHandle}, excluded.x_handle)`,
          linkedinUrl: sql`coalesce(${people.linkedinUrl}, excluded.linkedin_url)`,
          lastSeenAt: sql`now()`,
        },
      })
      .returning({ id: people.id });
    const inserted = await db
      .insert(personMentions)
      .values({
        itemId: item.id,
        personId: row.id,
        relation: person.relation,
        role: person.role,
        orgName: person.org,
        quote: person.quote ? truncate(person.quote, 300) : null,
      })
      .onConflictDoNothing()
      .returning({ id: personMentions.id });
    if (inserted.length) {
      await db.update(people).set({ mentionCount: sql`${people.mentionCount} + 1` }).where(eq(people.id, row.id));
    } else if (person.quote) {
      await db
        .update(personMentions)
        .set({ quote: truncate(person.quote, 300) })
        .where(sql`${personMentions.itemId} = ${item.id} and ${personMentions.personId} = ${row.id} and ${personMentions.relation} = ${person.relation}`);
    }
  }

  for (const org of found.orgs) {
    const key = orgKey(org.name);
    if (!key || key.length < 2) continue;
    const [row] = await db
      .insert(orgs)
      .values({ nameKey: key, name: truncate(org.name.trim(), 120), kind: org.kind })
      .onConflictDoUpdate({
        target: orgs.nameKey,
        set: { kind: sql`coalesce(${orgs.kind}, excluded.kind)`, lastSeenAt: sql`now()` },
      })
      .returning({ id: orgs.id });
    const inserted = await db
      .insert(orgMentions)
      .values({ itemId: item.id, orgId: row.id, relation: org.relation })
      .onConflictDoNothing()
      .returning({ id: orgMentions.id });
    if (inserted.length) {
      await db.update(orgs).set({ mentionCount: sql`${orgs.mentionCount} + 1` }).where(eq(orgs.id, row.id));
    }
  }
}

/** Credits a source when one of its items turns out relevant, and again if it was the origin. */
export async function creditSource(db: Db, sourceKey: string, relevant: boolean, origin: boolean): Promise<void> {
  if (!relevant) return;
  await db
    .update(sources)
    .set({
      relevantCount: sql`${sources.relevantCount} + 1`,
      originCount: sql`${sources.originCount} + ${origin ? 1 : 0}`,
    })
    .where(eq(sources.key, sourceKey));
}
