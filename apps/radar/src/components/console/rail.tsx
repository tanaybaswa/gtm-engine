"use client";

import { ChevronRight, Command, LogOut, Moon, Plus, Sun, X } from "lucide-react";
import { useState } from "react";
import { logout } from "@/app/actions";
import type { TopicSummary } from "@/lib/console/types";
import { RadarMark } from "./icons";
import { useConsole, useCtl, useStore } from "./store";
import { Kbd } from "./ui";

function MiniSpark({ values }: { values: number[] }) {
  const width = 52;
  const height = 16;
  const max = Math.max(1, ...values);
  const step = (width - 4) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => [2 + i * step, height - 2 - (v / max) * (height - 4)] as const);
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible" aria-hidden>
      <path d={points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--text-3)" strokeWidth={1.5} strokeLinejoin="round" />
      {last ? <circle cx={last[0]} cy={last[1]} r={2.5} fill="var(--accent)" /> : null}
    </svg>
  );
}

function TopicRow({ topic, active, running }: { topic: TopicSummary; active: boolean; running: boolean }) {
  const ctl = useCtl();
  return (
    <li>
      <button
        type="button"
        onClick={() => ctl.selectTopic(topic.id)}
        aria-current={active ? "page" : undefined}
        className={`group relative flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors ${
          active ? "bg-panel-3" : "hover:bg-panel-2"
        }`}
      >
        {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" /> : null}
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-[13px] font-medium ${active ? "text-fg" : "text-fg-2 group-hover:text-fg"}`}>{topic.name}</span>
          {running ? (
            <span className="relative flex h-2 w-2 shrink-0" title="Running">
              <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-accent" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
          ) : null}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[10.5px] text-fg-3">
            {topic.new24h} new · {topic.relevant24h} signal
          </span>
          <MiniSpark values={topic.spark} />
        </span>
      </button>
    </li>
  );
}

function RailBody() {
  const store = useStore();
  const ctl = useCtl();
  const topics = useConsole((s) => s.topics);
  const topicId = useConsole((s) => s.topicId);
  const status = useConsole((s) => s.status);
  const starting = useConsole((s) => s.starting);
  const theme = useConsole((s) => s.theme);
  const canSignOut = useConsole((s) => s.canSignOut);
  const [showArchived, setShowArchived] = useState(false);
  const live = topics.filter((t) => t.active);
  const archived = topics.filter((t) => !t.active);
  const running = (id: number) => Boolean(status?.running.some((r) => r.topicId === id) || starting[id]);
  const anyRunning = topics.some((t) => running(t.id));

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between gap-2 border-b border-line px-4">
        <div className="flex items-center gap-2.5">
          <RadarMark live={anyRunning} />
          <span className="text-[15px] font-semibold tracking-tight">Radar</span>
        </div>
        <button
          type="button"
          onClick={() => store.set({ railOpen: false })}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 hover:bg-panel-2 lg:hidden"
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
      </div>

      <div className="scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-1.5 flex items-center justify-between px-2">
          <span className="label">Topics</span>
          <button
            type="button"
            onClick={() => store.set({ newTopic: true, railOpen: false })}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] text-fg-2 hover:bg-panel-2 hover:text-accent"
          >
            <Plus size={13} /> New
          </button>
        </div>
        <ul className="space-y-0.5">
          {live.map((t) => (
            <TopicRow key={t.id} topic={t} active={t.id === topicId} running={running(t.id)} />
          ))}
        </ul>
        {!live.length ? <p className="px-3 py-2 text-[12.5px] text-fg-3">No active topics.</p> : null}
        <button
          type="button"
          onClick={() => store.set({ newTopic: true, railOpen: false })}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-line-2 px-3 py-2 text-left text-[12.5px] text-fg-3 hover:border-accent/50 hover:text-accent"
        >
          <Plus size={14} /> Track a new topic
        </button>
        {archived.length ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="flex w-full items-center gap-1 px-2 py-1 text-left"
              aria-expanded={showArchived}
            >
              <ChevronRight size={12} className={`text-fg-3 transition-transform ${showArchived ? "rotate-90" : ""}`} />
              <span className="label">Archived {archived.length}</span>
            </button>
            {showArchived ? (
              <ul className="mt-1 space-y-0.5 opacity-80">
                {archived.map((t) => (
                  <TopicRow key={t.id} topic={t} active={t.id === topicId} running={running(t.id)} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-1 border-t border-line p-2">
        <button
          type="button"
          onClick={() => store.set({ palette: true, railOpen: false })}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[12.5px] text-fg-2 hover:bg-panel-2 hover:text-fg"
        >
          <span className="flex items-center gap-2">
            <Command size={14} /> Commands
          </span>
          <span className="flex gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => ctl.setTheme(theme === "dark" ? "light" : "dark")}
            className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-fg-2 hover:bg-panel-2 hover:text-fg"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
          {canSignOut ? (
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-3 hover:bg-panel-2 hover:text-fg"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Rail() {
  const store = useStore();
  const open = useConsole((s) => s.railOpen);
  return (
    <>
      <aside className="hidden w-[248px] shrink-0 border-r border-line bg-panel/70 lg:block">
        <RailBody />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => store.set({ railOpen: false })} aria-hidden />
          <aside className="animate-slide-in-left absolute inset-y-0 left-0 w-[284px] max-w-[85vw] border-r border-line-2 bg-panel shadow-[var(--shadow)]">
            <RailBody />
          </aside>
        </div>
      ) : null}
    </>
  );
}
