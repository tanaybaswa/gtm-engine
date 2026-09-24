import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemRow } from "@/components/items";
import { Badge, Card, ExternalLink, PageHeader, timeAgo } from "@/components/ui";
import { getOrg } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function OrgPage({ params }: PageProps<"/orgs/[id]">) {
  const { id } = await params;
  const data = await getOrg(Number(id));
  if (!data) notFound();
  const { org, mentions, colleagues } = data;

  return (
    <div>
      <Link href="/people?view=orgs" className="text-sm text-zinc-500 hover:underline">
        Organizations
      </Link>
      <PageHeader
        title={org.name}
        subtitle={
          <>
            {org.kind?.replaceAll("_", " ") ?? "organization"} · {org.mentionCount} mention{org.mentionCount === 1 ? "" : "s"} · last seen{" "}
            {timeAgo(org.lastSeenAt)}
          </>
        }
        actions={
          <ExternalLink href={`https://www.google.com/search?q=${encodeURIComponent(org.name)}`} className="text-sm">
            Google
          </ExternalLink>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <h2 className="mb-1 font-semibold">Mentions</h2>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {mentions.map(({ mention, item }) => (
              <ItemRow key={mention.id} item={item} label={<Badge tone="indigo">{mention.relation}</Badge>} />
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-sm font-semibold">People here</h2>
          {colleagues.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {colleagues.map((p) => (
                <li key={p.id}>
                  <Link href={`/people/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.role ? <div className="text-xs text-zinc-500">{p.role}</div> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No one from here has been quoted yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
