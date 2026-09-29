"use client";

import { ArrowLeft, ArrowUpRight, CircleDot, FileText, Quote, Rss, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { SOURCE_LABELS, type ConsoleData, type ItemDTO } from "@/lib/console/types";
import { itemsById, peopleByName } from "./derive";
import { CATEGORY_LABELS, formatDateTime, itemTime, KIND_LABELS, linkedinSearch, PRIMARY_KIND_LABELS, RELATION_LABELS } from "./format";
import { LinkedInIcon, STREAM_ICONS } from "./icons";
import { ItemMini, streamLabel } from "./items";
import { useConsole, useCtl, useTopicData, type Selection } from "./store";
import { Badge, RelevanceMeter, TimeAgo } from "./ui";
import { OrgChip, PersonChip, StoryBody } from "./views/brief";
import { Relations, WatchButton } from "./views/people";
import { FollowButton } from "./views/sources";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="label mb-2.5">{title}</h3>
      {children}
    </section>
  );
}

function OpenButton({ href, label = "Open the original" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-ink hover:bg-accent-strong"
    >
      {label} <ArrowUpRight size={14} />
    </a>
  );
}

function ItemDetail({ item, data }: { item: ItemDTO; data: ConsoleData }) {
  const ctl = useCtl();
  const timeZone = useConsole((s) => s.timeZone);
  const Icon = STREAM_ICONS[item.stream];
  const threshold = data.topic.config.relevanceThreshold;
  const inStories = data.stories.filter((s) => s.itemIds.includes(item.id));
  const source = data.sources.find((s) => s.key === item.sourceKey);
  const people = peopleByName(data);
  const stream = streamLabel(item.stream);
  const outlet = item.outlet ?? item.sourceKey;
  const via = SOURCE_LABELS[item.source] ?? item.source;
  // Google names a LinkedIn poster on some results only; another post from the account may say who it is.
  const linkedInAccount = item.source === "linkedin" && item.sourceKey.startsWith("linkedin:") ? item.sourceKey.slice("linkedin:".length) : null;
  const author =
    item.author ?? (linkedInAccount ? (data.items.find((i) => i.sourceKey === item.sourceKey && i.author)?.author ?? `@${linkedInAccount}`) : null);
  return (
    <>
      <div className="px-5 pt-1 pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
          <span className="inline-flex items-center gap-1 text-fg-2">
            <Icon size={12} /> {stream}
          </span>
          {outlet !== stream ? (
            <>
              <span aria-hidden>·</span>
              {source ? (
                <button type="button" onClick={() => ctl.open({ kind: "source", id: source.id })} className="text-fg-2 hover:text-accent">
                  {outlet}
                </button>
              ) : (
                <span>{outlet}</span>
              )}
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span title={formatDateTime(itemTime(item), timeZone)}>
            <TimeAgo iso={itemTime(item)} />
          </span>
          {via !== stream && via !== outlet ? <span className="font-mono text-[10.5px]">via {via}</span> : null}
        </div>
        <h2 className="mt-2 text-[18px] leading-snug font-semibold tracking-tight">{item.title}</h2>
        {author ? (
          <div className="mt-1 text-[12.5px] text-fg-2">
            By{" "}
            {item.authorUrl ? (
              <a href={item.authorUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                {author}
              </a>
            ) : (
              author
            )}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RelevanceMeter value={item.relevance} threshold={threshold} />
          {item.isOrigin ? (
            <Badge tone="accent">
              <CircleDot size={10} /> Origin
            </Badge>
          ) : null}
          {item.category ? <Badge>{CATEGORY_LABELS[item.category] ?? item.category}</Badge> : null}
        </div>
        <div className="mt-4">
          <OpenButton href={item.href} />
        </div>
      </div>

      {item.summary || item.gist || item.snippet ? (
        <Section title={item.summary ? "Summary" : item.gist ? "Gist" : "Snippet"}>
          <p className="text-[13.5px] leading-relaxed text-fg-2">{item.summary ?? item.gist ?? item.snippet}</p>
          {item.whyItMatters ? (
            <p className="mt-3 text-[13.5px] leading-relaxed">
              <span className="label mr-2 !text-accent">Why it matters</span>
              {item.whyItMatters}
            </p>
          ) : null}
        </Section>
      ) : null}

      {!item.isOrigin && item.originHint ? (
        <Section title="Based on">
          <p className="text-[13px] text-fg-2">{item.originHint}</p>
        </Section>
      ) : null}

      {item.primarySources.length ? (
        <Section title="Primary sources">
          <ul className="space-y-2 text-[13px]">
            {item.primarySources.map((p) => (
              <li key={`${p.title}-${p.url}`} className="flex items-start gap-2">
                <Badge className="mt-px">
                  <FileText size={10} /> {PRIMARY_KIND_LABELS[p.kind] ?? "Source"}
                </Badge>
                <span className="min-w-0 break-anywhere">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-accent-strong">
                      {p.title} <ArrowUpRight size={11} className="inline text-fg-3" />
                    </a>
                  ) : (
                    p.title
                  )}
                  {p.publisher ? <span className="text-fg-3"> · {p.publisher}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {item.people.length || item.orgs.length ? (
        <Section title="People and organizations">
          <div className="flex flex-wrap gap-1.5">
            {item.people.map((p) => (
              <PersonChip key={p.id} name={p.relation && p.relation !== "mentioned" ? `${p.name} (${RELATION_LABELS[p.relation]?.toLowerCase() ?? p.relation})` : p.name} person={data.people.find((x) => x.id === p.id) ?? people.get(p.name.toLowerCase())} />
            ))}
            {item.orgs.map((o) => (
              <OrgChip key={o.id} name={o.name} data={data} />
            ))}
          </div>
        </Section>
      ) : null}

      {inStories.length ? (
        <Section title="In the brief">
          <ul className="space-y-1">
            {inStories.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => ctl.open({ kind: "story", id: s.id })} className="text-left text-[13px] text-fg hover:text-accent-strong">
                  {s.title}
                </button>
                <span className="ml-2 font-mono text-[11px] text-fg-3">{s.briefDate}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {item.matchedQuery ? (
        <Section title="Found by">
          <code className="font-mono text-[12px] break-anywhere text-fg-2">{item.matchedQuery}</code>
        </Section>
      ) : null}
    </>
  );
}

function PersonDetail({ id, data }: { id: number; data: ConsoleData }) {
  const person = data.people.find((p) => p.id === id);
  const index = itemsById(data);
  if (!person) return <Missing />;
  const quotes = person.recent.filter((m) => m.quote);
  return (
    <>
      <div className="px-5 pt-1 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] leading-tight font-semibold tracking-tight">{person.name}</h2>
            {person.role || person.orgName ? <p className="mt-1 text-[13px] text-fg-2">{[person.role, person.orgName].filter(Boolean).join(", ")}</p> : null}
            {person.linkedinHeadline ? <p className="mt-1 text-[12.5px] text-fg-3">LinkedIn: {person.linkedinHeadline}</p> : null}
          </div>
          <WatchButton kind="person" id={person.id} watched={person.watched} />
        </div>
        <div className="mt-3">
          <Relations relations={person.relations} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={person.linkedinUrl ?? linkedinSearch(person.name, person.orgName)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-[13px] text-fg hover:border-line-2"
          >
            <LinkedInIcon size={14} /> {person.linkedinUrl ? "LinkedIn" : "Find on LinkedIn"}
          </a>
          {person.xHandle ? (
            <a
              href={`https://x.com/${person.xHandle.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 text-[13px] text-fg hover:border-line-2"
            >
              @{person.xHandle.replace(/^@/, "")}
            </a>
          ) : null}
        </div>
      </div>
      {quotes.length ? (
        <Section title="In their words">
          <ul className="space-y-3">
            {quotes.map((m) => {
              const item = index.get(m.itemId);
              return (
                <li key={`${m.itemId}-${m.relation}`} className="rounded-lg border border-line bg-panel-2/60 p-3">
                  <Quote size={13} className="mb-1 text-accent" />
                  <p className="text-[13.5px] leading-relaxed text-fg">{m.quote}</p>
                  {item ? <div className="mt-1.5 truncate text-[12px] text-fg-3">{item.outlet ?? item.sourceKey} · {item.title}</div> : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
      <Section title={`Appears in ${person.mentions} ${person.mentions === 1 ? "item" : "items"}`}>
        <ul className="-mx-2">
          {person.recent.map((m) => {
            const item = index.get(m.itemId);
            return item ? <ItemMini key={`${m.itemId}-${m.relation}`} item={item} threshold={data.topic.config.relevanceThreshold} note={RELATION_LABELS[m.relation]} /> : null;
          })}
        </ul>
      </Section>
    </>
  );
}

function OrgDetail({ id, data }: { id: number; data: ConsoleData }) {
  const ctl = useCtl();
  const org = data.orgs.find((o) => o.id === id);
  const index = itemsById(data);
  if (!org) return <Missing />;
  const colleagues = data.people.filter((p) => p.orgName && p.orgName.toLowerCase().includes(org.name.toLowerCase())).slice(0, 12);
  return (
    <>
      <div className="px-5 pt-1 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] leading-tight font-semibold tracking-tight">{org.name}</h2>
            {org.kind ? <p className="mt-1 text-[13px] text-fg-2 capitalize">{org.kind.replaceAll("_", " ")}</p> : null}
          </div>
          <WatchButton kind="org" id={org.id} watched={org.watched} />
        </div>
        <div className="mt-3">
          <Relations relations={org.relations} />
        </div>
      </div>
      {colleagues.length ? (
        <Section title="People here">
          <ul className="space-y-1.5">
            {colleagues.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => ctl.open({ kind: "person", id: p.id })} className="text-left text-[13px] text-fg hover:text-accent-strong">
                  {p.name}
                </button>
                {p.role ? <span className="ml-2 text-[12px] text-fg-3">{p.role}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title={`Appears in ${org.mentions} ${org.mentions === 1 ? "item" : "items"}`}>
        <ul className="-mx-2">
          {org.itemIds.map((itemId) => {
            const item = index.get(itemId);
            return item ? <ItemMini key={itemId} item={item} threshold={data.topic.config.relevanceThreshold} /> : null;
          })}
        </ul>
      </Section>
    </>
  );
}

function SourceDetail({ id, data }: { id: number; data: ConsoleData }) {
  const source = data.sources.find((s) => s.id === id);
  if (!source) return <Missing />;
  const items = data.items.filter((i) => i.sourceKey === source.key).slice(0, 30);
  const Icon = STREAM_ICONS[source.stream];
  return (
    <>
      <div className="px-5 pt-1 pb-4">
        <div className="flex items-center gap-2 text-[12px] text-fg-3">
          <Icon size={12} /> {KIND_LABELS[source.kind] ?? source.kind}
        </div>
        <h2 className="mt-1.5 text-[20px] leading-tight font-semibold tracking-tight">{source.name}</h2>
        <p className="mt-1 font-mono text-[12px] text-fg-3">{source.key}</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["Items", source.items],
            ["Relevant", source.relevant],
            ["Origins", source.origins],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line bg-panel-2/60 px-3 py-2">
              <div className="text-[11.5px] text-fg-3">{label}</div>
              <div className="font-mono text-[18px] tabular-nums">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FollowButton source={source} />
          {source.link ? <OpenButton href={source.link} label="Visit" /> : null}
          {source.feedUrl ? (
            <a href={source.feedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-fg-2 hover:text-fg">
              <Rss size={13} /> Feed
            </a>
          ) : null}
        </div>
      </div>
      <Section title="Recent items">
        <ul className="-mx-2">
          {items.map((item) => (
            <ItemMini key={item.id} item={item} threshold={data.topic.config.relevanceThreshold} />
          ))}
        </ul>
      </Section>
    </>
  );
}

function StoryDetail({ id, data }: { id: number; data: ConsoleData }) {
  const story = data.stories.find((s) => s.id === id);
  if (!story) return <Missing />;
  const index = itemsById(data);
  const items = story.itemIds.map((i) => index.get(i)).filter((i): i is ItemDTO => Boolean(i));
  return (
    <>
      <div className="px-5 pt-1 pb-4">
        <div className="label">
          Story {story.rank} · {story.briefDate}
        </div>
        <h2 className="mt-1.5 text-[20px] leading-snug font-semibold tracking-tight">{story.title}</h2>
        <div className="mt-3">
          <StoryBody story={story} data={data} />
        </div>
      </div>
      <Section title={`All ${items.length} sources`}>
        <ul className="-mx-2">
          {items.map((item) => (
            <ItemMini key={item.id} item={item} threshold={data.topic.config.relevanceThreshold} note={item.id === story.originItemId ? "Origin" : undefined} />
          ))}
        </ul>
      </Section>
    </>
  );
}

function ProfileDetail({ id, data }: { id: number; data: ConsoleData }) {
  const ctl = useCtl();
  const timeZone = useConsole((s) => s.timeZone);
  const profile = data.profiles.find((p) => p.id === id);
  if (!profile) return <Missing />;
  const inNews = data.people.find((p) => p.linkedinUrl === profile.url || p.name.toLowerCase() === profile.name.toLowerCase());
  return (
    <>
      <div className="px-5 pt-1 pb-4">
        <h2 className="text-[20px] leading-tight font-semibold tracking-tight">{profile.name}</h2>
        {profile.headline ? <p className="mt-1 text-[13px] text-fg-2">{profile.headline}</p> : null}
        {profile.company || profile.location ? (
          <p className="mt-0.5 text-[12.5px] text-fg-3">{[profile.company, profile.location].filter(Boolean).join(" · ")}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <OpenButton href={profile.url} label="Open LinkedIn profile" />
          {inNews ? (
            <button
              type="button"
              onClick={() => ctl.open({ kind: "person", id: inNews.id })}
              className="inline-flex h-8 items-center rounded-lg border border-line bg-panel-2 px-3 text-[13px] text-fg hover:border-line-2"
            >
              Also in the news
            </button>
          ) : null}
        </div>
      </div>
      {profile.about ? (
        <Section title="From their profile">
          <p className="text-[13.5px] leading-relaxed text-fg-2">{profile.about}</p>
        </Section>
      ) : null}
      <Section title="How Radar found them">
        <p className="text-[13px] text-fg-2">
          Their public profile matched the people search{" "}
          <code className="font-mono text-[12px] text-fg">{profile.matchedQuery ?? "for this topic"}</code>. First seen{" "}
          {formatDateTime(profile.firstSeenAt, timeZone)}.
        </p>
      </Section>
    </>
  );
}

function Missing() {
  return <div className="px-5 py-8 text-[13px] text-fg-3">This is no longer in the current data.</div>;
}

function Body({ selection, data }: { selection: Selection; data: ConsoleData }) {
  switch (selection.kind) {
    case "item": {
      const item = itemsById(data).get(selection.id);
      return item ? <ItemDetail item={item} data={data} /> : <Missing />;
    }
    case "story":
      return <StoryDetail id={selection.id} data={data} />;
    case "person":
      return <PersonDetail id={selection.id} data={data} />;
    case "org":
      return <OrgDetail id={selection.id} data={data} />;
    case "source":
      return <SourceDetail id={selection.id} data={data} />;
    case "profile":
      return <ProfileDetail id={selection.id} data={data} />;
  }
}

const KIND_TITLES: Record<Selection["kind"], string> = {
  item: "Item",
  story: "Story",
  person: "Person",
  org: "Organization",
  source: "Source",
  profile: "LinkedIn profile",
};

export function Drawer() {
  const ctl = useCtl();
  const data = useTopicData();
  const stack = useConsole((s) => s.drawer);
  const top = stack[stack.length - 1];
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [top?.kind, top?.id]);

  if (!top || !data) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:bg-black/15" onClick={ctl.closeDrawer} aria-hidden />
      <aside
        role="dialog"
        aria-label={`${KIND_TITLES[top.kind]} details`}
        className="animate-slide-in fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line-2 bg-panel shadow-[var(--shadow)] sm:w-[520px]"
      >
        <header className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex items-center gap-1">
            {stack.length > 1 ? (
              <button type="button" onClick={ctl.back} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 hover:bg-panel-2 hover:text-fg" aria-label="Back">
                <ArrowLeft size={16} />
              </button>
            ) : null}
            <span className="label px-2">{KIND_TITLES[top.kind]}</span>
          </div>
          <button type="button" onClick={ctl.closeDrawer} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 hover:bg-panel-2 hover:text-fg" aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div ref={bodyRef} className="scroll min-h-0 flex-1 overflow-y-auto pb-8">
          <Body selection={top} data={data} />
        </div>
      </aside>
    </>
  );
}
