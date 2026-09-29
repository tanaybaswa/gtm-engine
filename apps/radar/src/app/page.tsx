import { cookies } from "next/headers";
import { Console } from "@/components/console/console";
import { passwordConfigured } from "@/lib/auth";
import { timeZone } from "@/lib/config";
import { getConsoleData, getTopicSummaries } from "@/lib/console/data";
import type { ConsoleData, TopicSummaries } from "@/lib/console/types";
import { isView } from "@/lib/console/views";

// Runs started from the console, and new topics, finish in the background of this page's
// server actions. Vercel's free plan allows up to 300 seconds.
export const maxDuration = 300;

/** The request's clock, so the first paint's "4m ago" labels match what the browser shows. */
async function requestTime(): Promise<number> {
  return Date.now();
}

/** A topic created moments ago may not be in the cached rail yet. */
function withTopic(summaries: TopicSummaries, data: ConsoleData | null): TopicSummaries {
  if (!data || summaries.topics.some((t) => t.id === data.topic.id)) return summaries;
  const { id, slug, name, active } = data.topic;
  return {
    ...summaries,
    topics: [...summaries.topics, { id, slug, name, active, items: data.totals.items, new24h: 0, relevant24h: 0, spark: [], lastRun: null }],
  };
}

export default async function ConsolePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const requested = Number(params.topic);
  // Both come from the data cache, so this page rarely waits on the database.
  const [summaries, requestedData] = await Promise.all([
    getTopicSummaries(),
    Number.isInteger(requested) && requested > 0 ? getConsoleData(requested) : Promise.resolve(null),
  ]);
  const fallback = summaries.topics.find((t) => t.active) ?? summaries.topics[0];
  const data = requestedData ?? (fallback ? await getConsoleData(fallback.id) : null);
  const theme = (await cookies()).get("radar-theme")?.value === "light" ? "light" : "dark";
  const serverNow = await requestTime();

  return (
    <Console
      initial={{
        summaries: withTopic(summaries, data),
        topicId: data?.topic.id ?? fallback?.id ?? 0,
        data,
        view: isView(params.view) ? params.view : "panel",
        timeZone,
        serverNow,
        theme,
        canSignOut: passwordConfigured(),
      }}
    />
  );
}
