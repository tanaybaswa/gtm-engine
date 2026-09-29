"use client";

import { ArrowUpRight, Hash, Play, Search, Users, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import type { ConsoleData, ItemDTO } from "@/lib/console/types";
import { hashtagsIn } from "@/lib/sources/linkedin";
import { byNewest, useFilteredItems } from "../derive";
import { itemTime, matches } from "../format";
import { LinkedInIcon } from "../icons";
import { useConsole, useCtl, useTopicData } from "../store";
import { Badge, Button, Empty, RelevanceMeter, Segmented, Skeleton, TimeAgo } from "../ui";

/** The account a post came from: "linkedin:jane-smith-1a2b" -> "jane-smith-1a2b". */
const accountOf = (item: ItemDTO) => (item.sourceKey.startsWith("linkedin:") ? item.sourceKey.slice("linkedin:".length) : null);
const vanityOf = (url: string | null | undefined) => url?.match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? null;

type LinkedInPerson = {
  key: string;
  name: string;
  headline: string | null;
  url: string | null;
  posts: number;
  lastPostAt: string | null;
  personId: number | null;
  profileId: number | null;
  matchedQuery: string | null;
  inNews: boolean;
};

/** Everyone on LinkedIn for this topic: who posted, people from the news with a profile, and people-search results. */
function linkedInPeople(data: ConsoleData, posts: ItemDTO[]): LinkedInPerson[] {
  const byKey = new Map<string, LinkedInPerson>();
  const upsert = (key: string, patch: Partial<LinkedInPerson> & { name: string }) => {
    const current = byKey.get(key);
    byKey.set(key, {
      key,
      headline: null,
      url: null,
      posts: 0,
      lastPostAt: null,
      personId: null,
      profileId: null,
      matchedQuery: null,
      inNews: false,
      ...current,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null && v !== undefined)),
    } as LinkedInPerson);
  };

  for (const post of posts) {
    const account = accountOf(post);
    if (!account) continue;
    const current = byKey.get(account);
    upsert(account, {
      name: post.author ?? current?.name ?? account,
      url: post.authorUrl ?? current?.url ?? null,
      posts: (current?.posts ?? 0) + 1,
      lastPostAt: !current?.lastPostAt || itemTime(post) > current.lastPostAt ? itemTime(post) : current.lastPostAt,
    });
  }
  for (const person of data.people) {
    const vanity = vanityOf(person.linkedinUrl);
    if (!vanity) continue;
    upsert(vanity, {
      name: person.name,
      headline: person.linkedinHeadline || [person.role, person.orgName].filter(Boolean).join(", ") || null,
      url: person.linkedinUrl,
      personId: person.id,
      inNews: person.voice,
    });
  }
  for (const profile of data.profiles) {
    upsert(profile.vanity, {
      name: profile.name,
      headline: profile.headline ?? byKey.get(profile.vanity)?.headline ?? null,
      url: profile.url,
      profileId: profile.id,
      matchedQuery: profile.matchedQuery,
    });
  }
  return [...byKey.values()].sort(
    (a, b) => b.posts - a.posts || Number(b.inNews) - Number(a.inNews) || (b.lastPostAt ?? "").localeCompare(a.lastPostAt ?? "") || a.name.localeCompare(b.name),
  );
}

function PostRow({ post, name, threshold, onAccount }: { post: ItemDTO; name?: string; threshold: number; onAccount: (account: string) => void }) {
  const ctl = useCtl();
  const account = accountOf(post);
  const tags = hashtagsIn(`${post.title} ${post.snippet ?? ""}`).slice(0, 6);
  const article = /linkedin\.com\/pulse\//i.test(post.href);
  // Google names the poster on some results only; another post from the same account may say who it is.
  const who = post.author ?? name ?? (account ? `@${account}` : null);
  return (
    <li className="row-cv border-b border-line last:border-0">
      <div className="group flex gap-3 px-4 py-3 hover:bg-panel-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
            <button
              type="button"
              onClick={() => account && onAccount(account)}
              className="inline-flex items-center gap-1.5 font-medium text-fg hover:text-accent"
              title={account ? "Show only this account's posts" : undefined}
            >
              <LinkedInIcon size={13} className="text-fg-3" /> {who ?? (article ? "LinkedIn article" : "LinkedIn post")}
            </button>
            <span className="text-fg-3">·</span>
            {post.publishedAt ? (
              <TimeAgo iso={post.publishedAt} className="text-fg-3" />
            ) : (
              <span className="text-fg-3" title="Google showed no date; this is when Radar found it">
                found <TimeAgo iso={post.collectedAt} />
              </span>
            )}
            {article && who ? <Badge>Article</Badge> : null}
            <RelevanceMeter value={post.relevance} threshold={threshold} />
          </div>
          <button type="button" onClick={() => ctl.open({ kind: "item", id: post.id })} className="mt-1 block text-left">
            <span className="block text-[14px] leading-snug font-medium text-fg group-hover:text-accent-strong">{post.title}</span>
            {post.snippet && post.snippet !== post.title ? (
              <span className="mt-1 line-clamp-3 block text-[13px] leading-relaxed text-fg-2">{post.snippet}</span>
            ) : null}
          </button>
          {tags.length ? (
            <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11px] text-fg-3">
              {tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
          ) : null}
        </div>
        <a
          href={post.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 inline-flex h-7 shrink-0 items-center gap-1 self-start rounded-md border border-line px-2 text-[12px] text-fg-2 hover:border-line-2 hover:text-fg"
          title="Open on LinkedIn"
        >
          Open <ArrowUpRight size={12} />
        </a>
      </div>
    </li>
  );
}

function PersonRow({ person, active, onAccount }: { person: LinkedInPerson; active: boolean; onAccount: (account: string) => void }) {
  const ctl = useCtl();
  const open = () => {
    if (person.posts) onAccount(person.key);
    else if (person.personId) ctl.open({ kind: "person", id: person.personId });
    else if (person.profileId) ctl.open({ kind: "profile", id: person.profileId });
  };
  return (
    <li className={`row-cv border-b border-line last:border-0 ${active ? "bg-accent-soft/60" : ""}`}>
      <div className="flex items-start gap-2 px-4 py-2.5 hover:bg-panel-2">
        <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13.5px] font-medium text-fg">{person.name}</span>
          {person.headline ? <span className="block truncate text-[12px] text-fg-2">{person.headline}</span> : null}
          <span className="mt-1 flex flex-wrap gap-1">
            {person.posts ? <Badge tone="accent">Posted {person.posts > 1 ? `${person.posts} times` : "once"}</Badge> : null}
            {person.inNews ? <Badge>In the news</Badge> : null}
            {person.matchedQuery ? (
              <Badge tone="outline" title="Their public profile matched this people search">
                Profile: {person.matchedQuery.replace(/^site:\S+\s*/, "")}
              </Badge>
            ) : null}
          </span>
        </button>
        {person.url ? (
          <a
            href={person.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-panel-3 hover:text-fg"
            aria-label={`${person.name} on LinkedIn`}
            title="Open their LinkedIn profile"
          >
            <LinkedInIcon size={15} />
          </a>
        ) : null}
      </div>
    </li>
  );
}

type PeopleFilter = "all" | "posting" | "news" | "search";

export function LinkedInView() {
  const data = useTopicData();
  const ctl = useCtl();
  const query = useDeferredValue(useConsole((s) => s.query).trim());
  const signalOnly = useConsole((s) => s.signalOnly && Boolean(s.payloads[s.topicId]?.totals.scored));
  const filtered = useFilteredItems(data);
  const [tag, setTag] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [pane, setPane] = useState<"posts" | "people">("posts");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>("all");

  const allPosts = useMemo(() => (data ? data.items.filter((i) => i.source === "linkedin").sort(byNewest) : []), [data]);
  const posts = useMemo(() => filtered.filter((i) => i.source === "linkedin").sort(byNewest), [filtered]);
  // Picking someone shows all their posts, whatever the time range and Signal filter.
  const base = useMemo(() => (account ? allPosts.filter((p) => accountOf(p) === account) : posts), [account, allPosts, posts]);
  const tags = useMemo(() => {
    const counts = new Map<string, { tag: string; n: number }>();
    for (const post of base) {
      for (const t of hashtagsIn(`${post.title} ${post.snippet ?? ""}`)) {
        const key = t.toLowerCase();
        counts.set(key, { tag: counts.get(key)?.tag ?? t, n: (counts.get(key)?.n ?? 0) + 1 });
      }
    }
    const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 10);
    // Keep the chosen hashtag on screen, so it can be cleared, even when no post here has it.
    return tag && !top.some((t) => t.tag.toLowerCase() === tag) ? [{ tag, n: 0 }, ...top] : top;
  }, [base, tag]);
  const shownPosts = useMemo(
    () => (tag ? base.filter((p) => hashtagsIn(`${p.title} ${p.snippet ?? ""}`).some((t) => t.toLowerCase() === tag)) : base),
    [base, tag],
  );
  const everyone = useMemo(() => (data ? linkedInPeople(data, allPosts) : []), [data, allPosts]);
  // Names worth showing for an account: not just its handle.
  const names = useMemo(() => new Map(everyone.filter((p) => p.name !== p.key).map((p) => [p.key, p.name])), [everyone]);
  const shownPeople = useMemo(
    () =>
      everyone.filter(
        (p) =>
          (peopleFilter === "all" ||
            (peopleFilter === "posting" && p.posts > 0) ||
            (peopleFilter === "news" && p.inNews) ||
            (peopleFilter === "search" && p.profileId !== null)) &&
          matches(query, p.name, p.headline, p.matchedQuery),
      ),
    [everyone, peopleFilter, query],
  );

  if (!data) {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Skeleton className="h-96 !rounded-xl" />
        <Skeleton className="h-96 !rounded-xl" />
      </div>
    );
  }

  if (!data.spend.serper.enabled) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Empty icon={Users} title="LinkedIn needs Serper">
          Radar finds public LinkedIn posts, hashtags and people through Google, using Serper. Add <code className="font-mono text-[12px]">SERPER_API_KEY</code>{" "}
          in the Vercel project settings and redeploy. Radar never logs in to LinkedIn.
        </Empty>
      </div>
    );
  }

  const selectAccount = (next: string) => {
    setAccount((current) => (current === next ? null : next));
    setTag(null);
    setPane("posts");
  };
  const accountName = account ? (everyone.find((p) => p.key === account)?.name ?? `@${account}`) : null;
  const nothingYet = !allPosts.length && !everyone.length;

  return (
    <div className="mx-auto max-w-[1440px] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <LinkedInIcon size={18} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <h2 className="text-[15px] font-semibold">LinkedIn</h2>
            <p className="text-[12px] text-fg-3">Public posts and profiles that Google has found. Searched once a day; Radar never logs in to LinkedIn.</p>
          </div>
        </div>
        <div className="lg:hidden">
          <Segmented
            label="Posts or people"
            value={pane}
            onChange={setPane}
            options={[
              { value: "posts", label: `Posts ${shownPosts.length}` },
              { value: "people", label: `People ${shownPeople.length}` },
            ]}
          />
        </div>
      </div>

      {nothingYet ? (
        <Empty
          icon={Search}
          title="No LinkedIn results yet"
          action={
            <Button variant="primary" icon={Play} onClick={() => ctl.run("collect")}>
              Search now
            </Button>
          }
        >
          The next collection searches LinkedIn posts, hashtags and people for this topic. Set the searches in Settings, under LinkedIn.
        </Empty>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className={`surface min-w-0 rounded-xl ${pane === "posts" ? "" : "max-lg:hidden"}`}>
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <h3 className="text-[13px] font-semibold">Posts</h3>
              <span className="font-mono text-[11px] text-fg-3">{shownPosts.length}</span>
              {accountName ? (
                <button
                  type="button"
                  onClick={() => setAccount(null)}
                  className="ml-1 inline-flex h-6 min-w-0 items-center gap-1 rounded-full bg-accent-soft px-2 text-[12px] text-accent"
                  title="Show everyone's posts again"
                >
                  <span className="truncate">All posts by {accountName}</span> <X size={12} className="shrink-0" />
                </button>
              ) : null}
            </header>
            {tags.length ? (
              <div className="scroll flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2">
                {tags.map((t) => {
                  const on = tag === t.tag.toLowerCase();
                  return (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => setTag(on ? null : t.tag.toLowerCase())}
                      aria-pressed={on}
                      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 font-mono text-[11px] ${
                        on ? "bg-accent-soft text-accent" : "border border-line text-fg-2 hover:text-fg"
                      }`}
                    >
                      <Hash size={10} />
                      {t.tag}
                      <span className="text-fg-3">{t.n}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {shownPosts.length ? (
              <ul>
                {shownPosts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    name={names.get(accountOf(post) ?? "")}
                    threshold={data.topic.config.relevanceThreshold}
                    onAccount={selectAccount}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-fg-3">
                {base.length
                  ? "No posts with this hashtag. Clear it to see the rest."
                  : signalOnly
                    ? "No posts in this time range. Widen it, or turn off Signal to see the posts Claude scored as off topic."
                    : "No posts in this time range. Widen it to see older posts."}
              </p>
            )}
          </section>

          <section className={`surface min-w-0 rounded-xl lg:sticky lg:top-3 ${pane === "people" ? "" : "max-lg:hidden"}`}>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-semibold">People</h3>
                <span className="font-mono text-[11px] text-fg-3">{shownPeople.length}</span>
              </div>
              <Segmented
                label="Which people"
                value={peopleFilter}
                onChange={setPeopleFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "posting", label: "Posting" },
                  { value: "news", label: "News" },
                  { value: "search", label: "Search" },
                ]}
              />
            </header>
            {shownPeople.length ? (
              <ul className="scroll lg:max-h-[calc(100dvh-230px)] lg:overflow-y-auto">
                {shownPeople.map((person) => (
                  <PersonRow key={person.key} person={person} active={person.key === account} onAccount={selectAccount} />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-fg-3">
                {peopleFilter === "search"
                  ? "People searches run once a week. Set them in Settings, under LinkedIn."
                  : peopleFilter === "news"
                    ? "People from the news are matched to their profiles a few at a time on each run."
                    : "No one here yet."}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
