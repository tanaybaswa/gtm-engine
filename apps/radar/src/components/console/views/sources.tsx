"use client";

import { Check, Plus, Radio, Rss } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { STREAMS, type SourceDTO } from "@/lib/console/types";
import { KIND_LABELS, matches } from "../format";
import { STREAM_ICONS } from "../icons";
import { useConsole, useCtl, useTopicData } from "../store";
import { Empty, Segmented, Skeleton, TimeAgo } from "../ui";

export function FollowButton({ source }: { source: SourceDTO }) {
  const ctl = useCtl();
  const [busy, setBusy] = useState(false);
  if (!source.followable) return <span className="text-[11.5px] text-fg-3">n/a</span>;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        await ctl.follow(source.id, !source.followed);
        setBusy(false);
      }}
      className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors disabled:opacity-60 ${
        source.followed ? "bg-accent-soft text-accent hover:brightness-125" : "border border-line text-fg-2 hover:border-line-2 hover:text-fg"
      }`}
      title={source.followed ? "The topic collects from this source directly. Click to stop." : "Collect from this source directly on every run"}
    >
      {source.followed ? <Check size={12} /> : <Plus size={12} />}
      {busy ? "..." : source.followed ? "Following" : "Follow"}
    </button>
  );
}

type Filter = "all" | "followed" | "origins";

export function SourcesView() {
  const data = useTopicData();
  const ctl = useCtl();
  const query = useDeferredValue(useConsole((s) => s.query).trim());
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.sources.filter(
      (s) =>
        (filter === "all" || (filter === "followed" ? s.followed : s.origins > 0)) &&
        matches(query, s.name, s.key, KIND_LABELS[s.kind] ?? s.kind),
    );
  }, [data, filter, query]);

  if (!data) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  }
  const maxItems = Math.max(1, ...data.sources.map((s) => s.items));

  return (
    <div className="mx-auto max-w-[1280px] space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-fg-2">
          Ranked by how often a source is where a story started, rather than an echo. Follow one and every run collects from it directly.
        </p>
        <Segmented
          label="Filter sources"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${data.sources.length}` },
            { value: "origins", label: "Origins" },
            { value: "followed", label: "Followed" },
          ]}
        />
      </div>
      {rows.length ? (
        <div className="surface overflow-hidden rounded-xl">
          <table className="w-full border-collapse text-[13px]">
            <thead className="border-b border-line text-left">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
                <th className="label">Source</th>
                <th className="label hidden md:table-cell">Type</th>
                <th className="label hidden text-right sm:table-cell">Items</th>
                <th className="label text-right">Relevant</th>
                <th className="label text-right">Origins</th>
                <th className="label hidden lg:table-cell">Latest</th>
                <th className="label text-right">Follow</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const Icon = STREAM_ICONS[s.stream];
                const rate = s.relevant ? Math.round((s.origins / s.relevant) * 100) : 0;
                return (
                  <tr
                    key={s.id}
                    onClick={() => ctl.open({ kind: "source", id: s.id })}
                    className="row-cv cursor-pointer border-b border-line last:border-0 hover:bg-panel-2 [&>td]:px-3 [&>td]:py-2.5"
                  >
                    <td className="max-w-[320px]">
                      <div className="flex items-center gap-2">
                        <Icon size={13} className="shrink-0 text-fg-3" aria-label={STREAMS.find((x) => x.id === s.stream)?.label} />
                        <span className="truncate font-medium text-fg">{s.name}</span>
                        {s.feedUrl ? <Rss size={11} className="shrink-0 text-fg-3" aria-label="Has a feed" /> : null}
                      </div>
                      {s.name !== s.key ? <div className="truncate pl-[21px] text-[11.5px] text-fg-3">{s.key}</div> : null}
                    </td>
                    <td className="hidden text-fg-2 md:table-cell">{KIND_LABELS[s.kind] ?? s.kind}</td>
                    <td className="hidden text-right sm:table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-line xl:block">
                          <span className="block h-full rounded-full bg-fg-3" style={{ width: `${(s.items / maxItems) * 100}%` }} />
                        </span>
                        <span className="w-8 font-mono tabular-nums">{s.items}</span>
                      </div>
                    </td>
                    <td className="text-right font-mono tabular-nums">{s.relevant}</td>
                    <td className="text-right">
                      <span className="font-mono text-fg tabular-nums">{s.origins}</span>
                      {s.origins ? <span className="ml-1 font-mono text-[11px] text-fg-3">{rate}%</span> : null}
                    </td>
                    <td className="hidden text-fg-3 lg:table-cell">
                      <TimeAgo iso={s.latestAt} />
                    </td>
                    <td className="text-right">
                      <FollowButton source={s} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={Radio} title={filter === "followed" ? "Not following any sources yet" : "No sources match"}>
          {filter === "followed" ? "Follow the outlets, accounts and communities where stories start." : "Try another filter or clear the search."}
        </Empty>
      )}
    </div>
  );
}
