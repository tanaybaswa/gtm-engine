"use client";

import { AtSign, Star, Users } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import type { OrgDTO, PersonDTO } from "@/lib/console/types";
import { KIND_LABELS, linkedinSearch, matches, RELATION_LABELS, RELATION_ORDER } from "../format";
import { LinkedInIcon } from "../icons";
import { useConsole, useCtl, useStore, useTopicData } from "../store";
import { Badge, Empty, Segmented, Skeleton, TimeAgo, Toggle } from "../ui";

export function Relations({ relations }: { relations: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(relations)
        .sort(([a], [b]) => RELATION_ORDER.indexOf(a) - RELATION_ORDER.indexOf(b))
        .map(([relation, n]) => (
          <Badge key={relation} tone={relation === "mentioned" || relation === "author" || relation === "publisher" ? "neutral" : "accent"}>
            {RELATION_LABELS[relation] ?? relation}
            {n > 1 ? <span className="font-mono opacity-70">{n}</span> : null}
          </Badge>
        ))}
    </div>
  );
}

export function WatchButton({ kind, id, watched }: { kind: "person" | "org"; id: number; watched: boolean }) {
  const ctl = useCtl();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void ctl.watch(kind, id, !watched);
      }}
      aria-pressed={watched}
      aria-label={watched ? "Stop watching" : "Watch"}
      title={watched ? "Watching: Claude always extracts them. Click to stop." : "Watch: Claude always extracts them"}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
        watched ? "text-accent" : "text-fg-3 hover:bg-panel-3 hover:text-fg"
      }`}
    >
      <Star size={14} fill={watched ? "currentColor" : "none"} />
    </button>
  );
}

type PeopleSort = "mentions" | "recent" | "name";

function sortPeople(list: PersonDTO[], sort: PeopleSort) {
  const out = [...list];
  if (sort === "recent") out.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  else if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  else out.sort((a, b) => b.mentions - a.mentions || b.lastSeenAt.localeCompare(a.lastSeenAt));
  return out;
}

function PeopleTable({ people }: { people: PersonDTO[] }) {
  const ctl = useCtl();
  if (!people.length) return null;
  return (
    <div className="surface overflow-hidden rounded-xl">
      <table className="w-full border-collapse text-[13px]">
        <thead className="border-b border-line text-left">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
            <th className="label w-8" />
            <th className="label">Name</th>
            <th className="label hidden md:table-cell">Role</th>
            <th className="label hidden lg:table-cell">Organization</th>
            <th className="label hidden xl:table-cell">Appears as</th>
            <th className="label text-right">Mentions</th>
            <th className="label hidden sm:table-cell">Last seen</th>
            <th className="label text-right">Find</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr
              key={p.id}
              onClick={() => ctl.open({ kind: "person", id: p.id })}
              className="row-cv cursor-pointer border-b border-line last:border-0 hover:bg-panel-2 [&>td]:px-3 [&>td]:py-2.5"
            >
              <td className="!pr-0">
                <WatchButton kind="person" id={p.id} watched={p.watched} />
              </td>
              <td>
                <div className="font-medium text-fg">{p.name}</div>
                <div className="truncate text-[12px] text-fg-3 lg:hidden">{[p.role, p.orgName].filter(Boolean).join(", ")}</div>
              </td>
              <td className="hidden max-w-[240px] truncate text-fg-2 md:table-cell">{p.role}</td>
              <td className="hidden max-w-[200px] truncate text-fg-2 lg:table-cell">{p.orgName}</td>
              <td className="hidden xl:table-cell">
                <Relations relations={p.relations} />
              </td>
              <td className="text-right font-mono text-fg tabular-nums">{p.mentions}</td>
              <td className="hidden text-fg-3 sm:table-cell">
                <TimeAgo iso={p.lastSeenAt} />
              </td>
              <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <a
                  href={p.linkedinUrl ?? linkedinSearch(p.name, p.orgName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-3 hover:bg-panel-3 hover:text-fg"
                  aria-label={`Find ${p.name} on LinkedIn`}
                  title="Find on LinkedIn"
                >
                  <LinkedInIcon size={14} />
                </a>
                {p.xHandle ? (
                  <a
                    href={`https://x.com/${p.xHandle.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-3 hover:bg-panel-3 hover:text-fg"
                    aria-label={`${p.name} on X`}
                    title="On X"
                  >
                    <AtSign size={14} />
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrgTable({ orgs }: { orgs: OrgDTO[] }) {
  const ctl = useCtl();
  if (!orgs.length) return null;
  return (
    <div className="surface overflow-hidden rounded-xl">
      <table className="w-full border-collapse text-[13px]">
        <thead className="border-b border-line text-left">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
            <th className="label w-8" />
            <th className="label">Organization</th>
            <th className="label hidden md:table-cell">Type</th>
            <th className="label hidden lg:table-cell">Appears as</th>
            <th className="label text-right">Mentions</th>
            <th className="label hidden sm:table-cell">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr
              key={o.id}
              onClick={() => ctl.open({ kind: "org", id: o.id })}
              className="row-cv cursor-pointer border-b border-line last:border-0 hover:bg-panel-2 [&>td]:px-3 [&>td]:py-2.5"
            >
              <td className="!pr-0">
                <WatchButton kind="org" id={o.id} watched={o.watched} />
              </td>
              <td className="font-medium text-fg">{o.name}</td>
              <td className="hidden text-fg-2 capitalize md:table-cell">{o.kind?.replaceAll("_", " ")}</td>
              <td className="hidden lg:table-cell">
                <Relations relations={o.relations} />
              </td>
              <td className="text-right font-mono tabular-nums">{o.mentions}</td>
              <td className="hidden text-fg-3 sm:table-cell">
                <TimeAgo iso={o.lastSeenAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PeopleView() {
  const data = useTopicData();
  const store = useStore();
  const tab = useConsole((s) => s.peopleTab);
  const showPassing = useConsole((s) => s.showPassing);
  const query = useDeferredValue(useConsole((s) => s.query).trim());
  const [sort, setSort] = useState<PeopleSort>("mentions");

  const people = useMemo(() => {
    if (!data) return [];
    const list = data.people.filter((p) => (showPassing || p.voice) && matches(query, p.name, p.role, p.orgName));
    return sortPeople(list, sort);
  }, [data, showPassing, query, sort]);
  const orgs = useMemo(() => (data ? data.orgs.filter((o) => matches(query, o.name, o.kind ? KIND_LABELS[o.kind] ?? o.kind : null)) : []), [data, query]);

  if (!data) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  }

  const hidden = data.people.filter((p) => !p.voice).length;
  return (
    <div className="mx-auto max-w-[1280px] space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="People or organizations"
          value={tab}
          onChange={(v) => store.set({ peopleTab: v })}
          options={[
            { value: "people", label: `People ${data.people.filter((p) => showPassing || p.voice).length}` },
            { value: "orgs", label: `Organizations ${data.orgs.length}` },
          ]}
        />
        {tab === "people" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Toggle
              checked={showPassing}
              onChange={(v) => store.set({ showPassing: v })}
              label={`Named in passing${hidden ? ` (${hidden})` : ""}`}
              hint="People only name-checked, not quoted, writing or posting"
            />
            <Segmented
              label="Sort people"
              value={sort}
              onChange={setSort}
              options={[
                { value: "mentions", label: "Mentions" },
                { value: "recent", label: "Recent" },
                { value: "name", label: "Name" },
              ]}
            />
          </div>
        ) : null}
      </div>
      {tab === "people" ? (
        people.length ? (
          <PeopleTable people={people} />
        ) : (
          <Empty icon={Users} title={query ? `No one matches "${query}"` : "No people yet"}>
            People are found when Claude scores items: who is quoted, who writes, who posts.
          </Empty>
        )
      ) : orgs.length ? (
        <OrgTable orgs={orgs} />
      ) : (
        <Empty icon={Users} title={query ? `No organization matches "${query}"` : "No organizations yet"} />
      )}
    </div>
  );
}
