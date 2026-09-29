"use client";

import { useDeferredValue, useMemo } from "react";
import type { ConsoleData, ItemDTO, PersonDTO, StoryDTO } from "@/lib/console/types";
import { inRange, itemTime, matches } from "./format";
import { useConsole } from "./store";

const itemIndex = new WeakMap<ConsoleData, Map<number, ItemDTO>>();
const personIndex = new WeakMap<ConsoleData, Map<string, PersonDTO>>();

/** Items by id, built once per payload. */
export function itemsById(data: ConsoleData): Map<number, ItemDTO> {
  let index = itemIndex.get(data);
  if (!index) {
    index = new Map(data.items.map((i) => [i.id, i]));
    itemIndex.set(data, index);
  }
  return index;
}

/** People by lowercased name, for linking the names Claude puts on stories. */
export function peopleByName(data: ConsoleData): Map<string, PersonDTO> {
  let index = personIndex.get(data);
  if (!index) {
    index = new Map(data.people.map((p) => [p.name.toLowerCase(), p]));
    personIndex.set(data, index);
  }
  return index;
}

export function isSignal(item: ItemDTO, data: ConsoleData): boolean {
  return (item.relevance ?? -1) >= data.topic.config.relevanceThreshold;
}

/** The filters in the top bar: time range, signal only, and search. */
export function useFilteredItems(data: ConsoleData | undefined): ItemDTO[] {
  const range = useConsole((s) => s.range);
  const signalOnly = useConsole((s) => s.signalOnly);
  const query = useDeferredValue(useConsole((s) => s.query).trim());
  // Recompute the time window once a minute, not on every clock tick.
  const minute = useConsole((s) => Math.floor(s.now / 60_000));
  return useMemo(() => {
    if (!data) return [];
    const now = minute * 60_000;
    // Until Claude has scored something, "signal only" would hide everything; show it all.
    const signal = signalOnly && data.totals.scored > 0;
    return data.items.filter(
      (item) =>
        inRange(item, range, now) &&
        (!signal || isSignal(item, data)) &&
        matches(query, item.title, item.outlet, item.gist, item.author, item.sourceKey, ...item.people.map((p) => p.name)),
    );
  }, [data, range, signalOnly, query, minute]);
}

export const byNewest = (a: ItemDTO, b: ItemDTO) => itemTime(b).localeCompare(itemTime(a)) || b.id - a.id;
export const byScore = (a: ItemDTO, b: ItemDTO) => (b.relevance ?? -1) - (a.relevance ?? -1) || byNewest(a, b);

export function storiesFor(data: ConsoleData, date: string | null | undefined): StoryDTO[] {
  if (!date) return [];
  return data.stories.filter((s) => s.briefDate === date).sort((a, b) => a.rank - b.rank);
}

/** Every item in a story, origin first. */
export function storyItems(data: ConsoleData, story: StoryDTO): ItemDTO[] {
  const index = itemsById(data);
  return story.itemIds.map((id) => index.get(id)).filter((i): i is ItemDTO => Boolean(i));
}
