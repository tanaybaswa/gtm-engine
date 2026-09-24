import Link from "next/link";
import { toggleWatch } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, ExternalLink, PageHeader, TableWrap, Td, Th, timeAgo } from "@/components/ui";
import { listOrgs, listPeople, type PeopleSort } from "@/lib/queries";

export const dynamic = "force-dynamic";

function linkedinSearch(name: string, org: string | null): string {
  return `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent([name, org].filter(Boolean).join(" "))}`;
}

function WatchButton({ kind, id, watched }: { kind: "person" | "org"; id: number; watched: boolean }) {
  return (
    <form action={toggleWatch}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="watched" value={String(!watched)} />
      <SubmitButton variant={watched ? "secondary" : "subtle"} pendingText="...">
        {watched ? "Watching" : "Watch"}
      </SubmitButton>
    </form>
  );
}

export default async function PeoplePage({ searchParams }: PageProps<"/people">) {
  const params = await searchParams;
  const view = params.view === "orgs" ? "orgs" : "people";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const sort = (["mentions", "recent", "name"] as const).includes(params.sort as PeopleSort) ? (params.sort as PeopleSort) : "mentions";
  const watchedOnly = params.watched === "1";

  const tab = (value: "people" | "orgs", label: string) => (
    <Link
      href={value === "orgs" ? "/people?view=orgs" : "/people"}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        view === value ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="People"
        subtitle="Everyone behind the conversation: who is quoted, who writes, who posts. Found automatically from scored items."
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {tab("people", "People")}
          {tab("orgs", "Organizations")}
        </div>
        <form className="flex flex-wrap gap-2" action="/people">
          {view === "orgs" ? <input type="hidden" name="view" value="orgs" /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder={view === "orgs" ? "Search organizations" : "Search name, role or company"}
            className="w-56 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {view === "people" ? (
            <>
              <select
                name="sort"
                defaultValue={sort}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="mentions">Most mentioned</option>
                <option value="recent">Most recent</option>
                <option value="name">Name</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="watched" value="1" defaultChecked={watchedOnly} /> Watching
              </label>
            </>
          ) : null}
          <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">Filter</button>
        </form>
      </div>

      <Card>{view === "people" ? <PeopleTable q={q} sort={sort} watchedOnly={watchedOnly} /> : <OrgTable q={q} />}</Card>
    </div>
  );
}

async function PeopleTable({ q, sort, watchedOnly }: { q: string; sort: PeopleSort; watchedOnly: boolean }) {
  const rows = await listPeople({ q, sort, watchedOnly });
  if (!rows.length) {
    return (
      <EmptyState title={q ? `No one matches "${q}".` : "No people yet."}>
        People are extracted when items are scored, which needs <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>.
      </EmptyState>
    );
  }
  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>Role</Th>
          <Th>Organization</Th>
          <Th className="text-right">Mentions</Th>
          <Th>Last seen</Th>
          <Th>Find them</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <Td>
              <Link href={`/people/${p.id}`} className="font-medium hover:underline">
                {p.name}
              </Link>
              {p.watched ? (
                <span className="ml-1.5">
                  <Badge tone="indigo">watching</Badge>
                </span>
              ) : null}
            </Td>
            <Td className="text-zinc-600 dark:text-zinc-400">{p.role ?? ""}</Td>
            <Td className="text-zinc-600 dark:text-zinc-400">{p.orgName ?? ""}</Td>
            <Td className="text-right tabular-nums">{p.mentionCount}</Td>
            <Td className="whitespace-nowrap text-zinc-500">{timeAgo(p.lastSeenAt)}</Td>
            <Td className="whitespace-nowrap">
              <ExternalLink href={p.linkedinUrl ?? linkedinSearch(p.name, p.orgName)}>LinkedIn</ExternalLink>
              {p.xHandle ? (
                <>
                  {" · "}
                  <ExternalLink href={`https://x.com/${p.xHandle.replace(/^@/, "")}`}>X</ExternalLink>
                </>
              ) : null}
            </Td>
            <Td>
              <WatchButton kind="person" id={p.id} watched={p.watched} />
            </Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

async function OrgTable({ q }: { q: string }) {
  const rows = await listOrgs({ q });
  if (!rows.length) return <EmptyState title={q ? `No organization matches "${q}".` : "No organizations yet."} />;
  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>Organization</Th>
          <Th>Type</Th>
          <Th className="text-right">Mentions</Th>
          <Th>Last seen</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id}>
            <Td>
              <Link href={`/orgs/${o.id}`} className="font-medium hover:underline">
                {o.name}
              </Link>
            </Td>
            <Td className="text-zinc-600 dark:text-zinc-400">{o.kind?.replaceAll("_", " ") ?? ""}</Td>
            <Td className="text-right tabular-nums">{o.mentionCount}</Td>
            <Td className="whitespace-nowrap text-zinc-500">{timeAgo(o.lastSeenAt)}</Td>
            <Td>
              <WatchButton kind="org" id={o.id} watched={o.watched} />
            </Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
