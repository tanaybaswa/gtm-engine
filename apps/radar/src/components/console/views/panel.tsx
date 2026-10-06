"use client";

import { ArrowRight, CircleDot, Maximize2, Play, Sparkles, Users } from "lucide-react";
import { useMemo } from "react";
import { STREAMS, type ConsoleData, type ItemDTO, type StreamId } from "@/lib/console/types";
import { byNewest, isSignal, storiesFor, storyItems, useFilteredItems } from "../derive";
import { formatBriefDate, formatDay, usd } from "../format";
import { STREAM_ICONS } from "../icons";
import { ItemCompact } from "../items";
import { useConsole, useCtl, useStore, useTopicData } from "../store";
import { Button, capFill, Empty, Skeleton, StatTile } from "../ui";

function Telemetry({ data }: { data: ConsoleData }) {
  const days = data.daily;
  const labels = days.map((d) => formatDay(`${d.date}T12:00:00Z`, "UTC"));
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];
  const voices = data.people.filter((p) => p.voice);
  const watched = data.people.filter((p) => p.watched).length + data.orgs.filter((o) => o.watched).length;
  const followed = data.sources.filter((s) => s.followed).length;
  const spendPct = data.spend.ai.capUsd ? Math.min(100, (data.spend.ai.usd / data.spend.ai.capUsd) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatTile
        label="Items today"
        value={today?.items ?? 0}
        foot={`${yesterday?.items ?? 0} yesterday · ${data.totals.items.toLocaleString()} in all`}
        spark={{ values: days.map((d) => d.items), labels }}
      />
      <StatTile
        label="Signal today"
        tone={today?.relevant ? "good" : undefined}
        value={today?.relevant ?? 0}
        foot={`${yesterday?.relevant ?? 0} yesterday · scored ${data.topic.config.relevanceThreshold}+`}
        spark={{ values: days.map((d) => d.relevant), labels }}
      />
      <StatTile label="Origins found" tone={data.totals.origins ? "good" : undefined} value={data.totals.origins} foot={`of ${data.totals.relevant} relevant items`} />
      <StatTile label="Voices" tone={voices.length ? "people" : undefined} value={voices.length} foot={`${watched} watched · ${data.people.length} people named`} />
      <StatTile label="Sources" value={data.sources.length} foot={`${followed} followed directly`} />
      <StatTile
        label="Claude this month"
        value={data.spend.ai.enabled ? usd(data.spend.ai.usd) : "Off"}
        foot={data.spend.ai.enabled ? `of ${usd(data.spend.ai.capUsd)} cap` : "Add ANTHROPIC_API_KEY"}
      >
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div className={`h-full rounded-full ${capFill(spendPct)}`} style={{ width: `${spendPct}%` }} />
        </div>
      </StatTile>
    </div>
  );
}

function BriefStrip({ data }: { data: ConsoleData }) {
  const ctl = useCtl();
  const date = data.briefDates[0];
  const stories = storiesFor(data, date);
  if (!stories.length) {
    return (
      <div className="surface flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2.5 text-[13px] text-fg-2">
          <Sparkles size={15} className="text-fg-3" />
          {data.spend.ai.enabled ? "No brief yet. It is written each morning, or on demand." : "The brief needs Claude. Add ANTHROPIC_API_KEY to turn it on."}
        </div>
        {data.spend.ai.enabled ? (
          <Button size="sm" icon={Play} onClick={() => ctl.run("brief")}>
            Write the brief
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="label !text-fg-2">Brief</h2>
          <span className="text-[12px] text-fg-3">{formatBriefDate(date)}</span>
        </div>
        <button type="button" onClick={() => ctl.setView("brief")} className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-2 hover:text-fg">
          Read the brief <ArrowRight size={13} />
        </button>
      </div>
      <ol className="scroll flex snap-x gap-3 overflow-x-auto pb-1">
        {stories.map((story) => {
          const items = storyItems(data, story);
          const origin = items.find((i) => i.id === story.originItemId);
          return (
            <li key={story.id} className="w-[290px] shrink-0 snap-start sm:w-[320px]">
              <button
                type="button"
                onClick={() => ctl.open({ kind: "story", id: story.id })}
                className="surface group flex h-full w-full flex-col rounded-xl p-3.5 text-left transition-colors hover:border-line-2"
              >
                <div className="flex items-start gap-2.5">
                  <span className="font-mono text-[12px] text-fg-3 tabular-nums">{String(story.rank).padStart(2, "0")}</span>
                  <span className="line-clamp-2 text-[13.5px] leading-snug font-semibold text-fg decoration-fg-3/40 underline-offset-[3px] group-hover:underline">{story.title}</span>
                </div>
                <div className="mt-auto flex items-center gap-3 pt-2.5 pl-6 text-[11.5px] text-fg-3">
                  {origin ? (
                    <span className="inline-flex min-w-0 items-center gap-1 truncate" title="Where the story started">
                      <CircleDot size={11} className="shrink-0 text-good" />
                      <span className="truncate">{origin.outlet ?? origin.sourceKey}</span>
                    </span>
                  ) : (
                    <span>Origin not collected</span>
                  )}
                  <span className="shrink-0">{items.length} sources</span>
                  {story.peopleNames.length ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-people" title={story.peopleNames.join(", ")}>
                      <Users size={11} /> {story.peopleNames.length}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StreamColumn({ stream, items, total, data }: { stream: (typeof STREAMS)[number]; items: ItemDTO[]; total: number; data: ConsoleData }) {
  const ctl = useCtl();
  const store = useStore();
  const signalOnly = useConsole((s) => s.signalOnly);
  const Icon = STREAM_ICONS[stream.id];
  // With the signal filter on, every visible item is signal; the count alone says it.
  const signal = signalOnly && data.totals.scored > 0 ? 0 : items.filter((i) => isSignal(i, data)).length;
  // LinkedIn has its own view; any other column opens in the Stream view, narrowed to it.
  const linkedIn = stream.id === "linkedin";
  const openStream = () => {
    if (!linkedIn) store.set({ streamFilter: [stream.id] });
    ctl.setView(linkedIn ? "linkedin" : "stream");
  };
  return (
    <section className="surface flex min-h-0 w-full shrink-0 flex-col rounded-xl lg:min-w-[272px] lg:flex-1 lg:snap-start">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2" title={stream.hint}>
          <Icon size={14} className={`shrink-0 ${stream.id === "linkedin" ? "text-people" : "text-fg-2"}`} />
          <h3 className="truncate text-[13px] font-semibold">{stream.label}</h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {signal ? <span className="font-mono text-[10.5px] font-medium whitespace-nowrap text-good tabular-nums" title="Relevant items">{signal} signal</span> : null}
          <button
            type="button"
            onClick={openStream}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 hover:bg-panel-2 hover:text-fg"
            aria-label={linkedIn ? "Open the LinkedIn view" : `Open ${stream.label} in the stream`}
            title={linkedIn ? "Open the LinkedIn view" : "Open in the stream"}
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </header>
      {items.length ? (
        <>
          <ul className="scroll min-h-0 flex-1 overflow-y-auto p-1.5 max-lg:[&>li:nth-child(n+6)]:hidden">
            {items.slice(0, 80).map((item) => (
              <ItemCompact key={item.id} item={item} threshold={data.topic.config.relevanceThreshold} />
            ))}
          </ul>
          {items.length > 5 ? (
            <button type="button" onClick={openStream} className="border-t border-line px-3.5 py-2 text-left text-[12px] text-fg-2 hover:text-fg lg:hidden">
              See all {items.length}
            </button>
          ) : null}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-[12px] text-fg-3">
          {total ? "Nothing matches the filters." : "Nothing collected here yet."}
        </div>
      )}
    </section>
  );
}

function StreamColumns({ data }: { data: ConsoleData }) {
  const visible = useFilteredItems(data);
  const grouped = useMemo(() => {
    const out = Object.fromEntries(STREAMS.map((s) => [s.id, [] as ItemDTO[]])) as Record<StreamId, ItemDTO[]>;
    for (const item of [...visible].sort(byNewest)) out[item.stream].push(item);
    return out;
  }, [visible]);
  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of data.items) out[item.stream] = (out[item.stream] ?? 0) + 1;
    return out;
  }, [data.items]);
  return (
    <div className="scroll flex min-h-0 flex-1 flex-col gap-3 lg:snap-x lg:flex-row lg:overflow-x-auto lg:pb-1">
      {STREAMS.map((stream) => (
        <StreamColumn key={stream.id} stream={stream} items={grouped[stream.id]} total={totals[stream.id] ?? 0} data={data} />
      ))}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[84px] !rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[92px] !rounded-xl" />
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-full min-h-[320px] w-[312px] shrink-0 !rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function PanelView() {
  const data = useTopicData();
  if (!data) return <PanelSkeleton />;
  if (!data.items.length) {
    return (
      <div className="p-4">
        <Telemetry data={data} />
        <div className="mt-4">
          <FirstRun />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 lg:h-full lg:min-h-0">
      <Telemetry data={data} />
      <BriefStrip data={data} />
      <StreamColumns data={data} />
    </div>
  );
}

function FirstRun() {
  const ctl = useCtl();
  const running = useConsole((s) => Boolean(s.status?.running.some((r) => r.topicId === s.topicId) || s.starting[s.topicId]));
  return (
    <Empty
      icon={Sparkles}
      title={running ? "The first run is under way" : "Nothing collected yet"}
      action={
        running ? null : (
          <Button variant="primary" icon={Play} onClick={() => ctl.run("full")}>
            Run everything now
          </Button>
        )
      }
    >
      {running
        ? "Radar is searching every source now. Items appear here as each step finishes, usually within two to four minutes."
        : "A run searches news, feeds, Reddit, Hacker News and more, scores every item with Claude, and writes the brief."}
    </Empty>
  );
}
