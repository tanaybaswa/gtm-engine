"use client";

import { ArrowUpRight, CircleDot, FileText, Play, Sparkles } from "lucide-react";
import type { ConsoleData, ItemDTO, PersonDTO, StoryDTO } from "@/lib/console/types";
import { itemsById, peopleByName, storiesFor, storyItems } from "../derive";
import { formatBriefDate, formatDay, PRIMARY_KIND_LABELS } from "../format";
import { useConsole, useCtl, useStore, useTopicData } from "../store";
import { Badge, Button, Empty, Skeleton } from "../ui";

function primarySources(items: ItemDTO[]) {
  const seen = new Set<string>();
  const out: (ItemDTO["primarySources"][number] & { via: ItemDTO })[] = [];
  for (const item of items) {
    for (const p of item.primarySources) {
      const key = (p.url ?? p.title).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...p, via: item });
    }
  }
  return out.slice(0, 4);
}

export function PersonChip({ name, person }: { name: string; person?: PersonDTO }) {
  const ctl = useCtl();
  if (!person) return <span className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-[12px] text-fg-2">{name}</span>;
  return (
    <button
      type="button"
      onClick={() => ctl.open({ kind: "person", id: person.id })}
      className="inline-flex h-6 items-center gap-1.5 rounded-full bg-accent-soft px-2.5 text-[12px] font-medium text-accent hover:brightness-125"
      title={[person.role, person.orgName].filter(Boolean).join(", ")}
    >
      {person.watched ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
      {name}
    </button>
  );
}

export function OrgChip({ name, data }: { name: string; data: ConsoleData }) {
  const ctl = useCtl();
  const org = data.orgs.find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (!org) return <span className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-[12px] text-fg-2">{name}</span>;
  return (
    <button
      type="button"
      onClick={() => ctl.open({ kind: "org", id: org.id })}
      className="inline-flex h-6 items-center rounded-full border border-line px-2.5 text-[12px] text-fg-2 hover:border-line-2 hover:text-fg"
    >
      {name}
    </button>
  );
}

export function StoryBody({ story, data }: { story: StoryDTO; data: ConsoleData }) {
  const ctl = useCtl();
  const timeZone = useConsole((s) => s.timeZone);
  const items = storyItems(data, story);
  const origin = items.find((i) => i.id === story.originItemId);
  const others = items.filter((i) => i.id !== origin?.id);
  const primary = primarySources(items);
  const hint = items.find((i) => i.originHint)?.originHint;
  const people = peopleByName(data);
  return (
    <>
      <p className="text-[14px] leading-relaxed text-fg-2">{story.summary}</p>
      {story.whyItMatters ? (
        <p className="mt-3 text-[14px] leading-relaxed">
          <span className="label mr-2 !text-accent">Why it matters</span>
          {story.whyItMatters}
        </p>
      ) : null}

      <div className="mt-4 space-y-2.5 rounded-lg border border-line bg-panel-2/60 p-3 text-[13px]">
        {origin ? (
          <div className="flex items-start gap-2">
            <Badge tone="accent" className="mt-px">
              <CircleDot size={10} /> Origin
            </Badge>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => ctl.open({ kind: "item", id: origin.id })} className="text-left font-medium text-fg hover:text-accent-strong">
                {origin.title}
              </button>
              <div className="mt-0.5 text-[12px] text-fg-3">
                {origin.outlet ?? origin.sourceKey} · {formatDay(origin.publishedAt ?? origin.collectedAt, timeZone)} ·{" "}
                <a href={origin.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-fg-2 hover:text-accent">
                  open <ArrowUpRight size={11} />
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-fg-2">
            <Badge tone="warn" className="mt-px">
              Origin not collected
            </Badge>
            <span>{hint ? `Points back to ${hint}.` : "None of the collected items is the original."}</span>
          </div>
        )}
        {primary.map((p) => (
          <div key={`${p.title}-${p.url}`} className="flex items-start gap-2">
            <Badge className="mt-px">
              <FileText size={10} /> {PRIMARY_KIND_LABELS[p.kind] ?? "Source"}
            </Badge>
            <div className="min-w-0 flex-1 break-anywhere">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-accent-strong">
                  {p.title} <ArrowUpRight size={11} className="inline text-fg-3" />
                </a>
              ) : (
                <span className="text-fg">{p.title}</span>
              )}
              {p.publisher ? <span className="text-fg-3"> · {p.publisher}</span> : null}
            </div>
          </div>
        ))}
        {others.length ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[12px] text-fg-3">
            <span>Also covered by</span>
            {others.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => ctl.open({ kind: "item", id: o.id })}
                className="rounded-md border border-line px-1.5 py-0.5 text-fg-2 hover:border-line-2 hover:text-fg"
                title={o.title}
              >
                {o.outlet ?? o.sourceKey}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {story.peopleNames.length || story.orgNames.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {story.peopleNames.map((name) => (
            <PersonChip key={`p-${name}`} name={name} person={people.get(name.toLowerCase())} />
          ))}
          {story.orgNames.map((name) => (
            <OrgChip key={`o-${name}`} name={name} data={data} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function StoryCard({ story, data }: { story: StoryDTO; data: ConsoleData }) {
  const ctl = useCtl();
  return (
    <article className="surface animate-rise rounded-xl p-4 sm:p-5">
      <div className="flex gap-3 sm:gap-4">
        <span className="font-mono text-[20px] leading-tight text-accent tabular-nums">{String(story.rank).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] leading-snug font-semibold tracking-tight sm:text-[18px]">
            <button type="button" onClick={() => ctl.open({ kind: "story", id: story.id })} className="text-left hover:text-accent-strong">
              {story.title}
            </button>
          </h2>
          <div className="mt-2">
            <StoryBody story={story} data={data} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function BriefView() {
  const data = useTopicData();
  const store = useStore();
  const ctl = useCtl();
  const briefDate = useConsole((s) => s.briefDate);
  if (!data) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-3 p-4">
        <Skeleton className="h-8 w-72" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-48 !rounded-xl" />
        ))}
      </div>
    );
  }
  const date = briefDate && data.briefDates.includes(briefDate) ? briefDate : data.briefDates[0];
  const stories = storiesFor(data, date);
  const people = peopleByName(data);
  const index = itemsById(data);
  const voices = [...new Set(stories.flatMap((s) => s.peopleNames))]
    .map((name) => people.get(name.toLowerCase()))
    .filter((p): p is PersonDTO => Boolean(p));
  const origins = stories
    .map((s) => (s.originItemId ? index.get(s.originItemId) : undefined))
    .filter((i): i is ItemDTO => Boolean(i));

  if (!stories.length) {
    return (
      <div className="mx-auto max-w-[1180px] p-4">
        <Empty
          icon={Sparkles}
          title="No brief yet"
          action={
            data.spend.ai.enabled ? (
              <Button variant="primary" icon={Play} onClick={() => ctl.run("brief")}>
                Write the brief now
              </Button>
            ) : null
          }
        >
          {data.spend.ai.enabled
            ? "Claude writes the brief each morning from the day's relevant items, grouping echoes under the story that started them."
            : "The brief needs Claude. Add ANTHROPIC_API_KEY in the project settings to turn it on."}
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1180px] gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label">Morning brief</div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight">{formatBriefDate(date)}</h1>
            <p className="mt-0.5 text-[13px] text-fg-3">
              {stories.length} stories from {new Set(stories.flatMap((s) => s.itemIds)).size} sources
            </p>
          </div>
        </header>
        {stories.map((story) => (
          <StoryCard key={story.id} story={story} data={data} />
        ))}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="surface rounded-xl p-4">
          <h2 className="label">People in this brief</h2>
          {voices.length ? (
            <ul className="mt-2.5 space-y-2">
              {voices.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => ctl.open({ kind: "person", id: p.id })} className="group w-full text-left">
                    <span className="text-[13px] font-medium text-fg group-hover:text-accent-strong">{p.name}</span>
                    {p.role || p.orgName ? <span className="block truncate text-[12px] text-fg-3">{[p.role, p.orgName].filter(Boolean).join(", ")}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-fg-3">No named voices in today&apos;s stories.</p>
          )}
        </section>
        {origins.length ? (
          <section className="surface rounded-xl p-4">
            <h2 className="label">Where stories started</h2>
            <ul className="mt-2.5 space-y-1.5 text-[13px]">
              {origins.map((o) => (
                <li key={o.id} className="flex items-center gap-2">
                  <CircleDot size={11} className="shrink-0 text-accent" />
                  <button type="button" onClick={() => ctl.open({ kind: "item", id: o.id })} className="truncate text-fg-2 hover:text-fg">
                    {o.outlet ?? o.sourceKey}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {data.briefDates.length > 1 ? (
          <section className="surface rounded-xl p-4">
            <h2 className="label">Earlier briefs</h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {data.briefDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => store.set({ briefDate: d })}
                  className={`h-7 rounded-md px-2 font-mono text-[11.5px] ${
                    d === date ? "bg-accent-soft text-accent" : "border border-line text-fg-2 hover:text-fg"
                  }`}
                >
                  {formatBriefDate(d, "short")}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
