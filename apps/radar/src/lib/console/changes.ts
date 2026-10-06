import { eq } from "drizzle-orm";
import { revalidateTag, updateTag } from "next/cache";
import { getDb } from "@/db";
import { kv } from "@/db/schema";

/** Every cached console payload carries this tag. */
export const RADAR_TAG = "radar";
const CHANGED_KEY = "radar:changed";

/**
 * Records that data changed (a run stage finished, or someone edited a topic, a follow or a
 * watch) and marks cached payloads stale. Open consoles poll the timestamp and refetch.
 *
 * Edits made in the console pass readYourWrites: the next page load then waits for fresh data.
 * Serving the old payload there made a page reloaded right after an edit render one version on
 * the server and, once the console fetched the new one, another in the browser.
 */
export async function markChanged({ readYourWrites = false }: { readYourWrites?: boolean } = {}): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const value = { at: now.toISOString() };
  await db
    .insert(kv)
    .values({ key: CHANGED_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: kv.key, set: { value, updatedAt: now } });
  try {
    // Runs: stale-while-revalidate, so the next reader gets the old payload at once and a fresh
    // one is built in the background. Edits (server actions only): expire it now.
    if (readYourWrites) updateTag(RADAR_TAG);
    else revalidateTag(RADAR_TAG, "max");
  } catch {
    // Outside a Next.js request (the CLI, tests) there is no cache to mark.
  }
}

export async function changedAt(): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select({ updatedAt: kv.updatedAt }).from(kv).where(eq(kv.key, CHANGED_KEY));
  return rows[0]?.updatedAt.toISOString() ?? null;
}
