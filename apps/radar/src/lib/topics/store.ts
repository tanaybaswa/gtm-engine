import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { topics, type Topic } from "@/db/schema";
import { defaultTopics } from "./defaults";
import { topicConfigSchema } from "./types";

/** Inserts the default topics if they are missing. Existing topics are left alone. */
export async function ensureDefaultTopics(): Promise<void> {
  const db = await getDb();
  for (const seed of defaultTopics) {
    await db
      .insert(topics)
      .values({
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        config: topicConfigSchema.parse(seed.config),
      })
      .onConflictDoNothing({ target: topics.slug });
  }
}

export async function listTopics(): Promise<Topic[]> {
  await ensureDefaultTopics();
  const db = await getDb();
  const rows = await db.select().from(topics).orderBy(asc(topics.id));
  return rows.map((t) => ({ ...t, config: topicConfigSchema.parse(t.config) }));
}

export async function getTopic(id: number): Promise<Topic | undefined> {
  const db = await getDb();
  const rows = await db.select().from(topics).where(eq(topics.id, id));
  const topic = rows[0];
  // Older rows get new config fields filled with their defaults.
  return topic ? { ...topic, config: topicConfigSchema.parse(topic.config) } : undefined;
}

export async function getDefaultTopic(): Promise<Topic | undefined> {
  const all = await listTopics();
  return all.find((t) => t.active) ?? all[0];
}
