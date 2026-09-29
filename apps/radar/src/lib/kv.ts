import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { kv } from "@/db/schema";

/** Small JSON values kept between runs. */
export async function getKv<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const rows = await db.select({ value: kv.value }).from(kv).where(eq(kv.key, key));
  return rows[0]?.value as T | undefined;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .insert(kv)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: kv.key, set: { value, updatedAt: now } });
}
