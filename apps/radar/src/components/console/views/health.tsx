"use client";

import { Activity, CalendarClock, Check, CircleAlert, LoaderCircle, Play } from "lucide-react";
import type { RunStage } from "@/db/schema";
import { CONNECTOR_LABELS, type RunDTO } from "@/lib/console/types";
import { duration, formatDateTime, usd } from "../format";
import { useConsole, useCtl, useTopicData } from "../store";
import { Badge, Button, Empty, Meter, Panel, Skeleton, TimeAgo } from "../ui";

const RUN_BUTTONS: { stage: RunStage; label: string; hint: string }[] = [
  { stage: "collect", label: "Collect", hint: "Search every source and store new items" },
  { stage: "enrich", label: "Score and read", hint: "Claude scores new items and reads the best ones in full" },
  { stage: "brief", label: "Write brief", hint: "Group today's relevant items into stories" },
];

const PHASES = [
  { id: "collect", label: "Collect" },
  { id: "score", label: "Score" },
  { id: "read", label: "Read" },
  { id: "brief", label: "Brief" },
] as const;

const STAGE_PHASES: Record<RunStage, string[]> = {
  full: ["collect", "score", "read", "brief"],
  collect: ["collect"],
  enrich: ["score", "read"],
  brief: ["score", "read", "brief"],
};

const STAGE_LABELS: Record<string, string> = { full: "Full run", collect: "Collect", enrich: "Score and read", brief: "Brief" };

// Matches vercel.json. Vercel's free plan starts each job within the hour.
const SCHEDULE = [
  { label: "Collect", hours: [2, 11] },
  { label: "Score and read", hours: [3, 12] },
  { label: "Write the brief", hours: [13] },
];

export function StatusBadge({ status }: { status: string }) {
  if (status === "ok") return <Badge tone="good"><Check size={11} /> OK</Badge>;
  if (status === "running") return <Badge tone="accent"><LoaderCircle size={11} className="animate-spin" /> Running</Badge>;
  if (status === "partial") return <Badge tone="warn"><CircleAlert size={11} /> Partial</Badge>;
  if (status === "timeout") return <Badge tone="warn"><CircleAlert size={11} /> Cut off</Badge>;
  return <Badge tone="bad"><CircleAlert size={11} /> Error</Badge>;
}

export function RunProgressPanel({ run }: { run: RunDTO }) {
  const now = useConsole((s) => s.now);
  const phases = PHASES.filter((p) => STAGE_PHASES[run.stage].includes(p.id));
  const current = run.progress?.phase ?? phases[0]?.id;
  const currentIndex = phases.findIndex((p) => p.id === current);
  const fraction = run.progress?.total ? Math.min(1, (run.progress.done ?? 0) / run.progress.total) : null;
  return (
    <div className="rounded-xl border border-line-2 bg-panel-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-accent" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          {STAGE_LABELS[run.stage] ?? run.stage} in progress
        </div>
        <span className="font-mono text-[12px] text-fg-2">{duration(run.startedAt, null, now)}</span>
      </div>
      <ol className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}>
        {phases.map((phase, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={phase.id}>
              <div className="h-1 overflow-hidden rounded-full bg-line">
                {done ? <div className="h-full w-full bg-accent" /> : null}
                {active ? (
                  fraction !== null ? (
                    <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(6, fraction * 100)}%` }} />
                  ) : (
                    <div className="animate-indeterminate h-full w-2/5 bg-accent" />
                  )
                ) : null}
              </div>
              <div className={`mt-1.5 text-[12px] ${active ? "text-fg" : done ? "text-fg-2" : "text-fg-3"}`}>
                {phase.label}
                {active && run.progress?.total ? (
                  <span className="ml-1 font-mono text-[11px] text-fg-3">
                    {run.progress.done ?? 0}/{run.progress.total}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {run.progress?.detail ? <div className="mt-2 truncate text-[12px] text-fg-3">{run.progress.detail}</div> : null}
    </div>
  );
}

export function HealthView() {
  const data = useTopicData();
  const ctl = useCtl();
  const timeZone = useConsole((s) => s.timeZone);
  const now = useConsole((s) => s.now);
  const active = useConsole((s) => s.status?.running.find((r) => r.topicId === s.topicId)?.run);
  const starting = useConsole((s) => Boolean(s.starting[s.topicId]));
  if (!data) {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-56 !rounded-xl" />
        ))}
      </div>
    );
  }
  const busy = Boolean(active) || starting;
  const lastCollect = data.runs.find((r) => r.connectors);
  const scheduleTime = (hour: number) => {
    const d = new Date();
    d.setUTCHours(hour, 0, 0, 0);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(d);
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-4 sm:p-5">
      <Panel title="Run now" meta={data.topic.active ? "Also runs on the schedule below" : "Archived: scheduled runs are off"}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={Play} loading={busy} onClick={() => ctl.run("full")}>
            {busy ? "Running" : "Run everything"}
          </Button>
          {RUN_BUTTONS.map((b) => (
            <Button key={b.stage} title={b.hint} disabled={busy} onClick={() => ctl.run(b.stage)}>
              {b.label}
            </Button>
          ))}
          <span className="text-[12px] text-fg-3">A full run takes two to four minutes.</span>
        </div>
        {active ? (
          <div className="mt-4">
            <RunProgressPanel run={active} />
          </div>
        ) : starting ? (
          <div className="mt-4 flex items-center gap-2 text-[13px] text-fg-2">
            <LoaderCircle size={14} className="animate-spin text-accent" /> Starting...
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel
          title="Source health"
          meta={lastCollect ? <>From the collection <TimeAgo iso={lastCollect.startedAt} /></> : "No collection yet"}
          bodyClassName="p-0"
        >
          {lastCollect?.connectors ? (
            <table className="w-full border-collapse text-[13px]">
              <thead className="border-b border-line text-left">
                <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:font-normal">
                  <th className="label">Source</th>
                  <th className="label text-right">Found</th>
                  <th className="label text-right">New</th>
                  <th className="label">Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(lastCollect.connectors).map(([key, stat]) => (
                  <tr key={key} className="border-b border-line align-top last:border-0 [&>td]:px-4 [&>td]:py-2.5">
                    <td className="font-medium whitespace-nowrap">{CONNECTOR_LABELS[key] ?? key}</td>
                    <td className="text-right font-mono tabular-nums">{stat.fetched}</td>
                    <td className="text-right font-mono tabular-nums">{stat.inserted}</td>
                    <td className="max-w-[320px] text-[12px]">
                      {stat.skipped ? (
                        <span className="text-fg-3">Off: {stat.skipped}</span>
                      ) : stat.error ? (
                        <span className="break-anywhere text-bad" title={stat.error}>
                          {stat.error.slice(0, 160)}
                        </span>
                      ) : (
                        <>
                          <span className="font-medium text-good">OK · {(stat.ms / 1000).toFixed(1)}s</span>
                          {stat.info ? <span className="block text-fg-3">{stat.info}</span> : null}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4">
              <Empty icon={Activity} title="No collection yet">Run a collection to see how each source is doing.</Empty>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Spend this month" meta="Paid sources stop at their cap">
            <div className="space-y-4">
              <Meter
                label={`Claude (${data.spend.model})`}
                used={data.spend.ai.usd}
                cap={data.spend.ai.capUsd}
                format={usd}
                off={data.spend.ai.enabled ? undefined : "Off: no API key"}
              />
              <Meter label="X API" used={data.spend.x.usd} cap={data.spend.x.capUsd} format={usd} off={data.spend.x.enabled ? undefined : "Off: no token"} />
              <Meter
                label="Serper searches"
                used={data.spend.serper.queries}
                cap={data.spend.serper.cap}
                format={(n) => n.toLocaleString()}
                off={data.spend.serper.enabled ? undefined : "Off: no key"}
              />
            </div>
          </Panel>
          <Panel title="Schedule" meta={timeZone.replaceAll("_", " ")}>
            <ul className="space-y-2 text-[13px]">
              {SCHEDULE.map((job) => (
                <li key={job.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-fg-2">
                    <CalendarClock size={13} className="text-fg-3" /> {job.label}
                  </span>
                  <span className="font-mono text-[12px] text-fg">{job.hours.map(scheduleTime).join(" and ")}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-fg-3">Vercel&apos;s free plan starts each job within the hour.</p>
          </Panel>
        </div>
      </div>

      <Panel title="Recent runs" bodyClassName="p-0">
        {data.runs.length ? (
          <ul>
            {data.runs.map((r) => (
              <li key={r.id} className="grid gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-[13px] last:border-0 sm:grid-cols-[150px_110px_90px_minmax(0,1fr)]">
                <span className="text-fg-2">{formatDateTime(r.startedAt, timeZone)}</span>
                <span>
                  {STAGE_LABELS[r.stage] ?? r.stage}
                  <span className="ml-1.5 text-[11.5px] text-fg-3">{r.trigger}</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                </span>
                <span className="min-w-0 text-[12px] text-fg-3">
                  <span className="mr-2 font-mono">{duration(r.startedAt, r.finishedAt, now)}</span>
                  {[...r.notes, r.aiSkipped ? `AI skipped: ${r.aiSkipped}` : null, r.error].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 text-[13px] text-fg-3">No runs yet.</div>
        )}
      </Panel>
    </div>
  );
}
