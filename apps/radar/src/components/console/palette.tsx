"use client";

import { CornerDownLeft, FolderPlus, Keyboard, LogOut, Moon, Play, Search, Sun, Target, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { logout } from "@/app/actions";
import { VIEWS } from "@/lib/console/views";
import { itemTime } from "./format";
import { STREAM_ICONS, VIEW_ICONS } from "./icons";
import { useConsole, useCtl, useStore, useTopicData } from "./store";
import { Kbd, TimeAgo } from "./ui";

type Command = { id: string; group: string; label: string; hint?: ReactNode; icon: LucideIcon; run: () => void };

export function Palette() {
  const open = useConsole((s) => s.palette);
  if (!open) return null;
  return <PaletteDialog />;
}

function PaletteDialog() {
  const store = useStore();
  const ctl = useCtl();
  const data = useTopicData();
  const topics = useConsole((s) => s.topics);
  const topicId = useConsole((s) => s.topicId);
  const theme = useConsole((s) => s.theme);
  const canSignOut = useConsole((s) => s.canSignOut);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => store.set({ palette: false });

  useEffect(() => inputRef.current?.focus(), []);

  const commands = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const hit = (...fields: (string | null | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q));
    const out: Command[] = [];
    VIEWS.forEach((v, i) => {
      if (hit(v.label, v.hint, "view go")) out.push({ id: `view-${v.id}`, group: "Go to", label: v.label, hint: <Kbd>{i + 1}</Kbd>, icon: VIEW_ICONS[v.id], run: () => ctl.setView(v.id) });
    });
    for (const t of topics) {
      if (t.id !== topicId && hit(t.name, "topic switch")) out.push({ id: `topic-${t.id}`, group: "Topics", label: t.name, hint: t.active ? undefined : "archived", icon: Target, run: () => ctl.selectTopic(t.id) });
    }
    if (hit("run everything now collect score brief")) out.push({ id: "run", group: "Actions", label: "Run everything now", icon: Play, run: () => void ctl.run("full") });
    if (hit("new topic create add")) out.push({ id: "new", group: "Actions", label: "New topic", icon: FolderPlus, run: () => store.set({ newTopic: true }) });
    if (hit("theme dark light mode")) out.push({ id: "theme", group: "Actions", label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme", icon: theme === "dark" ? Sun : Moon, run: () => ctl.setTheme(theme === "dark" ? "light" : "dark") });
    if (hit("keyboard shortcuts help")) out.push({ id: "keys", group: "Actions", label: "Keyboard shortcuts", hint: <Kbd>?</Kbd>, icon: Keyboard, run: () => store.set({ shortcuts: true }) });
    if (canSignOut && hit("sign out log out")) out.push({ id: "logout", group: "Actions", label: "Sign out", icon: LogOut, run: () => void logout() });
    if (data && q.length >= 2) {
      data.items
        .filter((i) => hit(i.title, i.outlet))
        .slice(0, 6)
        .forEach((i) =>
          out.push({ id: `item-${i.id}`, group: "Items", label: i.title, hint: <span className="text-fg-3"><TimeAgo iso={itemTime(i)} /></span>, icon: STREAM_ICONS[i.stream], run: () => ctl.open({ kind: "item", id: i.id }) }),
        );
      data.people
        .filter((p) => hit(p.name, p.orgName, p.role))
        .slice(0, 5)
        .forEach((p) => out.push({ id: `person-${p.id}`, group: "People", label: p.name, hint: p.orgName ?? undefined, icon: VIEW_ICONS.people, run: () => ctl.open({ kind: "person", id: p.id }) }));
      data.sources
        .filter((s) => hit(s.name, s.key))
        .slice(0, 4)
        .forEach((s) => out.push({ id: `source-${s.id}`, group: "Sources", label: s.name, hint: s.key, icon: VIEW_ICONS.sources, run: () => ctl.open({ kind: "source", id: s.id }) }));
    }
    return out;
  }, [query, topics, topicId, theme, canSignOut, data, ctl, store]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (command: Command | undefined) => {
    if (!command) return;
    close();
    command.run();
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-3 pt-[12vh] backdrop-blur-[2px]" onMouseDown={close}>
      <div
        role="dialog"
        aria-label="Command palette"
        className="animate-rise w-full max-w-[600px] overflow-hidden rounded-2xl border border-line-2 bg-panel shadow-[var(--shadow)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="text-fg-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(commands.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(commands[cursor]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
            placeholder="Search items, people, sources, or type a command"
            className="h-12 flex-1 bg-transparent text-[14px] text-fg placeholder:text-fg-3 focus:outline-none focus-visible:outline-none"
            aria-label="Search or run a command"
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={listRef} className="scroll max-h-[min(60vh,440px)] overflow-y-auto p-1.5">
          {commands.length ? (
            commands.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              const Icon = command.icon;
              return (
                <div key={command.id}>
                  {header ? <div className="label px-2.5 pt-2.5 pb-1">{header}</div> : null}
                  <button
                    type="button"
                    data-index={index}
                    onMouseMove={() => setCursor(index)}
                    onClick={() => choose(command)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13.5px] ${index === cursor ? "bg-panel-3 text-fg" : "text-fg-2"}`}
                  >
                    <Icon size={15} className="shrink-0 text-fg-3" />
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint ? <span className="shrink-0 truncate text-[12px] text-fg-3">{command.hint}</span> : null}
                    {index === cursor ? <CornerDownLeft size={13} className="shrink-0 text-fg-3" /> : null}
                  </button>
                </div>
              );
            })
          ) : (
            <div className="px-3 py-8 text-center text-[13px] text-fg-3">Nothing found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
