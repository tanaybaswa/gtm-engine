import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { usage } from "@/db/schema";
import { currentMonth } from "@/lib/config";

export type Meter =
  | "x_post_reads"
  | "x_user_reads"
  | "x_cost_microusd"
  | "serper_queries"
  | "ai_cost_microusd"
  | "ai_input_tokens"
  | "ai_output_tokens";

export async function getUsage(meter: Meter, month = currentMonth()): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ amount: usage.amount })
    .from(usage)
    .where(and(eq(usage.month, month), eq(usage.meter, meter)));
  return rows[0]?.amount ?? 0;
}

export async function addUsage(meter: Meter, amount: number, month = currentMonth()): Promise<void> {
  if (amount <= 0) return;
  const db = await getDb();
  await db
    .insert(usage)
    .values({ month, meter, amount: Math.round(amount) })
    .onConflictDoUpdate({
      target: [usage.month, usage.meter],
      set: { amount: sql`${usage.amount} + ${Math.round(amount)}` },
    });
}

export async function getMonthUsage(month = currentMonth()): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.select().from(usage).where(eq(usage.month, month));
  return Object.fromEntries(rows.map((r) => [r.meter, r.amount]));
}
