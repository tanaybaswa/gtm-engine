import Link from "next/link";
import { Card, PageHeader, timeAgo } from "@/components/ui";
import { listTopics } from "@/lib/topics/store";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const topics = await listTopics();
  return (
    <div>
      <PageHeader title="Topics" subtitle="What Radar watches. Each topic has its own searches, feeds and watchlist." />
      <div className="space-y-3">
        {topics.map((t) => (
          <Card key={t.id}>
            <Link href={`/topics/${t.id}`} className="text-lg font-semibold hover:underline">
              {t.name}
            </Link>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t.description}</p>
            <p className="mt-2 text-xs text-zinc-500">
              {t.config.feeds.length} feeds · {t.config.queries.googleNews.length} news searches · updated {timeAgo(t.updatedAt)}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
