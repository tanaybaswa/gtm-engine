// Local runner: `npm run radar -- <collect|enrich|brief|run|status> [topic-slug]`
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "../src/db/index";
import { items, sources } from "../src/db/schema";
import { runStage } from "../src/lib/pipeline";
import { getDefaultTopic, listTopics } from "../src/lib/topics/store";

async function main() {
  const [command = "status", slug] = process.argv.slice(2);
  const all = await listTopics();
  const topic = slug ? all.find((t) => t.slug === slug) : await getDefaultTopic();
  if (!topic) throw new Error(`No topic found${slug ? ` for "${slug}"` : ""}.`);

  if (command === "status") {
    const db = await getDb();
    const counts = await db
      .select({ source: items.source, status: items.status, n: sql<number>`count(*)::int` })
      .from(items)
      .where(eq(items.topicId, topic.id))
      .groupBy(items.source, items.status);
    console.table(counts);
    const top = await db.select().from(sources).orderBy(desc(sources.itemCount)).limit(15);
    console.table(top.map((s) => ({ key: s.key, name: s.name, items: s.itemCount, relevant: s.relevantCount, origin: s.originCount })));
    return;
  }

  const stages = ["collect", "enrich", "brief", "run"];
  if (!stages.includes(command)) throw new Error(`Unknown command "${command}". Use one of: ${stages.join(", ")}, status.`);
  const stage = command === "run" ? "full" : (command as "collect" | "enrich" | "brief");
  const result = await runStage(topic, stage, "cli", { budgetSeconds: 600, log: (m) => console.log(`  ${m}`) });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
