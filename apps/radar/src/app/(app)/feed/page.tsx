import { ItemList } from "@/components/items";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { connectorLabel, connectors } from "@/lib/sources";
import { itemCounts, listItems } from "@/lib/queries";
import { getDefaultTopic } from "@/lib/topics/store";

export const dynamic = "force-dynamic";

const SOURCE_IDS = [...connectors.map((c) => c.id), "linkedin"];

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const params = await searchParams;
  const topic = await getDefaultTopic();
  if (!topic) return <EmptyState title="No topics yet." />;
  const source = typeof params.source === "string" && SOURCE_IDS.includes(params.source) ? params.source : undefined;
  const minRelevance = Number(params.min) || undefined;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const [rows, counts] = await Promise.all([listItems(topic.id, { source, minRelevance, q }), itemCounts(topic.id)]);

  return (
    <div>
      <PageHeader
        title="Feed"
        subtitle={`Everything collected for ${topic.name}: ${counts.total} items from ${counts.sources} source types, ${counts.scored} scored.`}
      />
      <form action="/feed" className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search headlines or outlets"
          className="w-60 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select name="source" defaultValue={source ?? ""} className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <option value="">All sources</option>
          {SOURCE_IDS.map((id) => (
            <option key={id} value={id}>
              {connectorLabel(id)}
            </option>
          ))}
        </select>
        <select name="min" defaultValue={minRelevance ?? ""} className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <option value="">Any relevance</option>
          <option value="20">20 and up</option>
          <option value="55">55 and up (relevant)</option>
          <option value="80">80 and up (core)</option>
        </select>
        <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">Filter</button>
      </form>
      <Card>{rows.length ? <ItemList items={rows} /> : <EmptyState title="Nothing matches these filters." />}</Card>
    </div>
  );
}
