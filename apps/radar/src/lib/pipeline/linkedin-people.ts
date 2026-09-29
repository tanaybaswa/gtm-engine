import { and, asc, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { items, linkedinProfiles, people, personMentions, type ConnectorStat, type QueryOutcome, type Topic } from "@/db/schema";
import { linkedInQuery, parseLinkedInProfile, sameName } from "@/lib/sources/linkedin";
import { searchSchedule, SerperBudgetError, serperEnabled, serperSearch, type SerperSearch } from "@/lib/sources/serper-client";
import { truncate } from "@/lib/text";
import type { Deadline } from "./runs";

// Profiles change slowly, so each people search runs once a week.
const PEOPLE_SEARCH_EVERY_MS = 6.5 * 86_400_000;
// People Radar already knows are looked up a few at a time, and not found ones again after a month.
const MATCHES_PER_RUN = 5;
const RECHECK_AFTER_MS = 30 * 86_400_000;

export type LinkedInPeopleResult = { stat: ConnectorStat; notes: string[]; changed: boolean };

/** Words of an organization name worth matching on: "Beazley plc" -> ["beazley"]. */
function orgWords(org: string): string[] {
  return org
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !["plc", "inc", "llc", "ltd", "the", "group", "insurance", "company", "corp"].includes(w));
}

/**
 * Finds people on LinkedIn through Google (Serper): profiles that mention the topic's people
 * searches, and the public profiles of people Radar found in the news.
 */
export async function findLinkedInPeople(topic: Topic, deadline: Deadline, log: (m: string) => void): Promise<LinkedInPeopleResult> {
  const started = Date.now();
  const stat: ConnectorStat = { fetched: 0, inserted: 0, ms: 0 };
  if (!serperEnabled()) return { stat: { ...stat, skipped: "add SERPER_API_KEY to enable" }, notes: [], changed: false };

  const db = await getDb();
  const queries: Record<string, QueryOutcome> = {};
  const infos: string[] = [];
  let changed = false;
  let matched = 0;
  let looked = 0;

  const schedule = await searchSchedule(topic.id);
  try {
    // 1. People whose public profile mentions the topic.
    const searches = topic.config.queries.serper.profiles;
    const due = searches.filter((q) => schedule.due(`people:${q}`, PEOPLE_SEARCH_EVERY_MS));
    if (searches.length && !due.length) infos.push("people searches ran this week");
    for (const q of due) {
      if (deadline.near(20_000)) break;
      const result = await serperSearch<SerperSearch>("search", linkedInQuery(q, "profiles"));
      schedule.ran(`people:${q}`);
      if (!result) {
        queries[q] = { found: 0, error: "Serper's free plan refused this search, even in simpler forms" };
        continue;
      }
      const profiles = (result.data.organic ?? [])
        .map((r) => parseLinkedInProfile(r.link, r.title, r.subtitle, r.snippet))
        .filter((p): p is NonNullable<typeof p> => p !== null);
      for (const p of profiles) {
        const [row] = await db
          .insert(linkedinProfiles)
          .values({ topicId: topic.id, ...p, matchedQuery: q })
          .onConflictDoUpdate({
            target: [linkedinProfiles.topicId, linkedinProfiles.vanity],
            set: { name: p.name, headline: p.headline, company: p.company, location: p.location, about: p.about, lastSeenAt: sql`now()` },
          })
          .returning({ firstSeenAt: linkedinProfiles.firstSeenAt, lastSeenAt: linkedinProfiles.lastSeenAt });
        if (row && row.firstSeenAt.getTime() === row.lastSeenAt.getTime()) stat.inserted += 1;
      }
      stat.fetched += profiles.length;
      queries[q] = { found: profiles.length, ...(result.ranAs ? { ranAs: result.ranAs } : {}) };
      changed ||= profiles.length > 0;
    }

    // 2. The public profiles of people Radar found speaking, writing or posting on this topic.
    const recheckBefore = new Date(Date.now() - RECHECK_AFTER_MS).toISOString();
    const candidates = await db
      .selectDistinct({ id: people.id, name: people.name, orgName: people.orgName, mentions: people.mentionCount })
      .from(people)
      .innerJoin(personMentions, eq(personMentions.personId, people.id))
      .innerJoin(items, eq(items.id, personMentions.itemId))
      .where(
        and(
          eq(items.topicId, topic.id),
          ne(personMentions.relation, "mentioned"),
          isNull(people.linkedinUrl),
          or(isNull(people.linkedinCheckedAt), lt(people.linkedinCheckedAt, sql`${recheckBefore}::timestamptz`)),
        ),
      )
      .orderBy(desc(people.mentionCount), asc(people.id))
      .limit(MATCHES_PER_RUN);
    for (const person of candidates) {
      if (deadline.near(15_000)) break;
      looked += 1;
      const words = person.orgName ? orgWords(person.orgName) : [];
      const q = `site:linkedin.com/in "${person.name.replace(/"/g, "")}"${words.length ? ` ${words.slice(0, 3).join(" ")}` : ""}`;
      const result = await serperSearch<SerperSearch>("search", q);
      const profiles = (result?.data.organic ?? [])
        .map((r) => parseLinkedInProfile(r.link, r.title, r.subtitle, r.snippet))
        .filter((p): p is NonNullable<typeof p> => p !== null && sameName(person.name, p.name));
      // The organization has to show on the profile (two of its words, when it has several);
      // without an organization, a namesake is too likely, so there's no match.
      const needed = Math.min(2, words.length);
      const match = words.length
        ? profiles.find((p) => {
            const text = `${p.headline ?? ""} ${p.company ?? ""} ${p.about ?? ""}`.toLowerCase();
            return words.filter((w) => text.includes(w)).length >= needed;
          })
        : undefined;
      await db
        .update(people)
        .set(match ? { linkedinUrl: match.url, linkedinHeadline: match.headline, linkedinCheckedAt: new Date() } : { linkedinCheckedAt: new Date() })
        .where(eq(people.id, person.id));
      if (match) {
        matched += 1;
        changed = true;
      }
    }
    if (looked) {
      queries["Matching people from the news"] = { found: matched };
      infos.push(`matched ${matched} of ${looked} people to their LinkedIn profiles`);
    }
  } catch (error) {
    if (error instanceof SerperBudgetError) stat.error = error.message;
    else {
      stat.error = truncate((error as Error).message, 300);
      log(`linkedin people: ${(error as Error).message}`);
    }
  } finally {
    await schedule.save();
  }

  stat.fetched += matched;
  stat.ms = Date.now() - started;
  if (Object.keys(queries).length) stat.queries = queries;
  if (infos.length) stat.info = infos.join("; ");
  const notes = [
    ...(stat.inserted ? [`${stat.inserted} new people found on LinkedIn`] : []),
    ...(matched ? [`${matched} people matched to their LinkedIn profiles`] : []),
  ];
  return { stat, notes, changed };
}
