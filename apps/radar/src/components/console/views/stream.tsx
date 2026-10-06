"use client";

import { Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { STREAMS, type StreamId } from "@/lib/console/types";
import { byNewest, byScore, useFilteredItems } from "../derive";
import { STREAM_ICONS } from "../icons";
import { ItemRow } from "../items";
import { useConsole, useCtl, useStore, useTopicData } from "../store";
import { Empty, Kbd, Segmented, Skeleton, Toggle } from "../ui";

export function StreamView() {
  const data = useTopicData();
  const store = useStore();
  const ctl = useCtl();
  const streamFilter = useConsole((s) => s.streamFilter);
  const sort = useConsole((s) => s.sort);
  const originsOnly = useConsole((s) => s.originsOnly);
  const drawerOpen = useConsole((s) => s.drawer.length > 0);
  const filtered = useFilteredItems(data);
  const [cursor, setCursor] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of filtered) out[item.stream] = (out[item.stream] ?? 0) + 1;
    return out;
  }, [filtered]);

  const rows = useMemo(() => {
    const list = filtered.filter((i) => (!streamFilter.length || streamFilter.includes(i.stream)) && (!originsOnly || i.isOrigin));
    return list.sort(sort === "score" ? byScore : byNewest);
  }, [filtered, streamFilter, originsOnly, sort]);

  // j and k move through the list, Enter opens, o opens the original.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable=true]");
      if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setCursor((c) => {
          const next = Math.max(0, Math.min(rows.length - 1, c + (e.key === "j" ? 1 : -1)));
          const id = rows[next]?.id;
          if (id !== undefined) {
            listRef.current?.querySelector(`[data-item-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
            if (drawerOpen) ctl.open({ kind: "item", id });
          }
          return next;
        });
      } else if (e.key === "Enter" && rows[cursor]) {
        ctl.open({ kind: "item", id: rows[cursor].id });
      } else if (e.key === "o" && rows[cursor]) {
        window.open(rows[cursor].href, "_blank", "noopener,noreferrer");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, ctl, drawerOpen]);

  if (!data) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  const toggleStream = (id: StreamId) =>
    store.set((s) => ({ streamFilter: s.streamFilter.includes(id) ? s.streamFilter.filter((x) => x !== id) : [...s.streamFilter, id] }));

  return (
    <div className="grid lg:h-full lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="scroll border-line max-lg:border-b lg:overflow-y-auto lg:border-r">
        <div className="flex gap-1.5 overflow-x-auto p-3 lg:flex-col lg:gap-0.5">
          <div className="label hidden px-2 pb-1.5 lg:block">Streams</div>
          <button
            type="button"
            onClick={() => store.set({ streamFilter: [] })}
            className={`flex h-8 shrink-0 items-center justify-between gap-3 rounded-lg px-2.5 text-[13px] ${
              !streamFilter.length ? "bg-panel-3 text-fg" : "text-fg-2 hover:bg-panel-2"
            }`}
          >
            <span className="flex items-center gap-2">
              <Waves size={14} /> All streams
            </span>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{filtered.length}</span>
          </button>
          {STREAMS.map((s) => {
            const Icon = STREAM_ICONS[s.id];
            const on = streamFilter.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStream(s.id)}
                aria-pressed={on}
                title={s.hint}
                className={`flex h-8 shrink-0 items-center justify-between gap-3 rounded-lg px-2.5 text-[13px] ${
                  on ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-panel-2 hover:text-fg"
                }`}
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Icon size={14} className={s.id === "linkedin" ? "text-people" : ""} /> {s.label}
                </span>
                <span className="font-mono text-[11px] text-fg-3 tabular-nums">{counts[s.id] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="hidden space-y-1 border-t border-line p-3 lg:block">
          <div className="label px-2 pb-1">Show</div>
          <Toggle good checked={originsOnly} onChange={(v) => store.set({ originsOnly: v })} label="Origins only" hint="Items judged to be the original source" />
          <div className="px-2 pt-4 text-[11.5px] leading-relaxed text-fg-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Kbd>j</Kbd>
              <Kbd>k</Kbd> move
            </div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Kbd>Enter</Kbd> details
            </div>
            <div className="flex items-center gap-1.5">
              <Kbd>o</Kbd> open original
            </div>
          </div>
        </div>
      </aside>

      <section className="scroll min-w-0 lg:overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-panel/85 px-4 py-2 backdrop-blur">
          <span className="text-[12.5px] text-fg-2">
            <span className="font-mono text-fg tabular-nums">{rows.length}</span> of {data.items.length} items
          </span>
          <div className="flex items-center gap-2">
            <div className="lg:hidden">
              <Toggle good checked={originsOnly} onChange={(v) => store.set({ originsOnly: v })} label="Origins" />
            </div>
            <Segmented
              label="Sort"
              value={sort}
              onChange={(v) => store.set({ sort: v })}
              options={[
                { value: "new", label: "Newest" },
                { value: "score", label: "Relevance" },
              ]}
            />
          </div>
        </div>
        {rows.length ? (
          <ul ref={listRef}>
            {rows.map((item, index) => (
              <ItemRow
                key={item.id}
                item={item}
                threshold={data.topic.config.relevanceThreshold}
                active={index === cursor}
                index={index}
                onFocus={setCursor}
              />
            ))}
          </ul>
        ) : (
          <div className="p-4">
            <Empty icon={Waves} title="Nothing matches">
              Widen the time range, turn off Signal, or clear the search.
            </Empty>
          </div>
        )}
      </section>
    </div>
  );
}
