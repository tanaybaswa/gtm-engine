import { toggleFollow } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, EmptyState, ExternalLink, PageHeader, TableWrap, Td, Th, timeAgo } from "@/components/ui";
import type { Source, Topic } from "@/db/schema";
import { listSources } from "@/lib/queries";
import { getDefaultTopic } from "@/lib/topics/store";
import { domainOf } from "@/lib/url";

export const dynamic = "force-dynamic";

/** A source counts as followed when the topic already collects from it directly. */
function followState(s: Source, topic: Topic | undefined): { followed: boolean; feedUrl: string | null } {
  if (!topic) return { followed: s.followed, feedUrl: s.feedUrl };
  const { feeds, queries } = topic.config;
  if (s.key.startsWith("x:@")) {
    const handle = s.key.slice(3);
    return { followed: s.followed || queries.x.accounts.some((h) => h.toLowerCase().replace(/^@/, "") === handle), feedUrl: null };
  }
  if (s.key.startsWith("reddit:r/")) {
    const sub = s.key.slice(9);
    return { followed: s.followed || queries.reddit.subreddits.some((r) => r.toLowerCase() === sub), feedUrl: null };
  }
  const feed = feeds.find((f) => f.url === s.feedUrl || domainOf(f.url) === s.key);
  return { followed: s.followed || Boolean(feed), feedUrl: feed?.url ?? s.feedUrl };
}

function sourceLink(key: string, homepage: string | null): string | null {
  if (homepage) return homepage;
  if (key.startsWith("x:@")) return `https://x.com/${key.slice(3)}`;
  if (key.startsWith("reddit:r/")) return `https://www.reddit.com/r/${key.slice(9)}/`;
  if (key.startsWith("linkedin:")) return `https://www.linkedin.com/in/${key.slice(9)}`;
  if (!key.includes(":")) return `https://${key}`;
  return null;
}

export default async function SourcesPage({ searchParams }: PageProps<"/sources">) {
  const params = await searchParams;
  const followedOnly = params.followed === "1";
  const [topic, all] = await Promise.all([getDefaultTopic(), listSources()]);
  const rows = all
    .map((s) => ({ ...s, ...followState(s, topic) }))
    .filter((s) => !followedOnly || s.followed);

  return (
    <div>
      <PageHeader
        title="Sources"
        subtitle="Where relevant stories come from, ranked by how often a source is the origin rather than an echo. Follow one to collect from it directly."
        actions={
          <a
            href={followedOnly ? "/sources" : "/sources?followed=1"}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
          >
            {followedOnly ? "Show all" : "Show followed"}
          </a>
        }
      />
      <Card>
        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Type</Th>
                <Th className="text-right">Items</Th>
                <Th className="text-right">Relevant</Th>
                <Th className="text-right">Origin</Th>
                <Th>Last seen</Th>
                <Th>Feed</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const link = sourceLink(s.key, s.homepage);
                const rate = s.relevantCount ? Math.round((s.originCount / s.relevantCount) * 100) : null;
                return (
                  <tr key={s.id}>
                    <Td className="max-w-[260px]">
                      <div className="font-medium break-anywhere">{link ? <ExternalLink href={link}>{s.name}</ExternalLink> : s.name}</div>
                      {s.name !== s.key ? <div className="text-xs text-zinc-500 break-anywhere">{s.key}</div> : null}
                    </Td>
                    <Td className="text-zinc-600 dark:text-zinc-400">{s.kind.replaceAll("_", " ")}</Td>
                    <Td className="text-right tabular-nums">{s.itemCount}</Td>
                    <Td className="text-right tabular-nums">{s.relevantCount}</Td>
                    <Td className="text-right tabular-nums">
                      {s.originCount}
                      {rate !== null ? <span className="ml-1 text-xs text-zinc-500">({rate}%)</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap text-zinc-500">{timeAgo(s.lastSeenAt)}</Td>
                    <Td>
                      {s.feedUrl ? (
                        <ExternalLink href={s.feedUrl}>feed</ExternalLink>
                      ) : s.followed && !s.key.includes(":") ? (
                        <Badge tone="amber" title="No RSS or Atom feed was found on this site">
                          none found
                        </Badge>
                      ) : null}
                    </Td>
                    <Td>
                      {topic ? (
                        <form action={toggleFollow}>
                          <input type="hidden" name="sourceId" value={s.id} />
                          <input type="hidden" name="topicId" value={topic.id} />
                          <input type="hidden" name="follow" value={String(!s.followed)} />
                          <SubmitButton variant={s.followed ? "secondary" : "subtle"} pendingText="...">
                            {s.followed ? "Following" : "Follow"}
                          </SubmitButton>
                        </form>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState title={followedOnly ? "You aren't following any sources yet." : "No sources yet."}>Run a collection first.</EmptyState>
        )}
      </Card>
    </div>
  );
}
