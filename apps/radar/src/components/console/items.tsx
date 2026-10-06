"use client";

import { ArrowUpRight, CircleDot, Users } from "lucide-react";
import { memo } from "react";
import { SOURCE_LABELS, STREAMS, type ItemDTO } from "@/lib/console/types";
import { CATEGORY_LABELS, itemTime } from "./format";
import { STREAM_ICONS } from "./icons";
import { useConsole, useCtl } from "./store";
import { Badge, RelevanceMeter, TimeAgo } from "./ui";

export const streamLabel = (id: ItemDTO["stream"]) => STREAMS.find((s) => s.id === id)?.label ?? id;

function useSelected(id: number): boolean {
  return useConsole((s) => {
    const top = s.drawer[s.drawer.length - 1];
    return top?.kind === "item" && top.id === id;
  });
}

/** Compact card for the panel's stream columns. */
export const ItemCompact = memo(function ItemCompact({ item, threshold }: { item: ItemDTO; threshold: number }) {
  const ctl = useCtl();
  const selected = useSelected(item.id);
  return (
    <li className="row-cv">
      <button
        type="button"
        onClick={() => ctl.open({ kind: "item", id: item.id })}
        className={`group relative block w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-panel-2 ${selected ? "bg-panel-2" : ""}`}
      >
        {selected ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" /> : null}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <RelevanceMeter value={item.relevance} threshold={threshold} />
            {item.isOrigin ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-good" title="Origin: where the story started">
                <CircleDot size={11} /> Origin
              </span>
            ) : null}
          </div>
          <TimeAgo iso={itemTime(item)} className="font-mono text-[10.5px] text-fg-3" />
        </div>
        <div className="mt-1 line-clamp-2 text-[13px] leading-snug font-medium text-fg decoration-fg-3/40 underline-offset-[3px] group-hover:underline">{item.title}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-fg-3">
          <span className="truncate">{item.outlet ?? item.sourceKey}</span>
          {item.people.length ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-people" title={item.people.map((p) => p.name).join(", ")}>
              <Users size={11} /> {item.people.length}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
});

/** Full row for the Stream view. */
export const ItemRow = memo(function ItemRow({
  item,
  threshold,
  active,
  index,
  onFocus,
}: {
  item: ItemDTO;
  threshold: number;
  active: boolean;
  index: number;
  onFocus: (index: number) => void;
}) {
  const ctl = useCtl();
  const selected = useSelected(item.id);
  const Icon = STREAM_ICONS[item.stream];
  const blurb = item.gist ?? item.snippet;
  return (
    <li className="row-cv" data-item-id={item.id}>
      <div
        role="button"
        tabIndex={-1}
        onClick={() => {
          onFocus(index);
          ctl.open({ kind: "item", id: item.id });
        }}
        className={`group relative flex cursor-pointer gap-3 border-b border-line px-4 py-3 transition-colors hover:bg-panel-2 ${
          active || selected ? "bg-panel-2" : ""
        }`}
      >
        {active || selected ? <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
        <div className="w-14 shrink-0 pt-0.5">
          <RelevanceMeter value={item.relevance} threshold={threshold} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-3">
            <span className="inline-flex items-center gap-1 text-fg-2" title={streamLabel(item.stream)}>
              <Icon size={12} /> {item.outlet ?? item.sourceKey}
            </span>
            <span aria-hidden>·</span>
            <TimeAgo iso={itemTime(item)} />
            {item.author ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{item.author}</span>
              </>
            ) : null}
            <span className="rounded border border-line px-1 font-mono text-[10px] leading-4 text-fg-3">{SOURCE_LABELS[item.source] ?? item.source}</span>
          </div>
          <div className="mt-1 text-[14px] leading-snug font-medium text-fg decoration-fg-3/40 underline-offset-[3px] group-hover:underline">{item.title}</div>
          {blurb ? <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-fg-2">{blurb}</p> : null}
          {item.people.length ? (
            <div className="mt-1.5 truncate text-[12px] text-people">
              <Users size={11} className="mr-1 inline" />
              {item.people.map((p) => p.name).join(", ")}
            </div>
          ) : null}
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
          {item.isOrigin ? (
            <Badge tone="good" title="Origin: where the story started">
              <CircleDot size={10} /> Origin
            </Badge>
          ) : null}
          {item.category && item.category !== "other" ? <Badge>{CATEGORY_LABELS[item.category] ?? item.category}</Badge> : null}
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-panel-3 hover:text-fg"
            aria-label="Open the original"
            title="Open the original"
          >
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </li>
  );
});

/** One line per item, for lists inside the drawer. */
export function ItemMini({ item, threshold, note }: { item: ItemDTO; threshold: number; note?: string }) {
  const ctl = useCtl();
  return (
    <li>
      <button
        type="button"
        onClick={() => ctl.open({ kind: "item", id: item.id })}
        className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-panel-2"
      >
        <span className="w-12 shrink-0 pt-0.5">
          <RelevanceMeter value={item.relevance} threshold={threshold} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-snug text-fg decoration-fg-3/40 underline-offset-[3px] group-hover:underline">{item.title}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-fg-3">
            {[item.outlet ?? item.sourceKey, note].filter(Boolean).join(" · ")} · <TimeAgo iso={itemTime(item)} />
          </span>
        </span>
      </button>
    </li>
  );
}
