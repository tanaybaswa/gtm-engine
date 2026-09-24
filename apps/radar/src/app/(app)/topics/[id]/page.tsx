import { notFound } from "next/navigation";
import { removeFeed, resetTopic, runNow } from "@/app/actions";
import { AutoRefresh, SubmitButton } from "@/components/client";
import { TopicForm } from "@/components/forms";
import { Badge, Card, ExternalLink, formatDateTime, Notice, PageHeader, TableWrap, Td, Th, timeAgo } from "@/components/ui";
import { config } from "@/lib/config";
import { activeRun, recentRuns } from "@/lib/pipeline/runs";
import { connectorLabel } from "@/lib/sources";
import { defaultTopics } from "@/lib/topics/defaults";
import { getTopic } from "@/lib/topics/store";
import { getMonthUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";
// Run buttons start work in the background of this page's server action.
export const maxDuration = 300;

const RUN_BUTTONS = [
  { stage: "full", label: "Run everything", variant: "primary" },
  { stage: "collect", label: "Collect only", variant: "secondary" },
  { stage: "enrich", label: "Score and read", variant: "secondary" },
  { stage: "brief", label: "Write brief", variant: "secondary" },
] as const;

function Meter({ label, used, cap, unit }: { label: string; used: number; cap: number; unit: "usd" | "count" }) {
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const fmt = (n: number) => (unit === "usd" ? `$${n.toFixed(2)}` : n.toLocaleString());
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
          {fmt(used)} of {unit === "usd" ? `$${cap}` : cap.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-1.5 rounded-full ${pct >= 90 ? "bg-red-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function TopicPage({ params, searchParams }: PageProps<"/topics/[id]">) {
  const { id } = await params;
  const flags = await searchParams;
  const topic = await getTopic(Number(id));
  if (!topic) notFound();
  const [runs, running, usage] = await Promise.all([recentRuns(topic.id), activeRun(topic.id), getMonthUsage()]);
  const lastCollect = runs.find((r) => r.stats.connectors && (r.stage === "collect" || r.stage === "full"));
  const hasDefaults = defaultTopics.some((t) => t.slug === topic.slug);

  return (
    <div className="space-y-6">
      <PageHeader
        title={topic.name}
        subtitle="Runs, source health, spend and settings."
        actions={RUN_BUTTONS.map((b) => (
          <form key={b.stage} action={runNow}>
            <input type="hidden" name="topicId" value={topic.id} />
            <input type="hidden" name="stage" value={b.stage} />
            <SubmitButton variant={b.variant} pendingText="Starting...">
              {b.label}
            </SubmitButton>
          </form>
        ))}
      />
      <AutoRefresh active={Boolean(running)} />
      {flags.started ? <Notice tone="green">Run started. This page updates while it works; a full run takes one to four minutes.</Notice> : null}
      {flags.busy ? <Notice tone="amber">A run is already in progress for this topic.</Notice> : null}
      {flags.reset ? <Notice tone="green">Settings reset to the defaults.</Notice> : null}
      {running ? (
        <Notice tone="amber">
          Running {running.stage} (started {timeAgo(running.startedAt)})...
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Source health</h2>
          <p className="mb-2 text-sm text-zinc-500">
            {lastCollect ? `From the collection ${timeAgo(lastCollect.startedAt)}.` : "No collection has run yet."}
          </p>
          {lastCollect?.stats.connectors ? (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Source</Th>
                  <Th className="text-right">Found</Th>
                  <Th className="text-right">New</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(lastCollect.stats.connectors).map(([key, stat]) => (
                  <tr key={key}>
                    <Td className="font-medium">{connectorLabel(key)}</Td>
                    <Td className="text-right tabular-nums">{stat.fetched}</Td>
                    <Td className="text-right tabular-nums">{stat.inserted}</Td>
                    <Td className="max-w-[260px] text-xs">
                      {stat.skipped ? (
                        <Badge>{stat.skipped}</Badge>
                      ) : stat.error ? (
                        <span className="break-anywhere text-amber-700 dark:text-amber-400" title={stat.error}>
                          {stat.error.slice(0, 140)}
                        </span>
                      ) : (
                        <Badge tone="green">ok · {(stat.ms / 1000).toFixed(1)}s</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : null}
        </Card>

        <Card>
          <h2 className="font-semibold">Spend this month</h2>
          <p className="mb-3 text-sm text-zinc-500">Radar stops each paid source at its cap. Everything else is free.</p>
          <div className="space-y-4">
            <Meter
              label={config.aiEnabled() ? `Claude (${config.model})` : "Claude (off: no API key)"}
              used={(usage.ai_cost_microusd ?? 0) / 1_000_000}
              cap={config.aiMonthlyBudgetUsd}
              unit="usd"
            />
            <Meter
              label={config.xBearerToken() ? "X API" : "X API (off: no token)"}
              used={(usage.x_cost_microusd ?? 0) / 1_000_000}
              cap={config.xMonthlyBudgetUsd}
              unit="usd"
            />
            <Meter
              label={config.serperApiKey() ? "Serper searches" : "Serper searches (off: no key)"}
              used={usage.serper_queries ?? 0}
              cap={config.serperMonthlyQueries}
              unit="count"
            />
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">Recent runs</h2>
        {runs.length ? (
          <TableWrap>
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Stage</Th>
                <Th>Trigger</Th>
                <Th>Status</Th>
                <Th>What happened</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(r.startedAt)}</Td>
                  <Td>{r.stage}</Td>
                  <Td className="text-zinc-500">{r.trigger}</Td>
                  <Td>
                    <Badge tone={r.status === "ok" ? "green" : r.status === "running" ? "indigo" : r.status === "partial" ? "amber" : "red"}>
                      {r.status}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-zinc-600 dark:text-zinc-400">
                    {[...(r.stats.notes ?? []), r.stats.aiSkipped ? `AI skipped: ${r.stats.aiSkipped}` : null, r.error]
                      .filter(Boolean)
                      .join(" · ")}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <p className="text-sm text-zinc-500">No runs yet.</p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Feeds ({topic.config.feeds.length})</h2>
        <p className="mb-2 text-sm text-zinc-500">Follow sources on the Sources page to add their feeds here, or edit the settings below.</p>
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {topic.config.feeds.map((f) => (
            <li key={f.url} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="font-medium">{f.name ?? f.url}</div>
                <ExternalLink href={f.url} className="block text-xs break-anywhere">
                  {f.url}
                </ExternalLink>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {f.kind ? <Badge>{f.kind.replaceAll("_", " ")}</Badge> : null}
                {f.filter === false ? <Badge tone="indigo">keeps all</Badge> : null}
                <form action={removeFeed}>
                  <input type="hidden" name="topicId" value={topic.id} />
                  <input type="hidden" name="url" value={f.url} />
                  <SubmitButton variant="subtle" pendingText="...">
                    Remove
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Settings</h2>
        <TopicForm id={topic.id} name={topic.name} description={topic.description} config={JSON.stringify(topic.config, null, 2)} />
        {hasDefaults ? (
          <form action={resetTopic} className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <input type="hidden" name="id" value={topic.id} />
            <SubmitButton variant="subtle" pendingText="Resetting...">
              Reset to defaults
            </SubmitButton>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
