"use client";

import { CircleAlert, CircleCheck, Info, RotateCcw, X } from "lucide-react";
import { Activity, useEffect, useState, type ComponentType } from "react";
import type { ConsoleData, TopicSummaries } from "@/lib/console/types";
import { VIEWS, type ViewId } from "@/lib/console/views";
import { createController } from "./controller";
import { Drawer } from "./drawer";
import { NewTopicDialog } from "./new-topic";
import { Palette } from "./palette";
import { Rail } from "./rail";
import { ConsoleProvider, createStore, useConsole, useCtl, useStore, type ConsoleContextValue } from "./store";
import { TopBar } from "./topbar";
import { Button, COLOR_KEY, Kbd } from "./ui";
import { BriefView } from "./views/brief";
import { HealthView } from "./views/health";
import { LinkedInView } from "./views/linkedin";
import { YouTubeView } from "./views/youtube";
import { PanelView } from "./views/panel";
import { PeopleView } from "./views/people";
import { SettingsView } from "./views/settings";
import { SourcesView } from "./views/sources";
import { StreamView } from "./views/stream";

export type ConsoleInit = {
  summaries: TopicSummaries;
  topicId: number;
  data: ConsoleData | null;
  view: ViewId;
  timeZone: string;
  serverNow: number;
  theme: "dark" | "light";
  canSignOut: boolean;
};

const VIEW_COMPONENTS: Record<ViewId, ComponentType> = {
  panel: PanelView,
  brief: BriefView,
  stream: StreamView,
  linkedin: LinkedInView,
  youtube: YouTubeView,
  people: PeopleView,
  sources: SourcesView,
  health: HealthView,
  settings: SettingsView,
};

function TopicError() {
  const ctl = useCtl();
  const topicId = useConsole((s) => s.topicId);
  const error = useConsole((s) => (s.payloads[s.topicId] ? undefined : s.errors[s.topicId]));
  if (!error) return null;
  return (
    <div className="absolute inset-x-0 top-0 z-10 m-4 flex items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-[13px]">
      <span className="flex items-center gap-2 text-fg">
        <CircleAlert size={15} className="text-bad" /> Couldn&apos;t load this topic: {error}
      </span>
      <Button size="sm" icon={RotateCcw} onClick={() => ctl.loadTopic(topicId, true)}>
        Retry
      </Button>
    </div>
  );
}

/**
 * Every view stays mounted; hidden ones keep their state and scroll position and render at
 * low priority, so switching views never waits on anything.
 */
function Views() {
  const view = useConsole((s) => s.view);
  return (
    <main className="relative min-h-0 flex-1">
      <TopicError />
      {VIEWS.map((v) => {
        const View = VIEW_COMPONENTS[v.id];
        return (
          <Activity key={v.id} mode={v.id === view ? "visible" : "hidden"}>
            <div className="scroll h-full overflow-y-auto">
              <View />
            </div>
          </Activity>
        );
      })}
    </main>
  );
}

function Toasts() {
  const toasts = useConsole((s) => s.toasts);
  const store = useStore();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-[70] flex w-[min(380px,calc(100vw-24px))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.tone === "bad" ? CircleAlert : t.tone === "good" ? CircleCheck : Info;
        return (
          <div key={t.id} className="animate-rise pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line-2 bg-panel px-3.5 py-3 text-[13px] shadow-[var(--shadow)]">
            <Icon size={15} className={`mt-px shrink-0 ${t.tone === "bad" ? "text-bad" : t.tone === "good" ? "text-good" : "text-fg-2"}`} />
            <span className="flex-1 leading-snug text-fg">{t.text}</span>
            <button
              type="button"
              onClick={() => store.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))}
              className="text-fg-3 hover:text-fg"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["⌘", "K"], "Search and commands"],
  [["/"], "Filter the current view"],
  [["1", "…", "9"], "Switch views"],
  [["[", "]"], "Previous or next topic"],
  [["j", "k"], "Move through the stream"],
  [["Enter"], "Open details"],
  [["o"], "Open the original"],
  [["Esc"], "Close"],
  [["?"], "This list"],
];

function Shortcuts() {
  const open = useConsole((s) => s.shortcuts);
  const store = useStore();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-3" onMouseDown={() => store.set({ shortcuts: false })}>
      <div className="animate-rise w-full max-w-[380px] rounded-2xl border border-line-2 bg-panel p-5 shadow-[var(--shadow)]" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <h2 className="mb-3 text-[15px] font-semibold">Keyboard shortcuts</h2>
        <ul className="space-y-2">
          {SHORTCUTS.map(([keys, label]) => (
            <li key={label} className="flex items-center justify-between gap-3 text-[13px] text-fg-2">
              {label}
              <span className="flex gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <h2 className="mt-5 mb-3 text-[15px] font-semibold">Colors</h2>
        <ul className="space-y-2">
          {COLOR_KEY.map((k) => (
            <li key={k.label} className="flex items-start gap-2.5 text-[13px] text-fg-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${k.dot}`} />
              <span>
                <span className={`font-medium ${k.text}`}>{k.label}</span> · {k.meaning}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function useKeyboard() {
  const store = useStore();
  const ctl = useCtl();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store.get();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        store.set({ palette: !s.palette });
        return;
      }
      if (s.palette || s.newTopic) return;
      const typing = e.target instanceof Element && Boolean(e.target.closest("input, textarea, select, [contenteditable=true]"));
      if (e.key === "Escape") {
        if (s.shortcuts) store.set({ shortcuts: false });
        else if (s.drawer.length) ctl.closeDrawer();
        else if (s.railOpen) store.set({ railOpen: false });
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        const input = document.getElementById("console-search");
        if (input && input.offsetParent !== null) input.focus();
        else store.set({ palette: true });
      } else if (e.key === "?") {
        store.set({ shortcuts: !s.shortcuts });
      } else if (/^[1-9]$/.test(e.key) && VIEWS[Number(e.key) - 1]) {
        ctl.setView(VIEWS[Number(e.key) - 1].id);
      } else if (e.key === "[" || e.key === "]") {
        const list = s.topics.filter((t) => t.active || t.id === s.topicId);
        const index = list.findIndex((t) => t.id === s.topicId);
        const next = list[(index + (e.key === "]" ? 1 : -1) + list.length) % list.length];
        if (next) ctl.selectTopic(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, ctl]);
}

function Shell() {
  useKeyboard();
  return (
    <div className="backdrop flex h-dvh overflow-hidden text-fg">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <Views />
      </div>
      <Drawer />
      <Palette />
      <NewTopicDialog />
      <Shortcuts />
      <Toasts />
    </div>
  );
}

export function Console({ initial }: { initial: ConsoleInit }) {
  const [ctx] = useState<ConsoleContextValue>(() => {
    const store = createStore({
      topics: initial.summaries.topics,
      topicId: initial.topicId,
      view: initial.view,
      payloads: initial.data ? { [initial.topicId]: initial.data } : {},
      loading: {},
      errors: {},
      status: null,
      starting: {},
      now: initial.serverNow,
      timeZone: initial.timeZone,
      query: "",
      range: "7d",
      // Show only scored, relevant items once there are any; before that, show everything.
      signalOnly: Boolean(initial.data && initial.data.totals.relevant > 0),
      streamFilter: [],
      sort: "new",
      originsOnly: false,
      briefDate: null,
      peopleTab: "people",
      showPassing: false,
      drawer: [],
      palette: false,
      newTopic: false,
      railOpen: false,
      shortcuts: false,
      toasts: [],
      theme: initial.theme,
      canSignOut: initial.canSignOut,
    });
    return { store, ctl: createController(store, initial.summaries.generatedAt) };
  });

  useEffect(() => {
    const { store, ctl } = ctx;
    const tick = () => store.set({ now: Date.now() });
    tick();
    const clock = setInterval(tick, 30_000);
    if (!store.get().payloads[store.get().topicId] && store.get().topicId) void ctl.loadTopic(store.get().topicId);
    ctl.startPolling();
    // Once the first screen is up, warm the other topics so switching is instant.
    const warm = setTimeout(() => void ctl.prefetchTopics(), 1500);
    return () => {
      clearInterval(clock);
      clearTimeout(warm);
      ctl.stopPolling();
    };
  }, [ctx]);

  return (
    <ConsoleProvider value={ctx}>
      <Shell />
    </ConsoleProvider>
  );
}
