"use client";

import { LoaderCircle, Menu, Play, Search, X } from "lucide-react";
import { VIEWS } from "@/lib/console/views";
import { RANGE_LABELS } from "./format";
import { VIEW_ICONS } from "./icons";
import { useConsole, useCtl, useStore, useTopicData, type Range } from "./store";
import { Badge, Button, Kbd, Segmented, TimeAgo, Toggle } from "./ui";

const PHASE_LABELS: Record<string, string> = { collect: "Collecting", score: "Scoring", read: "Reading articles", brief: "Writing the brief" };

function LiveStatus() {
  const run = useConsole((s) => s.status?.running.find((r) => r.topicId === s.topicId)?.run);
  const starting = useConsole((s) => Boolean(s.starting[s.topicId]));
  const syncing = useConsole((s) => Boolean(s.loading[s.topicId]));
  const data = useTopicData();
  const ctl = useCtl();
  if (run || starting) {
    const p = run?.progress;
    const label = p ? PHASE_LABELS[p.phase] ?? "Running" : "Starting";
    return (
      <button
        type="button"
        onClick={() => ctl.setView("health")}
        className="inline-flex h-7 min-w-0 items-center gap-2 rounded-full border border-line-2 bg-panel px-2.5 text-[12px] font-medium text-fg"
        title="Open run details"
      >
        <LoaderCircle size={12} className="shrink-0 animate-spin" />
        <span className="truncate">
          {label}
          {p?.total ? (
            <span className="ml-1 font-mono text-[11px] opacity-80">
              {p.done ?? 0}/{p.total}
            </span>
          ) : null}
        </span>
      </button>
    );
  }
  // The dot says how the last run went: green, yellow when part of it failed, red when it failed.
  const last = data?.runs[0];
  const health = !last || last.status === "ok" || last.status === "running" ? null : last.status === "error" ? "failed" : "had problems";
  return (
    <button
      type="button"
      onClick={() => ctl.setView("health")}
      className={`inline-flex h-7 min-w-0 items-center gap-2 rounded-full border px-2.5 text-[12px] transition-colors hover:border-line-2 hover:text-fg ${
        last?.status === "error" ? "border-bad/30 text-bad" : "border-line text-fg-3"
      }`}
      title={health ? `The last run ${health}. Open Health.` : "Open Health"}
    >
      {syncing ? (
        <LoaderCircle size={12} className="shrink-0 animate-spin" />
      ) : (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            !last || last.status === "running" ? "bg-fg-3" : last.status === "ok" ? "bg-good-fill" : last.status === "error" ? "bg-bad-fill" : "bg-warn-fill"
          }`}
        />
      )}
      <span className="truncate">
        {syncing ? "Syncing" : last ? (
          <>
            {health ? `Last run ${health}` : "Last run"} <TimeAgo iso={last.finishedAt ?? last.startedAt} />
          </>
        ) : (
          "No runs yet"
        )}
      </span>
    </button>
  );
}

function SearchBox() {
  const store = useStore();
  const query = useConsole((s) => s.query);
  return (
    <div className="relative hidden w-[min(34vw,340px)] md:block">
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
      <input
        id="console-search"
        value={query}
        onChange={(e) => store.set({ query: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            store.set({ query: "" });
            e.currentTarget.blur();
          }
        }}
        placeholder="Filter items, people, sources"
        className="h-8 w-full rounded-lg border border-line bg-panel-2 pr-8 pl-8 text-[13px] text-fg placeholder:text-fg-3 focus:border-accent/60 focus:outline-none"
        aria-label="Filter the current view"
      />
      {query ? (
        <button
          type="button"
          onClick={() => store.set({ query: "" })}
          className="absolute top-1/2 right-1.5 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-fg-3 hover:text-fg"
          aria-label="Clear the filter"
        >
          <X size={12} />
        </button>
      ) : (
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
          <Kbd>/</Kbd>
        </span>
      )}
    </div>
  );
}

export function TopBar() {
  const store = useStore();
  const ctl = useCtl();
  const data = useTopicData();
  const name = useConsole((s) => s.topics.find((t) => t.id === s.topicId)?.name ?? s.payloads[s.topicId]?.topic.name ?? "");
  const active = useConsole((s) => s.topics.find((t) => t.id === s.topicId)?.active ?? true);
  const view = useConsole((s) => s.view);
  const range = useConsole((s) => s.range);
  const signalOnly = useConsole((s) => s.signalOnly);
  const busy = useConsole((s) => Boolean(s.status?.running.some((r) => r.topicId === s.topicId) || s.starting[s.topicId]));
  const filtersApply = view === "panel" || view === "stream" || view === "linkedin" || view === "youtube";
  // The YouTube view has its own Published filter, so only Signal applies there.
  const rangeApplies = filtersApply && view !== "youtube";
  const unscored = Boolean(data && data.totals.scored === 0);
  const signalHint = unscored ? "Nothing is scored yet, so everything shows" : "Only items scored as relevant, plus LinkedIn posts and videos not scored yet";

  return (
    <header className="border-b border-line bg-panel/70 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => store.set({ railOpen: true })}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-panel-2 lg:hidden"
          aria-label="Open topics"
        >
          <Menu size={17} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <h1 className="truncate text-[15px] font-semibold tracking-tight" title={data?.topic.description}>
            {name}
          </h1>
          {!active ? <Badge tone="warn">Archived</Badge> : null}
          <div className="hidden min-w-0 sm:block">
            <LiveStatus />
          </div>
        </div>
        <SearchBox />
        <button
          type="button"
          onClick={() => store.set({ palette: true })}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-panel-2 md:hidden"
          aria-label="Search"
        >
          <Search size={16} />
        </button>
        <Button variant="primary" icon={busy ? undefined : Play} loading={busy} onClick={() => ctl.run("full")} title="Collect, score, read and write the brief">
          <span className="hidden sm:inline">{busy ? "Running" : "Run now"}</span>
          <span className="sm:hidden">{busy ? "" : "Run"}</span>
        </Button>
      </div>
      <div className="flex items-center gap-3 px-2 sm:px-3">
        <nav className="scroll -mb-px flex min-w-0 flex-1 overflow-x-auto" aria-label="Views">
          {VIEWS.map((v, i) => {
            const Icon = VIEW_ICONS[v.id];
            const on = v.id === view;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => ctl.setView(v.id)}
                aria-current={on ? "page" : undefined}
                title={`${v.hint} (${i + 1})`}
                className={`relative inline-flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-[13px] transition-colors sm:px-3 ${
                  on ? "text-fg" : "text-fg-3 hover:text-fg"
                }`}
              >
                <Icon size={14} className={v.id === "linkedin" ? "text-people" : ""} />
                <span className={on ? "font-medium" : ""}>{v.label}</span>
                {on ? <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" /> : null}
              </button>
            );
          })}
        </nav>
        {filtersApply ? (
          <div className="hidden shrink-0 items-center gap-1 py-1.5 md:flex">
            <Toggle good checked={signalOnly && !unscored} disabled={unscored} onChange={(v) => store.set({ signalOnly: v })} label="Signal" hint={signalHint} />
            {rangeApplies ? (
              <Segmented<Range>
                label="Time range"
                value={range}
                onChange={(v) => store.set({ range: v })}
                options={(Object.keys(RANGE_LABELS) as Range[]).map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {filtersApply ? (
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5 md:hidden">
          <Toggle good checked={signalOnly && !unscored} disabled={unscored} onChange={(v) => store.set({ signalOnly: v })} label="Signal" hint={signalHint} />
          {rangeApplies ? (
            <Segmented<Range>
              label="Time range"
              value={range}
              onChange={(v) => store.set({ range: v })}
              options={(Object.keys(RANGE_LABELS) as Range[]).map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
            />
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
