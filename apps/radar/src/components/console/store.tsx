"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { ConsoleData, LiveStatus, StreamId, TopicSummary } from "@/lib/console/types";
import type { ViewId } from "@/lib/console/views";
import type { Controller } from "./controller";

export { VIEWS, isView, type ViewId } from "@/lib/console/views";

export type Range = "24h" | "7d" | "30d" | "all";
export type Selection = { kind: "item" | "story" | "person" | "org" | "source" | "profile"; id: number };
export type Toast = { id: number; text: string; tone: "info" | "good" | "bad" };

export type ConsoleState = {
  topics: TopicSummary[];
  topicId: number;
  view: ViewId;
  payloads: Record<number, ConsoleData>;
  loading: Record<number, boolean>;
  errors: Record<number, string | undefined>;
  status: LiveStatus | null;
  /** Topics where a run was just requested and hasn't shown up in the status yet. */
  starting: Record<number, number | undefined>;
  now: number;
  timeZone: string;
  query: string;
  range: Range;
  signalOnly: boolean;
  streamFilter: StreamId[];
  sort: "new" | "score";
  originsOnly: boolean;
  briefDate: string | null;
  peopleTab: "people" | "orgs";
  showPassing: boolean;
  drawer: Selection[];
  palette: boolean;
  newTopic: boolean;
  railOpen: boolean;
  shortcuts: boolean;
  toasts: Toast[];
  theme: "dark" | "light";
  canSignOut: boolean;
};

type Listener = () => void;

export type ConsoleStore = {
  get: () => ConsoleState;
  set: (patch: Partial<ConsoleState> | ((s: ConsoleState) => Partial<ConsoleState>)) => void;
  subscribe: (listener: Listener) => () => void;
};

export function createStore(initial: ConsoleState): ConsoleStore {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      if (!next || !Object.keys(next).length) return;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ConsoleContextValue = { store: ConsoleStore; ctl: Controller };
const ConsoleContext = createContext<ConsoleContextValue | null>(null);

/** `value` must be stable (created once), so consumers never re-render because of it. */
export function ConsoleProvider({ value, children }: { value: ConsoleContextValue; children: ReactNode }) {
  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

function useConsoleContext() {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("Console hooks must be used inside the console");
  return value;
}

export const useStore = (): ConsoleStore => useConsoleContext().store;
export const useCtl = (): Controller => useConsoleContext().ctl;

/** Subscribes to one slice of console state. Selectors must return stored values, not new objects. */
export function useConsole<T>(selector: (s: ConsoleState) => T): T {
  const store = useStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}

export function useTopicData(): ConsoleData | undefined {
  return useConsole((s) => s.payloads[s.topicId]);
}
