import Link from "next/link";
import { notFound } from "next/navigation";
import { itemHref } from "@/components/items";
import { Badge, Card, ExternalLink, formatDate, PageHeader, timeAgo } from "@/components/ui";
import { getPerson } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const data = await getPerson(Number(id));
  if (!data) notFound();
  const { person, mentions } = data;
  const search = encodeURIComponent([person.name, person.orgName].filter(Boolean).join(" "));

  return (
    <div>
      <Link href="/people" className="text-sm text-zinc-500 hover:underline">
        People
      </Link>
      <PageHeader
        title={person.name}
        subtitle={
          <>
            {[person.role, person.orgName].filter(Boolean).join(", ") || "Role unknown"} · {person.mentionCount} mention
            {person.mentionCount === 1 ? "" : "s"} · first seen {timeAgo(person.firstSeenAt)}
          </>
        }
        actions={
          <div className="flex gap-3 text-sm">
            <ExternalLink href={person.linkedinUrl ?? `https://www.linkedin.com/search/results/all/?keywords=${search}`}>LinkedIn</ExternalLink>
            {person.xHandle ? <ExternalLink href={`https://x.com/${person.xHandle.replace(/^@/, "")}`}>X</ExternalLink> : null}
            <ExternalLink href={`https://www.google.com/search?q=${search}`}>Google</ExternalLink>
          </div>
        }
      />
      <Card>
        <h2 className="mb-2 font-semibold">Where they showed up</h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {mentions.map(({ mention, item }) => (
            <li key={mention.id} className="py-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                <Badge tone={mention.relation === "quoted" || mention.relation === "author" || mention.relation === "poster" ? "indigo" : "neutral"}>
                  {mention.relation}
                </Badge>
                {item.isOrigin ? <Badge tone="green">Origin</Badge> : null}
                <span>{item.outlet ?? item.sourceKey}</span>
                <span aria-hidden>·</span>
                <span>{formatDate(item.publishedAt ?? item.collectedAt)}</span>
                {mention.role || mention.orgName ? (
                  <span>· as {[mention.role, mention.orgName].filter(Boolean).join(", ")}</span>
                ) : null}
              </div>
              <ExternalLink href={itemHref(item)} className="mt-1 block font-medium break-anywhere">
                {item.title}
              </ExternalLink>
              {mention.quote ? (
                <blockquote className="mt-2 border-l-2 border-indigo-300 pl-3 text-sm text-zinc-700 italic dark:border-indigo-700 dark:text-zinc-300">
                  &ldquo;{mention.quote}&rdquo;
                </blockquote>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
