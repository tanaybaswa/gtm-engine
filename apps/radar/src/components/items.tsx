import type { ReactNode } from "react";
import type { Item } from "@/db/schema";
import { Badge, ExternalLink, formatDate, RelevanceBadge, SourceBadge } from "./ui";

/** The link to open for an item: the publisher's URL when we have it. */
export function itemHref(item: Item): string {
  return item.resolvedUrl ?? item.url;
}

export function ItemRow({ item, showGist = true, label }: { item: Item; showGist?: boolean; label?: ReactNode }) {
  const blurb = item.summary ?? item.gist ?? item.snippet;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
        {label}
        <SourceBadge source={item.source} />
        <RelevanceBadge value={item.relevance} />
        {item.isOrigin ? (
          <Badge tone="green" title="This item is the original source">
            Origin
          </Badge>
        ) : null}
        <span>{item.outlet ?? item.sourceKey}</span>
        <span aria-hidden>·</span>
        <span>{formatDate(item.publishedAt ?? item.collectedAt)}</span>
        {item.author ? (
          <>
            <span aria-hidden>·</span>
            <span>{item.author}</span>
          </>
        ) : null}
      </div>
      <ExternalLink href={itemHref(item)} className="mt-1 block font-medium break-anywhere text-zinc-900 dark:text-zinc-100">
        {item.title}
      </ExternalLink>
      {showGist && blurb ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{blurb}</p> : null}
      {item.originHint && !item.isOrigin ? (
        <p className="mt-1 text-xs text-zinc-500">Based on: {item.originHint}</p>
      ) : null}
    </li>
  );
}

export function ItemList({ items, showGist }: { items: Item[]; showGist?: boolean }) {
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} showGist={showGist} />
      ))}
    </ul>
  );
}
