import Link from "next/link";
import { runNow } from "@/app/actions";
import { AutoRefresh, SubmitButton } from "@/components/client";
import { ItemList, itemHref } from "@/components/items";
import { Badge, Card, EmptyState, ExternalLink, formatDate, Notice, PageHeader, timeAgo } from "@/components/ui";
import type { PrimarySource } from "@/db/schema";
import { config } from "@/lib/config";
import { activeRun, recentRuns } from "@/lib/pipeline/runs";
import { briefDates, briefFor, listItems, risingPeople, type StoryView } from "@/lib/queries";
import { getDefaultTopic } from "@/lib/topics/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function primarySourcesOf(story: StoryView): PrimarySource[] {
  const withSources = [story.origin, ...story.others].find((i) => i?.primarySources?.length);
  return withSources?.primarySources?.slice(0, 3) ?? [];
}

function StoryCard({ story }: { story: StoryView }) {
  const primary = primarySourcesOf(story);
  const hint = [story.origin, ...story.others].find((i) => i?.originHint)?.originHint;
  return (
    <Card>
      <div className="flex gap-3">
        <span className="mt-0.5 w-5 shrink-0 text-right text-sm font-semibold text-zinc-400">{story.rank}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-snug font-semibold">{story.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{story.summary}</p>
          {story.whyItMatters ? (
            <p className="mt-2 text-sm leading-relaxed">
              <span className="font-medium">Why it matters: </span>
              {story.whyItMatters}
            </p>
          ) : null}

          <div className="mt-3 space-y-2 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
            {story.origin ? (
              <div className="break-anywhere">
                <Badge tone="green">Origin</Badge>{" "}
                <ExternalLink href={itemHref(story.origin)}>{story.origin.title}</ExternalLink>
                <span className="text-zinc-500">
                  {" "}
                  · {story.origin.outlet ?? story.origin.sourceKey} · {formatDate(story.origin.publishedAt)}
                </span>
              </div>
            ) : (
              <p className="text-zinc-600 dark:text-zinc-400">
                <Badge tone="amber">Origin not collected</Badge> {hint ? `Points back to ${hint}.` : "None of today's items is the original."}
              </p>
            )}
            {primary.map((p) => (
              <div key={`${p.title}-${p.url}`} className="break-anywhere text-zinc-700 dark:text-zinc-300">
                <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Primary source </span>
                {p.url ? <ExternalLink href={p.url}>{p.title}</ExternalLink> : p.title}
                {p.publisher ? <span className="text-zinc-500"> ({p.publisher})</span> : null}
              </div>
            ))}
            {story.others.length ? (
              <div className="text-xs text-zinc-500">
                Also covered by{" "}
                {story.others.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 ? ", " : ""}
                    <ExternalLink href={itemHref(o)}>{o.outlet ?? o.sourceKey}</ExternalLink>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {story.peopleNames.length || story.orgNames.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {story.peopleNames.map((name) => (
                <Link
                  key={`p-${name}`}
                  href={`/people?q=${encodeURIComponent(name)}`}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300"
                >
                  {name}
                </Link>
              ))}
              {story.orgNames.map((name) => (
                <Link
                  key={`o-${name}`}
                  href={`/people?view=orgs&q=${encodeURIComponent(name)}`}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default async function BriefPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const topic = await getDefaultTopic();
  if (!topic) return <EmptyState title="No topics yet." />;

  const dates = await briefDates(topic.id);
  const date = typeof params.date === "string" && dates.includes(params.date) ? params.date : dates[0];
  const [stories, rising, running, runs] = await Promise.all([
    date ? briefFor(topic.id, date) : Promise.resolve([]),
    risingPeople(topic.id),
    activeRun(topic.id),
    recentRuns(topic.id, 1),
  ]);
  const latest = stories.length ? [] : await listItems(topic.id, { limit: 40 });
  const aiOn = config.aiEnabled();
  const lastRun = runs[0];

  return (
    <div>
      <PageHeader
        title="Brief"
        subtitle={
          <>
            {topic.name}
            {date ? ` · ${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}` : ""}
          </>
        }
        actions={
          <form action={runNow}>
            <input type="hidden" name="topicId" value={topic.id} />
            <input type="hidden" name="stage" value="full" />
            <SubmitButton pendingText="Starting...">Run now</SubmitButton>
          </form>
        }
      />
      <AutoRefresh active={Boolean(running)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {running ? (
            <Notice tone="amber">
              A {running.stage === "full" ? "full" : running.stage} run started {timeAgo(running.startedAt)}. This page refreshes on its own.
            </Notice>
          ) : null}
          {!aiOn ? (
            <Notice tone="amber">
              AI is off, so there is no brief yet. Add <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> to score items, find
              the people behind them, and write the daily brief. Until then, here is everything Radar collected.
            </Notice>
          ) : null}

          {stories.length ? (
            stories.map((story) => <StoryCard key={story.id} story={story} />)
          ) : (
            <Card>
              <h2 className="mb-1 font-semibold">Latest collected</h2>
              <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
                {aiOn ? "No brief yet for today. It is written each morning, or when you press Run now." : "Newest first, across every source."}
              </p>
              {latest.length ? (
                <ItemList items={latest} />
              ) : (
                <EmptyState title="Nothing collected yet.">Press Run now to pull from every source.</EmptyState>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="text-sm font-semibold">People to know this week</h2>
            {rising.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {rising.map((p) => (
                  <li key={p.id}>
                    <Link href={`/people/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="ml-1 text-xs text-zinc-500">×{p.mentions}</span>
                    {p.role || p.orgName ? (
                      <div className="text-xs text-zinc-500">{[p.role, p.orgName].filter(Boolean).join(", ")}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">People appear here once items are scored.</p>
            )}
            <Link href="/people" className="mt-3 inline-block text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300">
              Everyone we have found
            </Link>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">Runs</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {lastRun ? `Last run ${timeAgo(lastRun.startedAt)} (${lastRun.status}).` : "No runs yet."} Scheduled runs collect twice a
              day and write the brief each morning.
            </p>
            <Link href={`/topics/${topic.id}`} className="mt-2 inline-block text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300">
              Source health and settings
            </Link>
          </Card>

          {dates.length > 1 ? (
            <Card>
              <h2 className="text-sm font-semibold">Earlier briefs</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {dates.map((d) => (
                  <li key={d}>
                    <Link
                      href={`/?date=${d}`}
                      className={`rounded-md px-2 py-1 text-xs ${d === date ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800"}`}
                    >
                      {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
