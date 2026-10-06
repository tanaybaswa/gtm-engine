"use client";

import {
  createTopic,
  resetTopicSettings,
  runTopic,
  saveTopicSettings,
  setFollowed,
  setTopicActive,
  setWatched,
} from "@/app/actions";
import type { RunStage } from "@/db/schema";
import type { ConsoleData, LiveStatus, TopicDTO, TopicSummaries } from "@/lib/console/types";
import type { ConsoleStore, Selection, Toast, ViewId } from "./store";

const STAGE_LABELS: Record<RunStage, string> = {
  full: "Full run",
  collect: "Collection",
  enrich: "Scoring and reading",
  brief: "Brief writing",
};

/** Everything the console does: loading, polling, and the edits people make. */
export function createController(store: ConsoleStore, initialSummariesAt: string) {
  const inflight = new Map<string, Promise<ConsoleData | null>>();
  let summariesAt = initialSummariesAt;
  let toastSeq = 0;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let polling = false;

  async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
    if (res.status === 401) {
      // A full page load, so the sign-in check runs again.
      const login = new URL("/login", window.location.origin);
      login.searchParams.set("next", window.location.pathname + window.location.search);
      window.location.replace(login.toString());
      throw new Error("Signed out");
    }
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (await res.json()) as T;
  }

  function toast(text: string, tone: Toast["tone"] = "info") {
    const id = ++toastSeq;
    store.set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
    setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === "bad" ? 7000 : 4000);
  }

  function syncUrl() {
    const { topicId, view } = store.get();
    const url = `${window.location.pathname}?topic=${topicId}&view=${view}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", url);
  }

  /** Loads a topic's payload. Never replaces a copy with an older one. */
  function loadTopic(topicId: number, fresh = false): Promise<ConsoleData | null> {
    const key = `${topicId}:${fresh}`;
    const pending = inflight.get(key);
    if (pending) return pending;
    store.set((s) => ({ loading: { ...s.loading, [topicId]: true } }));
    const request = getJson<ConsoleData>(`/api/console?topic=${topicId}${fresh ? "&fresh=1" : ""}`)
      .then((data) => {
        store.set((s) => {
          const current = s.payloads[topicId];
          if (current && current.generatedAt > data.generatedAt) return { errors: { ...s.errors, [topicId]: undefined } };
          return { payloads: { ...s.payloads, [topicId]: data }, errors: { ...s.errors, [topicId]: undefined } };
        });
        return data;
      })
      .catch((error: Error) => {
        store.set((s) => ({ errors: { ...s.errors, [topicId]: error.message } }));
        return null;
      })
      .finally(() => {
        inflight.delete(key);
        store.set((s) => ({ loading: { ...s.loading, [topicId]: false } }));
      });
    inflight.set(key, request);
    return request;
  }

  async function loadSummaries(fresh = false): Promise<void> {
    try {
      const summaries = await getJson<TopicSummaries>(`/api/summaries${fresh ? "?fresh=1" : ""}`);
      if (summaries.generatedAt < summariesAt) return;
      summariesAt = summaries.generatedAt;
      store.set({ topics: summaries.topics });
    } catch {
      // The rail keeps its last copy.
    }
  }

  const isStale = (data: ConsoleData | undefined, changedAt: string | null | undefined) =>
    Boolean(data && changedAt && changedAt > data.generatedAt);

  async function pollStatus(): Promise<void> {
    const status = await getJson<LiveStatus>("/api/status");
    store.set((s) => {
      const starting = { ...s.starting };
      for (const [id, since] of Object.entries(starting)) {
        if (!since) continue;
        if (status.running.some((r) => r.topicId === Number(id)) || Date.now() - since > 25_000) delete starting[Number(id)];
      }
      return { status, starting };
    });
    const s = store.get();
    if (isStale(s.payloads[s.topicId], status.changedAt)) void loadTopic(s.topicId, true);
    if (status.changedAt && status.changedAt > summariesAt) void loadSummaries(true);
  }

  function schedulePoll(delay: number) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(tick, delay);
  }

  async function tick() {
    if (!polling) return;
    if (document.visibilityState === "visible") await pollStatus().catch(() => {});
    const s = store.get();
    const busy = (s.status?.running.length ?? 0) > 0 || Object.values(s.starting).some(Boolean);
    schedulePoll(busy ? 2500 : 30_000);
  }

  // Coming back to the tab checks for news at once.
  const onVisible = () => {
    if (document.visibilityState === "visible" && polling) schedulePoll(0);
  };

  function startPolling() {
    polling = true;
    document.addEventListener("visibilitychange", onVisible);
    schedulePoll(0);
  }

  function stopPolling() {
    polling = false;
    document.removeEventListener("visibilitychange", onVisible);
    clearTimeout(pollTimer);
  }

  /** Warms every other topic in the background so switching is instant. */
  async function prefetchTopics() {
    for (const topic of store.get().topics) {
      if (store.get().payloads[topic.id]) continue;
      await loadTopic(topic.id);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  function selectTopic(topicId: number) {
    const s = store.get();
    if (s.topicId === topicId) {
      store.set({ railOpen: false });
      return;
    }
    store.set({ topicId, briefDate: null, drawer: [], railOpen: false, streamFilter: [] });
    const data = store.get().payloads[topicId];
    if (!data) void loadTopic(topicId);
    else if (isStale(data, s.status?.changedAt)) void loadTopic(topicId, true);
    syncUrl();
  }

  function setView(view: ViewId) {
    store.set({ view, railOpen: false });
    syncUrl();
  }

  function patchPayloads(fn: (data: ConsoleData) => ConsoleData) {
    store.set((s) => ({ payloads: Object.fromEntries(Object.entries(s.payloads).map(([id, data]) => [id, fn(data)])) }));
  }

  function applyTopic(topic: TopicDTO) {
    store.set((s) => {
      const data = s.payloads[topic.id];
      return {
        payloads: data ? { ...s.payloads, [topic.id]: { ...data, topic } } : s.payloads,
        topics: s.topics.map((t) => (t.id === topic.id ? { ...t, name: topic.name, active: topic.active } : t)),
      };
    });
  }

  async function run(stage: RunStage) {
    const topicId = store.get().topicId;
    store.set((s) => ({ starting: { ...s.starting, [topicId]: Date.now() } }));
    const result = await runTopic(topicId, stage).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!result.ok) {
      store.set((s) => ({ starting: { ...s.starting, [topicId]: undefined } }));
      toast(result.error, "bad");
      return;
    }
    toast(`${STAGE_LABELS[stage]} started. Results appear as each step finishes.`, "good");
    schedulePoll(800);
  }

  async function watch(kind: "person" | "org", id: number, watched: boolean) {
    const apply = (value: boolean) =>
      patchPayloads((data) =>
        kind === "person"
          ? { ...data, people: data.people.map((p) => (p.id === id ? { ...p, watched: value } : p)) }
          : { ...data, orgs: data.orgs.map((o) => (o.id === id ? { ...o, watched: value } : o)) },
      );
    apply(watched);
    const result = await setWatched(kind, id, watched).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!result.ok) {
      apply(!watched);
      toast(result.error, "bad");
    }
  }

  async function follow(sourceId: number, value: boolean) {
    const topicId = store.get().topicId;
    const apply = (followed: boolean, feedUrl?: string | null) =>
      store.set((s) => {
        const data = s.payloads[topicId];
        if (!data) return {};
        const sources = data.sources.map((src) =>
          src.id === sourceId ? { ...src, followed, feedUrl: feedUrl === undefined ? src.feedUrl : feedUrl } : src,
        );
        return { payloads: { ...s.payloads, [topicId]: { ...data, sources } } };
      });
    apply(value);
    const result = await setFollowed(topicId, sourceId, value).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!result.ok) {
      apply(!value);
      toast(result.error, "bad");
      return;
    }
    apply(result.followed, result.feedUrl);
    applyTopic(result.topic);
    toast(value ? "Following. The next run collects from it directly." : "Unfollowed.", "good");
  }

  /** Hides a YouTube channel: its videos stop being collected and shown. Following it stops too. */
  async function hideChannel(sourceKey: string, name: string) {
    const topicId = store.get().topicId;
    const data = store.get().payloads[topicId];
    const id = sourceKey.replace(/^youtube:/, "");
    if (!data || !id) return;
    const yt = data.topic.config.queries.youtube;
    const config = {
      ...data.topic.config,
      queries: {
        ...data.topic.config.queries,
        youtube: {
          ...yt,
          hiddenChannels: [...yt.hiddenChannels.filter((c) => !c.includes(id)), `https://www.youtube.com/channel/${id}`],
          channels: yt.channels.filter((c) => !c.includes(id)),
        },
      },
    };
    const result = await saveTopicSettings(topicId, { name: data.topic.name, description: data.topic.description, config }).catch((e: Error) => ({
      ok: false as const,
      error: e.message,
    }));
    if (!result.ok) {
      toast(result.error, "bad");
      return;
    }
    applyTopic(result.topic);
    store.set((s) => {
      const current = s.payloads[topicId];
      if (!current) return {};
      const sources = current.sources.map((src) => (src.key === sourceKey ? { ...src, followed: false } : src));
      return { payloads: { ...s.payloads, [topicId]: { ...current, sources } } };
    });
    toast(`Hid ${name}. Its videos won't be collected or shown. Undo in Settings, under YouTube.`, "good");
  }

  async function saveSettings(input: { name: string; description: string; config: unknown }): Promise<string | null> {
    const topicId = store.get().topicId;
    const result = await saveTopicSettings(topicId, input).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!result.ok) return result.error;
    applyTopic(result.topic);
    toast("Saved. The next run uses these settings.", "good");
    return null;
  }

  async function resetSettings(): Promise<string | null> {
    const result = await resetTopicSettings(store.get().topicId).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!result.ok) return result.error;
    applyTopic(result.topic);
    toast("Settings reset to the defaults.", "good");
    return null;
  }

  async function setActive(topicId: number, active: boolean) {
    const result = await setTopicActive(topicId, active).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!result.ok) {
      toast(result.error, "bad");
      return;
    }
    store.set((s) => ({
      topics: s.topics.map((t) => (t.id === topicId ? { ...t, active } : t)),
      payloads: s.payloads[topicId]
        ? { ...s.payloads, [topicId]: { ...s.payloads[topicId], topic: { ...s.payloads[topicId].topic, active } } }
        : s.payloads,
    }));
    toast(active ? "Topic restored. It runs on the schedule again." : "Topic archived. Its data stays; scheduled runs stop.", "good");
  }

  async function newTopic(input: { name: string; brief: string }): Promise<{ error?: string; notes?: string[] }> {
    const result = await createTopic(input).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!result.ok) return { error: result.error };
    await loadSummaries(true);
    store.set((s) => ({ starting: { ...s.starting, [result.id]: Date.now() }, newTopic: false, view: "panel" }));
    selectTopic(result.id);
    void loadTopic(result.id, true);
    schedulePoll(800);
    toast("Topic created. The first run has started; items appear as sources come in.", "good");
    return { notes: result.notes };
  }

  function open(selection: Selection) {
    store.set((s) => {
      const top = s.drawer[s.drawer.length - 1];
      if (top && top.kind === selection.kind && top.id === selection.id) return {};
      return { drawer: [...s.drawer.slice(-8), selection], palette: false };
    });
  }

  function back() {
    store.set((s) => ({ drawer: s.drawer.slice(0, -1) }));
  }

  function closeDrawer() {
    store.set({ drawer: [] });
  }

  function setTheme(theme: "dark" | "light") {
    document.documentElement.dataset.theme = theme;
    document.cookie = `radar-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
    store.set({ theme });
  }

  return {
    toast,
    loadTopic,
    loadSummaries,
    pollStatus,
    startPolling,
    stopPolling,
    prefetchTopics,
    selectTopic,
    setView,
    run,
    watch,
    follow,
    hideChannel,
    saveSettings,
    resetSettings,
    setActive,
    newTopic,
    open,
    back,
    closeDrawer,
    setTheme,
  };
}

export type Controller = ReturnType<typeof createController>;
