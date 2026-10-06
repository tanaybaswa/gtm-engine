"use client";

import { ArrowUpRight, Check, Eye, Play, Plus, Search, Users, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import type { ConsoleData, ItemDTO, PersonDTO } from "@/lib/console/types";
import { byNewest, useFilteredItems } from "../derive";
import { matches } from "../format";
import { LinkedInIcon, YouTubeIcon } from "../icons";
import { useConsole, useCtl, useTopicData } from "../store";
import { Badge, Button, Empty, RelevanceMeter, Segmented, Skeleton, TimeAgo } from "../ui";

/** "https://www.youtube.com/watch?v=abc" -> "abc". */
export const videoIdOf = (item: Pick<ItemDTO, "href">) => item.href.match(/[?&]v=([\w-]{11})/)?.[1] ?? null;

/** 3944 -> "1:05:44"; 212 -> "3:32". */
export function formatDuration(seconds: number | undefined): string | null {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** 15553 -> "15.6K views". */
export function formatViews(views: number | undefined): string | null {
  if (views === undefined) return null;
  const short = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(views);
  return `${short} ${views === 1 ? "view" : "views"}`;
}

/** The YouTube player, as YouTube serves it: no-cookie embed, unmodified. */
export function VideoPlayer({ item }: { item: ItemDTO }) {
  const id = videoIdOf(item);
  if (!id) return null;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={item.title}
        className="h-full w-full"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}

/** Length, views and likes, as YouTube reported them at the last refresh. */
export function VideoStats({ item, className = "" }: { item: ItemDTO; className?: string }) {
  const e = item.engagement ?? {};
  const parts = [formatDuration(e.durationSec), formatViews(e.views), e.likes ? `${e.likes.toLocaleString()} likes` : null].filter(Boolean);
  if (!parts.length) return null;
  return <span className={`font-mono text-[11px] text-fg-3 tabular-nums ${className}`}>{parts.join(" · ")}</span>;
}

type Speaker = { person: PersonDTO; videos: number; itemIds: Set<number> };
type Channel = { key: string; name: string; videos: number; views: number; sourceId: number | null; followed: boolean };

/** Everyone named in a video as speaker, guest, author or poster, with how many videos. */
function speakersOf(data: ConsoleData, videos: ItemDTO[]): Speaker[] {
  const people = new Map(data.people.map((p) => [p.id, p]));
  const out = new Map<number, Speaker>();
  for (const video of videos) {
    for (const ref of video.people) {
      if (ref.relation === "mentioned") continue;
      const person = people.get(ref.id);
      if (!person) continue;
      const entry = out.get(ref.id) ?? { person, videos: 0, itemIds: new Set<number>() };
      if (!entry.itemIds.has(video.id)) {
        entry.itemIds.add(video.id);
        entry.videos += 1;
      }
      out.set(ref.id, entry);
    }
  }
  return [...out.values()].sort((a, b) => b.videos - a.videos || Number(b.person.watched) - Number(a.person.watched) || a.person.name.localeCompare(b.person.name));
}

function channelsOf(data: ConsoleData, videos: ItemDTO[]): Channel[] {
  const sources = new Map(data.sources.map((s) => [s.key, s]));
  const out = new Map<string, Channel>();
  for (const video of videos) {
    const source = sources.get(video.sourceKey);
    const entry = out.get(video.sourceKey) ?? {
      key: video.sourceKey,
      name: video.outlet ?? source?.name ?? video.sourceKey,
      videos: 0,
      views: 0,
      sourceId: source?.id ?? null,
      followed: source?.followed ?? false,
    };
    entry.videos += 1;
    entry.views += video.engagement?.views ?? 0;
    out.set(video.sourceKey, entry);
  }
  return [...out.values()].sort((a, b) => Number(b.followed) - Number(a.followed) || b.videos - a.videos || b.views - a.views);
}

function VideoRow({ video, threshold, onChannel }: { video: ItemDTO; threshold: number; onChannel: (key: string) => void }) {
  const ctl = useCtl();
  const id = videoIdOf(video);
  const duration = formatDuration(video.engagement?.durationSec);
  const speakers = video.people.filter((p) => p.relation !== "mentioned").slice(0, 4);
  const open = () => ctl.open({ kind: "item", id: video.id });
  return (
    <li className="row-cv border-b border-line last:border-0">
      <div className="group flex flex-col gap-3 px-4 py-3 hover:bg-panel-2 sm:flex-row">
        <button type="button" onClick={open} className="relative w-full shrink-0 self-start overflow-hidden rounded-md bg-panel-3 sm:w-[168px]" aria-label={`Watch: ${video.title}`}>
          {id ? (
            // eslint-disable-next-line @next/next/no-img-element -- YouTube serves the thumbnails; nothing to optimize.
            <img
              src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`}
              alt=""
              loading="lazy"
              className="aspect-video w-full object-cover"
              // A missing thumbnail leaves the plain frame rather than a broken image.
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          ) : (
            <span className="block aspect-video" />
          )}
          {duration ? (
            <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 font-mono text-[10.5px] text-white tabular-nums">{duration}</span>
          ) : null}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/25 group-hover:opacity-100">
            <Play size={22} className="fill-white" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
            <button type="button" onClick={() => onChannel(video.sourceKey)} className="font-medium text-fg-2 hover:text-fg" title="Show only this channel">
              {video.outlet ?? "YouTube"}
            </button>
            <span className="text-fg-3">·</span>
            <TimeAgo iso={video.publishedAt ?? video.collectedAt} className="text-fg-3" />
            {video.engagement?.views !== undefined ? (
              <span className="inline-flex items-center gap-1 text-fg-3">
                <Eye size={12} /> {formatViews(video.engagement.views)?.replace(/ views?$/, "")}
              </span>
            ) : null}
            <RelevanceMeter value={video.relevance} threshold={threshold} />
          </div>
          <button type="button" onClick={open} className="mt-1 block text-left">
            <span className="line-clamp-2 text-[14px] leading-snug font-medium text-fg decoration-fg-3/40 underline-offset-[3px] group-hover:underline">{video.title}</span>
            {video.gist || video.snippet ? <span className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-fg-2">{video.gist ?? video.snippet}</span> : null}
          </button>
          {speakers.length ? (
            <div className="mt-1.5 flex items-center gap-1 truncate text-[12px] text-people">
              <Users size={12} className="shrink-0" />
              <span className="truncate">{speakers.map((p) => p.name).join(", ")}</span>
            </div>
          ) : null}
        </div>
        <a
          href={video.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 hidden h-7 shrink-0 items-center gap-1 self-start rounded-md border border-line px-2 text-[12px] text-fg-2 hover:border-line-2 hover:text-fg sm:inline-flex"
          title="Watch on YouTube"
        >
          YouTube <ArrowUpRight size={12} />
        </a>
      </div>
    </li>
  );
}

function SpeakerRow({ speaker, active, onPick }: { speaker: Speaker; active: boolean; onPick: () => void }) {
  const { person } = speaker;
  return (
    <li className={`row-cv border-b border-line last:border-0 ${active ? "bg-people-soft" : ""}`}>
      <div className="flex items-start gap-2 px-4 py-2.5 hover:bg-panel-2">
        <button type="button" onClick={onPick} className="min-w-0 flex-1 text-left" title="Show only their videos">
          <span className="block truncate text-[13.5px] font-medium text-people">{person.name}</span>
          {person.role || person.orgName ? <span className="block truncate text-[12px] text-fg-2">{[person.role, person.orgName].filter(Boolean).join(", ")}</span> : null}
          <span className="mt-1 flex flex-wrap gap-1">
            <Badge tone="people">{speaker.videos > 1 ? `${speaker.videos} videos` : "1 video"}</Badge>
            {person.watched ? <Badge tone="warn">Watched</Badge> : null}
          </span>
        </button>
        {person.linkedinUrl ? (
          <a
            href={person.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-panel-3 hover:text-fg"
            aria-label={`${person.name} on LinkedIn`}
            title="Their LinkedIn profile"
          >
            <LinkedInIcon size={15} />
          </a>
        ) : null}
      </div>
    </li>
  );
}

function ChannelRow({ channel, active, onPick }: { channel: Channel; active: boolean; onPick: () => void }) {
  const ctl = useCtl();
  const [busy, setBusy] = useState(false);
  return (
    <li className={`row-cv border-b border-line last:border-0 ${active ? "bg-panel-3" : ""}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-panel-2">
        <button type="button" onClick={onPick} className="min-w-0 flex-1 text-left" title="Show only this channel">
          <span className="block truncate text-[13.5px] font-medium text-fg">{channel.name}</span>
          <span className="block font-mono text-[11px] text-fg-3">
            {channel.videos} {channel.videos === 1 ? "video" : "videos"}
            {channel.views ? ` · ${formatViews(channel.views)}` : ""}
          </span>
        </button>
        {channel.sourceId !== null ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await ctl.follow(channel.sourceId!, !channel.followed);
              setBusy(false);
            }}
            className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors disabled:opacity-60 ${
              channel.followed ? "bg-accent-soft text-fg hover:ring-1 hover:ring-line-2" : "border border-line text-fg-2 hover:border-line-2 hover:text-fg"
            }`}
            title={channel.followed ? "Radar checks this channel on every run. Click to stop." : "Check this channel for new videos on every run"}
          >
            {channel.followed ? <Check size={12} /> : <Plus size={12} />}
            {busy ? "..." : channel.followed ? "Following" : "Follow"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

type Sort = "new" | "views";

export function YouTubeView() {
  const data = useTopicData();
  const ctl = useCtl();
  const query = useDeferredValue(useConsole((s) => s.query).trim());
  const signalOnly = useConsole((s) => s.signalOnly && Boolean(s.payloads[s.topicId]?.totals.scored));
  const filtered = useFilteredItems(data);
  const [sort, setSort] = useState<Sort>("new");
  const [channel, setChannel] = useState<string | null>(null);
  const [speaker, setSpeaker] = useState<number | null>(null);
  const [side, setSide] = useState<"speakers" | "channels">("speakers");
  const [pane, setPane] = useState<"videos" | "side">("videos");

  const allVideos = useMemo(() => (data ? data.items.filter((i) => i.source === "youtube").sort(byNewest) : []), [data]);
  const inRange = useMemo(() => filtered.filter((i) => i.source === "youtube"), [filtered]);
  const speakers = useMemo(() => (data ? speakersOf(data, allVideos) : []), [data, allVideos]);
  const channels = useMemo(() => (data ? channelsOf(data, allVideos) : []), [data, allVideos]);
  const picked = speaker !== null ? speakers.find((s) => s.person.id === speaker) : undefined;
  // Picking a channel or a speaker shows all of their videos, whatever the time range and Signal filter.
  const videos = useMemo(() => {
    const base = channel ? allVideos.filter((v) => v.sourceKey === channel) : picked ? allVideos.filter((v) => picked.itemIds.has(v.id)) : inRange;
    return sort === "views" ? [...base].sort((a, b) => (b.engagement?.views ?? 0) - (a.engagement?.views ?? 0)) : base;
  }, [allVideos, inRange, channel, picked, sort]);
  const shownSpeakers = useMemo(
    () => speakers.filter((s) => matches(query, s.person.name, s.person.role, s.person.orgName)),
    [speakers, query],
  );
  const shownChannels = useMemo(() => channels.filter((c) => matches(query, c.name)), [channels, query]);

  if (!data) {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton className="h-96 !rounded-xl" />
        <Skeleton className="h-96 !rounded-xl" />
      </div>
    );
  }

  if (!data.spend.youtube.enabled) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Empty icon={YouTubeIcon} title="YouTube needs a key">
          Create a free YouTube Data API key in Google Cloud (enable &quot;YouTube Data API v3&quot;, then create an API key), add it as{" "}
          <code className="font-mono text-[12px]">YOUTUBE_API_KEY</code> in the Vercel project settings, and redeploy. It costs nothing.
        </Empty>
      </div>
    );
  }

  const channelName = channel ? (channels.find((c) => c.key === channel)?.name ?? "this channel") : null;
  const capReached = data.spend.youtube.searchesToday >= data.spend.youtube.cap;
  const pickChannel = (key: string) => {
    setChannel((current) => (current === key ? null : key));
    setSpeaker(null);
    setPane("videos");
  };
  const pickSpeaker = (id: number) => {
    setSpeaker((current) => (current === id ? null : id));
    setChannel(null);
    setPane("videos");
  };

  return (
    <div className="mx-auto max-w-[1440px] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <YouTubeIcon size={18} className="mt-0.5 shrink-0 text-fg" />
          <div>
            <h2 className="text-[15px] font-semibold">YouTube</h2>
            <p className="text-[12px] text-fg-3">
              Webinars, talks, podcasts and demos from YouTube searches and the channels you follow. Searched up to once a day; Shorts are skipped.
            </p>
            {capReached ? (
              <p className="mt-1 text-[12px] text-warn">
                Today&apos;s {data.spend.youtube.cap} YouTube searches are used up. Searching resumes tomorrow; followed channels still update.
              </p>
            ) : null}
          </div>
        </div>
        <div className="lg:hidden">
          <Segmented
            label="Videos or people"
            value={pane}
            onChange={setPane}
            options={[
              { value: "videos", label: `Videos ${videos.length}` },
              { value: "side", label: `Speakers ${speakers.length}` },
            ]}
          />
        </div>
      </div>

      {!allVideos.length ? (
        <Empty
          icon={Search}
          title="No videos yet"
          action={
            <Button variant="primary" icon={Play} onClick={() => ctl.run("collect")}>
              Search now
            </Button>
          }
        >
          The next collection searches YouTube and checks the channels this topic follows. Set both in Settings, under YouTube.
        </Empty>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className={`surface min-w-0 rounded-xl ${pane === "videos" ? "" : "max-lg:hidden"}`}>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="text-[13px] font-semibold">Videos</h3>
                <span className="font-mono text-[11px] text-fg-3">{videos.length}</span>
                {channelName || picked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setChannel(null);
                      setSpeaker(null);
                    }}
                    className={`ml-1 inline-flex h-6 min-w-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium ${
                      picked ? "bg-people-soft text-people" : "bg-accent-soft text-fg"
                    }`}
                    title="Show all videos again"
                  >
                    <span className="truncate">All videos {picked ? `with ${picked.person.name}` : `from ${channelName}`}</span>
                    <X size={12} className="shrink-0" />
                  </button>
                ) : null}
              </div>
              <Segmented
                label="Sort videos"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "new", label: "Newest" },
                  { value: "views", label: "Most viewed" },
                ]}
              />
            </header>
            {videos.length ? (
              <ul>
                {videos.map((video) => (
                  <VideoRow key={video.id} video={video} threshold={data.topic.config.relevanceThreshold} onChannel={pickChannel} />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-fg-3">
                {signalOnly
                  ? "No videos in this time range. Widen it, or turn off Signal to see the ones Claude scored as off topic."
                  : "No videos in this time range. Widen it to see older ones."}
              </p>
            )}
          </section>

          <section className={`surface min-w-0 rounded-xl lg:sticky lg:top-3 ${pane === "side" ? "" : "max-lg:hidden"}`}>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <h3 className="text-[13px] font-semibold">{side === "speakers" ? "People in these videos" : "Channels"}</h3>
              <Segmented
                label="Speakers or channels"
                value={side}
                onChange={setSide}
                options={[
                  { value: "speakers", label: `Speakers ${speakers.length}` },
                  { value: "channels", label: `Channels ${channels.length}` },
                ]}
              />
            </header>
            {side === "speakers" ? (
              shownSpeakers.length ? (
                <ul className="scroll lg:max-h-[calc(100dvh-230px)] lg:overflow-y-auto">
                  {shownSpeakers.map((s) => (
                    <SpeakerRow key={s.person.id} speaker={s} active={s.person.id === speaker} onPick={() => pickSpeaker(s.person.id)} />
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-8 text-center text-[13px] text-fg-3">
                  Claude names the hosts, guests and panelists when it scores new videos. They show here, and their LinkedIn profiles are looked up.
                </p>
              )
            ) : shownChannels.length ? (
              <ul className="scroll lg:max-h-[calc(100dvh-230px)] lg:overflow-y-auto">
                {shownChannels.map((c) => (
                  <ChannelRow key={c.key} channel={c} active={c.key === channel} onPick={() => pickChannel(c.key)} />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-fg-3">No channels match.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
