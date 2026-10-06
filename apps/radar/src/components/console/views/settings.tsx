"use client";

import { Archive, ArchiveRestore, Braces, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { SearchResultDTO, TopicDTO } from "@/lib/console/types";
import { SOURCE_KINDS } from "@/lib/topics/kinds";
import type { FeedConfig, TopicConfig } from "@/lib/topics/types";
import { KIND_LABELS } from "../format";
import { useCtl, useTopicData } from "../store";
import { Button, Panel, Skeleton, TimeAgo } from "../ui";

const input =
  "h-8 w-full rounded-lg border border-line bg-panel-2 px-2.5 text-[13px] text-fg placeholder:text-fg-3 focus:border-accent/60 focus:outline-none";
const textarea =
  "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] leading-relaxed text-fg placeholder:text-fg-3 focus:border-accent/60 focus:outline-none";

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="text-[13px] font-medium text-fg">{label}</div>
      {hint ? <div className="mt-0.5 mb-2 text-[12px] leading-relaxed text-fg-3">{hint}</div> : <div className="mb-2" />}
      {children}
    </div>
  );
}

/** One line per entry, for long values such as search queries. */
function LinesEditor({
  values,
  onChange,
  placeholder,
  status,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  status?: (value: string) => ReactNode;
}) {
  const [next, setNext] = useState("");
  const add = () => {
    const v = next.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setNext("");
  };
  return (
    <div className="space-y-1.5">
      {values.map((value, i) => (
        <div key={i}>
          <div className="flex items-center gap-1.5">
            <input
              className={`${input} font-mono text-[12px]`}
              value={value}
              onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
              aria-label={`Entry ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-panel-3 hover:text-bad"
              aria-label="Remove"
            >
              <Trash2 size={13} />
            </button>
          </div>
          {status ? <div className="mt-0.5 mb-1 pl-1 text-[11.5px]">{status(value)}</div> : null}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <input
          className={`${input} font-mono text-[12px]`}
          value={next}
          placeholder={placeholder}
          onChange={(e) => setNext(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-fg-2 hover:text-fg"
          aria-label="Add"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/** Chips for short values: keywords, subreddits, accounts, names. */
function ChipsEditor({
  values,
  onChange,
  placeholder,
  badge,
  normalize = (v) => v,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  badge?: (value: string) => ReactNode;
  normalize?: (value: string) => string;
}) {
  const [next, setNext] = useState("");
  const add = () => {
    const parts = next
      .split(",")
      .map((s) => normalize(s.trim()))
      .filter(Boolean);
    if (parts.length) onChange([...new Set([...values, ...parts])]);
    setNext("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !next && values.length) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-panel-2 p-1.5 focus-within:border-accent/60">
      {values.map((value) => (
        <span key={value} className="inline-flex h-6 items-center gap-1 rounded-md bg-panel-3 pr-1 pl-2 text-[12px] text-fg">
          {value}
          {badge ? badge(value) : null}
          <button type="button" onClick={() => onChange(values.filter((v) => v !== value))} className="rounded text-fg-3 hover:text-fg" aria-label={`Remove ${value}`}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        className="h-6 min-w-[140px] flex-1 bg-transparent px-1 text-[12.5px] text-fg placeholder:text-fg-3 focus:outline-none"
        value={next}
        placeholder={placeholder}
        onChange={(e) => setNext(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
      />
    </div>
  );
}

function FeedsEditor({ feeds, onChange }: { feeds: FeedConfig[]; onChange: (v: FeedConfig[]) => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const update = (i: number, patch: Partial<FeedConfig>) => onChange(feeds.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = () => {
    const u = url.trim();
    if (!/^https?:\/\//.test(u) || feeds.some((f) => f.url === u)) return;
    onChange([...feeds, { url: u, name: name.trim() || undefined, kind: "publication", filter: true }]);
    setUrl("");
    setName("");
  };
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-line">
        {feeds.map((feed, i) => (
          <div key={feed.url} className="grid items-center gap-2 border-b border-line px-3 py-2 last:border-0 md:grid-cols-[minmax(0,1fr)_150px_110px_32px]">
            <div className="min-w-0">
              <input className="w-full bg-transparent text-[13px] font-medium text-fg focus:outline-none" value={feed.name ?? ""} placeholder="Name" onChange={(e) => update(i, { name: e.target.value || undefined })} />
              <div className="truncate font-mono text-[11px] text-fg-3" title={feed.url}>
                {feed.url}
              </div>
            </div>
            <select
              className={`${input} !h-7 !text-[12px]`}
              value={feed.kind ?? "publication"}
              onChange={(e) => update(i, { kind: e.target.value as FeedConfig["kind"] })}
              aria-label="Kind of source"
            >
              {SOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k] ?? k}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-[12px] text-fg-2" title="Keep every item from this feed, without the keyword filter">
              <input type="checkbox" checked={!feed.filter} onChange={(e) => update(i, { filter: !e.target.checked })} className="accent-[var(--accent)]" />
              Keep all
            </label>
            <button
              type="button"
              onClick={() => onChange(feeds.filter((_, j) => j !== i))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-3 hover:bg-panel-3 hover:text-bad"
              aria-label={`Remove ${feed.name ?? feed.url}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {!feeds.length ? <div className="px-3 py-3 text-[12.5px] text-fg-3">No feeds yet.</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input className={`${input} max-w-md flex-[2] font-mono text-[12px]`} value={url} placeholder="https://example.com/feed" onChange={(e) => setUrl(e.target.value)} />
        <input className={`${input} max-w-[220px] flex-1`} value={name} placeholder="Name (optional)" onChange={(e) => setName(e.target.value)} />
        <Button size="sm" icon={Plus} onClick={add}>
          Add feed
        </Button>
      </div>
    </div>
  );
}

function OutcomeLine({ result }: { result: SearchResultDTO | undefined }) {
  if (!result) return <span className="text-fg-3">Not run yet. It runs with the next collection.</span>;
  if (result.error) return <span className="text-bad">{result.error}</span>;
  return (
    <span className="text-fg-3">
      {result.label ? <span className="mr-1.5 font-medium text-fg">{result.label}</span> : null}
      <span className="text-fg-2">{result.label ? `${result.found} recent` : `${result.found} found`}</span> <TimeAgo iso={result.at} />
      {result.ranAs ? (
        <span className="block text-warn">
          Serper&apos;s free plan refused the full search, so this ran: <code className="font-mono">{result.ranAs}</code>
        </span>
      ) : null}
    </span>
  );
}

type Draft = { name: string; description: string; config: TopicConfig };

function SettingsEditor({ topic }: { topic: TopicDTO }) {
  const ctl = useCtl();
  const initial: Draft = { name: topic.name, description: topic.description, config: topic.config };
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const c = draft.config;
  const setConfig = (fn: (c: TopicConfig) => TopicConfig) => setDraft((d) => ({ ...d, config: fn(structuredClone(d.config)) }));
  const q = c.queries;
  const data = useTopicData();
  const serperOn = data?.spend.serper.enabled ?? false;
  const youtubeOn = data?.spend.youtube.enabled ?? false;
  const searches = data?.searches;
  // Each search's latest result: news:<search>, posts:<search>, #<tag> and people:<search>.
  const outcome = (prefix: string) => (serperOn ? (value: string) => <OutcomeLine result={searches?.[`${prefix}${value}`]} /> : undefined);

  const save = async () => {
    setSaving(true);
    setError(await ctl.saveSettings(draft));
    setSaving(false);
  };

  return (
    <div className="mx-auto max-w-[980px] space-y-4 p-4 pb-24 sm:p-5 sm:pb-24">
      <Panel title="Topic">
        <div className="space-y-4">
          <Field label="Name">
            <input className={input} aria-label="Topic name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Description" hint="Claude reads this to judge relevance. Say what matters and what doesn't.">
            <textarea
              className={textarea}
              aria-label="Topic description"
              rows={4}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="How Claude judges items">
        <div className="space-y-4">
          <Field label="Readers" hint="Who reads the brief. Why-it-matters lines are written for them. Leave empty to use the default shown.">
            <input
              className={input}
              value={c.guide.audience}
              placeholder={topic.guideDefaults.audience}
              onChange={(e) => setConfig((x) => ({ ...x, guide: { ...x.guide, audience: e.target.value } }))}
            />
          </Field>
          <Field label="Relevance guide" hint="One line per band: what scores 80-100, 55-79, 20-54 and 0-19. Leave empty to use the default shown.">
            <textarea
              className={`${textarea} font-mono text-[12px]`}
              rows={5}
              value={c.guide.relevance}
              placeholder={topic.guideDefaults.relevance}
              onChange={(e) => setConfig((x) => ({ ...x, guide: { ...x.guide, relevance: e.target.value } }))}
            />
          </Field>
          <Field label="Organizations worth tracking" hint="The kinds of organizations Claude extracts from each item. Leave empty to use the default shown.">
            <input
              className={input}
              value={c.guide.orgs}
              placeholder={topic.guideDefaults.orgs}
              onChange={(e) => setConfig((x) => ({ ...x, guide: { ...x.guide, orgs: e.target.value } }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Relevant from" hint="Items scoring at or above this count as signal.">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={30}
                  max={90}
                  step={5}
                  value={c.relevanceThreshold}
                  onChange={(e) => setConfig((x) => ({ ...x, relevanceThreshold: Number(e.target.value) }))}
                  className="flex-1 accent-[var(--accent)]"
                  aria-label="Relevance threshold"
                />
                <span className="w-8 font-mono text-[13px] tabular-nums">{c.relevanceThreshold}</span>
              </div>
            </Field>
            <Field label="Look back" hint="How far back each collection searches.">
              <select className={input} value={c.lookbackHours} onChange={(e) => setConfig((x) => ({ ...x, lookbackHours: Number(e.target.value) }))}>
                {[24, 36, 48, 72, 168].map((h) => (
                  <option key={h} value={h}>
                    {h < 48 ? `${h} hours` : `${h / 24} days`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Searches" meta="One set per source">
        <div className="space-y-5">
          <Field label="Google News" hint="Quotes, OR, parentheses and -minus work. site:example.com covers outlets without a feed.">
            <LinesEditor values={q.googleNews} placeholder='"exact phrase" (term OR term)' onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, googleNews: v } }))} />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Reddit searches">
              <LinesEditor values={q.reddit.search} placeholder='"phrase" OR "phrase"' onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, reddit: { ...x.queries.reddit, search: v } } }))} />
            </Field>
            <Field label="Subreddits">
              <ChipsEditor values={q.reddit.subreddits} placeholder="Name, then Enter" onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, reddit: { ...x.queries.reddit, subreddits: v } } }))} />
            </Field>
            <Field label="Hacker News">
              <LinesEditor values={q.hackerNews} placeholder='"phrase"' onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, hackerNews: v } }))} />
            </Field>
            <Field label="GDELT">
              <LinesEditor values={q.gdelt} placeholder='("phrase" OR "phrase")' onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, gdelt: v } }))} />
            </Field>
            <Field label="X searches" hint="Used only when X_BEARER_TOKEN is set.">
              <LinesEditor values={q.x.search} placeholder='"phrase" -is:retweet lang:en' onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, x: { ...x.queries.x, search: v } } }))} />
            </Field>
            <Field label="X accounts">
              <ChipsEditor values={q.x.accounts} placeholder="handle, then Enter" onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, x: { ...x.queries.x, accounts: v } } }))} />
            </Field>
            <Field label="Serper news" hint="Google News with publishers' own links. Used only when SERPER_API_KEY is set.">
              <LinesEditor
                values={q.serper.news}
                placeholder="plain search"
                status={outcome("news:")}
                onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, serper: { ...x.queries.serper, news: v } } }))}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="LinkedIn" meta={serperOn ? "Through Google, with Serper. Radar never logs in to LinkedIn." : "Off until SERPER_API_KEY is set"}>
        <div className="space-y-5">
          <p className="text-[12.5px] leading-relaxed text-fg-3">
            Posts and hashtags are searched up to once a day, people up to once a week; less often when needed to stay within the monthly Serper cap.
            Serper&apos;s free plan refuses some complex searches; Radar then runs a simpler form and says so under the search.
          </p>
          <Field label="Posts and articles" hint='One quoted phrase each works best, like "AI liability". Radar adds site:linkedin.com/posts; start with site:linkedin.com/pulse for articles.'>
            <LinesEditor
              values={q.serper.linkedin}
              placeholder='"phrase people write in posts"'
              status={outcome("posts:")}
              onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, serper: { ...x.queries.serper, linkedin: v } } }))}
            />
          </Field>
          <Field label="Hashtags" hint="Without the #. Searched on LinkedIn, and on X when X is on.">
            <ChipsEditor
              values={q.hashtags}
              placeholder="AIinsurance, then Enter"
              normalize={(v) => v.replace(/^#/, "").replace(/\s+/g, "")}
              badge={(tag) => {
                const result = searches?.[`#${tag}`];
                if (!serperOn || !result) return null;
                return (
                  <span className={`font-mono text-[10.5px] ${result.error ? "text-bad" : "text-fg-3"}`} title={result.error ?? `${result.found} found`}>
                    {result.error ? "!" : result.found}
                  </span>
                );
              }}
              onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, hashtags: v } }))}
            />
          </Field>
          <Field label="People searches" hint='Phrases people put in their LinkedIn headline or About, like "AI insurance". Radar adds site:linkedin.com/in. The people show on the LinkedIn view.'>
            <LinesEditor
              values={q.serper.profiles}
              placeholder='"phrase in their headline"'
              status={outcome("people:")}
              onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, serper: { ...x.queries.serper, profiles: v } } }))}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="YouTube" meta={youtubeOn ? "Official YouTube Data API, with a free key" : "Off until YOUTUBE_API_KEY is set"}>
        <div className="space-y-5">
          <p className="text-[12.5px] leading-relaxed text-fg-3">
            Searches run up to once a day, from a free allowance of about 100 a day shared by all topics. Followed channels are checked on every run
            through their public feeds, at no cost, and their videos go through the keyword filters. Shorts are skipped.
          </p>
          <Field label="Searches" hint='Quoted phrases work best, like "AI exclusions" insurance. OR works too.'>
            <LinesEditor
              values={q.youtube.search}
              placeholder='"phrase" insurance'
              status={youtubeOn ? (v: string) => <OutcomeLine result={searches?.[`youtube:${v}`]} /> : undefined}
              onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, youtube: { ...x.queries.youtube, search: v } } }))}
            />
          </Field>
          <Field label="Channels" hint="A channel's @handle, its URL or its ID. Follow channels from the YouTube view too.">
            <LinesEditor
              values={q.youtube.channels}
              placeholder="@channelhandle"
              status={youtubeOn ? (v: string) => <OutcomeLine result={searches?.[`channel:${v}`]} /> : undefined}
              onChange={(v) => setConfig((x) => ({ ...x, queries: { ...x.queries, youtube: { ...x.queries.youtube, channels: v } } }))}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Feeds" meta={`${c.feeds.length} feeds`}>
        <FeedsEditor feeds={c.feeds} onChange={(v) => setConfig((x) => ({ ...x, feeds: v }))} />
      </Panel>

      <Panel title="Filters" meta="Applied to general feeds and site: searches">
        <div className="space-y-4">
          {c.keywords.groups.map((group, i) => (
            <Field key={i} label={`Keyword group ${i + 1}`} hint={i === 0 ? "An item must match a term from every group. A trailing * matches prefixes." : undefined}>
              <div className="flex items-start gap-1.5">
                <div className="flex-1">
                  <ChipsEditor
                    values={group}
                    placeholder="term, then Enter"
                    onChange={(v) => setConfig((x) => ({ ...x, keywords: { ...x.keywords, groups: x.keywords.groups.map((g, j) => (j === i ? v : g)) } }))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setConfig((x) => ({ ...x, keywords: { ...x.keywords, groups: x.keywords.groups.filter((_, j) => j !== i) } }))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-3 hover:bg-panel-3 hover:text-bad"
                  aria-label={`Remove group ${i + 1}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </Field>
          ))}
          <Button size="sm" icon={Plus} onClick={() => setConfig((x) => ({ ...x, keywords: { ...x.keywords, groups: [...x.keywords.groups, []] } }))}>
            Add keyword group
          </Button>
          <Field label="Exclude" hint="Items mentioning any of these are dropped from every source.">
            <ChipsEditor values={c.keywords.exclude} placeholder="phrase, then Enter" onChange={(v) => setConfig((x) => ({ ...x, keywords: { ...x.keywords, exclude: v } }))} />
          </Field>
        </div>
      </Panel>

      <Panel title="Watchlist" meta="Claude always extracts these when an item names them">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Organizations">
            <ChipsEditor values={c.watch.orgs} placeholder="Name, then Enter" onChange={(v) => setConfig((x) => ({ ...x, watch: { ...x.watch, orgs: v } }))} />
          </Field>
          <Field label="People">
            <ChipsEditor values={c.watch.people} placeholder="Name, then Enter" onChange={(v) => setConfig((x) => ({ ...x, watch: { ...x.watch, people: v } }))} />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Advanced"
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={Braces}
            onClick={() => {
              setJson(json === null ? JSON.stringify(draft.config, null, 2) : null);
              setJsonError(null);
            }}
          >
            {json === null ? "Edit as JSON" : "Close JSON"}
          </Button>
        }
      >
        {json !== null ? (
          <div className="space-y-2">
            <textarea
              className={`${textarea} font-mono text-[11.5px]`}
              rows={20}
              spellCheck={false}
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                try {
                  setDraft((d) => ({ ...d, config: JSON.parse(e.target.value) }));
                  setJsonError(null);
                } catch (err) {
                  setJsonError((err as Error).message);
                }
              }}
            />
            {jsonError ? <p className="text-[12px] text-bad">{jsonError}</p> : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {topic.hasDefaults ? (
              <Button
                icon={RotateCcw}
                onClick={async () => {
                  if (!window.confirm("Reset this topic's settings to the defaults? Your changes to searches, feeds and filters are replaced.")) return;
                  setError(await ctl.resetSettings());
                }}
              >
                Reset to defaults
              </Button>
            ) : null}
            {topic.active ? (
              <Button
                variant="danger"
                icon={Archive}
                onClick={() => {
                  if (window.confirm(`Archive "${topic.name}"? Its data stays and you can restore it; scheduled runs stop.`)) void ctl.setActive(topic.id, false);
                }}
              >
                Archive topic
              </Button>
            ) : (
              <Button icon={ArchiveRestore} onClick={() => ctl.setActive(topic.id, true)}>
                Restore topic
              </Button>
            )}
          </div>
        )}
      </Panel>

      {dirty || error ? (
        <div className="animate-rise fixed inset-x-0 bottom-0 z-30 flex justify-center p-3 lg:pl-[248px]">
          <div className="flex w-full max-w-[980px] items-center justify-between gap-3 rounded-xl border border-line-2 bg-panel-3/95 px-4 py-2.5 shadow-[var(--shadow)] backdrop-blur">
            <span className={`min-w-0 truncate text-[13px] ${error ? "text-bad" : "text-fg-2"}`}>{error ?? "Unsaved changes. The next run uses them once saved."}</span>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(initial);
                  setJson(null);
                  setError(null);
                }}
              >
                Discard
              </Button>
              <Button variant="primary" loading={saving} disabled={Boolean(jsonError)} onClick={save}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsView() {
  const data = useTopicData();
  if (!data) {
    return (
      <div className="mx-auto max-w-[980px] space-y-4 p-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 !rounded-xl" />
        ))}
      </div>
    );
  }
  // A saved or refreshed topic starts a fresh draft.
  return <SettingsEditor key={`${data.topic.id}:${data.topic.updatedAt}`} topic={data.topic} />;
}
