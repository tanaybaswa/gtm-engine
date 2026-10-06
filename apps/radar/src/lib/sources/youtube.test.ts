import { describe, expect, it } from "vitest";
import { channelFeed, cleanDescription, durationSeconds, isShort, looksEnglish, parseChannel, videoItem, type YouTubeVideo } from "./youtube";

// Shaped like the YouTube Data API's videos.list answers, from a real search for this topic.
const podcast: YouTubeVideo = {
  id: "9IT1CwuI4Vo",
  snippet: {
    publishedAt: "2026-07-10T12:00:00Z",
    channelId: "UCzTi0B_BHft1O4hmM8_ehoQ",
    channelTitle: "The InsurTech Geek Podcast",
    title: "AI Liability, Insurtech Innovation & The Future of Reinsurance | Freddie Scarratt - Ep",
    description:
      "Freddie Scarratt, Global Deputy Head of InsurTech at Gallagher Re, joins hosts James Benham and Rob Galbraith to explore AI liability.\n\nhttps://example.com/episode\n#InsurTech #AI\n\nIn this episode:\n• Why AI-focused insurtechs raised 95% of funding",
    liveBroadcastContent: "none",
  },
  contentDetails: { duration: "PT35M32S" },
  statistics: { viewCount: "177", likeCount: "3", commentCount: "0" },
};

describe("youtube videos", () => {
  it("reads YouTube's ISO 8601 lengths", () => {
    expect(durationSeconds("PT1H5M44S")).toBe(3944);
    expect(durationSeconds("PT35M32S")).toBe(2132);
    expect(durationSeconds("PT1M5S")).toBe(65);
    expect(durationSeconds("P1DT2H")).toBe(93_600);
    expect(durationSeconds("P0D")).toBe(0);
    expect(durationSeconds(undefined)).toBeNull();
    expect(durationSeconds("soon")).toBeNull();
  });

  it("skips Shorts, but not live streams with no length", () => {
    const short = { ...podcast, snippet: { ...podcast.snippet!, title: "AI Insurance Fails #shorts" } };
    expect(isShort(podcast, 2132)).toBe(false);
    expect(isShort(podcast, 45)).toBe(true);
    expect(isShort(podcast, 61)).toBe(false);
    expect(isShort(podcast, 0)).toBe(false);
    expect(isShort(short, 300)).toBe(true);
  });

  it("keeps a description's words and drops its link and hashtag lines", () => {
    expect(cleanDescription(podcast.snippet!.description)).toBe(
      "Freddie Scarratt, Global Deputy Head of InsurTech at Gallagher Re, joins hosts James Benham and Rob Galbraith to explore AI liability.\nIn this episode:\n• Why AI-focused insurtechs raised 95% of funding",
    );
    expect(cleanDescription(undefined)).toBe("");
  });

  it("turns a video into an item with its channel as the source", () => {
    const item = videoItem(podcast, '"AI liability" insurance', false, 1_000);
    expect(item).toMatchObject({
      source: "youtube",
      externalId: "9IT1CwuI4Vo",
      url: "https://www.youtube.com/watch?v=9IT1CwuI4Vo",
      outlet: "The InsurTech Geek Podcast",
      sourceKey: "youtube:UCzTi0B_BHft1O4hmM8_ehoQ",
      sourceKind: "video",
      matchedQuery: '"AI liability" insurance',
      applyKeywordFilter: false,
      engagement: { views: 177, likes: 3, comments: 0, durationSec: 2132, refreshedAt: 1_000 },
    });
    expect(item?.publishedAt?.toISOString()).toBe("2026-07-10T12:00:00.000Z");
    expect(videoItem({ ...podcast, contentDetails: { duration: "PT50S" } }, "q", false)).toBeNull();
    expect(videoItem({ ...podcast, snippet: { ...podcast.snippet!, liveBroadcastContent: "upcoming" } }, "q", false)).toBeNull();
    // Hidden counts stay out rather than reading as zero.
    expect(videoItem({ ...podcast, statistics: { viewCount: "12" } }, "q", false)?.engagement).toEqual({ views: 12, durationSec: 2132, refreshedAt: expect.any(Number) });
  });
});

describe("youtube language", () => {
  const titled = (title: string, extra: Partial<NonNullable<YouTubeVideo["snippet"]>> = {}): YouTubeVideo => ({ ...podcast, snippet: { ...podcast.snippet!, title, ...extra } });
  it("trusts the language a video declares, and the title's alphabet otherwise", () => {
    expect(looksEnglish(podcast)).toBe(true);
    expect(looksEnglish(titled("AI가 $500,000를 잘못 송금했다면? AI Agent 시대, 누가 책임질까"))).toBe(false);
    expect(looksEnglish(titled("Who pays when AI fails?", { defaultAudioLanguage: "en-GB" }))).toBe(true);
    expect(looksEnglish(titled("Responsabilidad de la IA", { defaultAudioLanguage: "es" }))).toBe(false);
    expect(looksEnglish(titled("AI liability explained", { defaultAudioLanguage: "zxx" }))).toBe(true);
    expect(looksEnglish(titled("12345"))).toBe(true);
  });
});

describe("youtube channels", () => {
  it("understands the ways people paste a channel", () => {
    expect(parseChannel("UCzTi0B_BHft1O4hmM8_ehoQ")).toEqual({ id: "UCzTi0B_BHft1O4hmM8_ehoQ" });
    expect(parseChannel("https://www.youtube.com/channel/UCzTi0B_BHft1O4hmM8_ehoQ/videos")).toEqual({ id: "UCzTi0B_BHft1O4hmM8_ehoQ" });
    expect(parseChannel("@AgeOfTheMGA")).toEqual({ handle: "AgeOfTheMGA" });
    expect(parseChannel("https://www.youtube.com/@insurtechinsights/featured")).toEqual({ handle: "insurtechinsights" });
    expect(parseChannel("https://www.youtube.com/user/GoogleDevelopers")).toEqual({ username: "GoogleDevelopers" });
    expect(parseChannel("Insurtech Insights")).toBeNull();
  });

  it("reads a channel's public feed, marking Shorts", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>Age of the MGA &amp; Friends</title>
 <entry>
  <id>yt:video:jUKgY8cqdWo</id>
  <yt:videoId>jUKgY8cqdWo</yt:videoId>
  <title>AI Liability Isn't Just Cyber</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=jUKgY8cqdWo"/>
  <published>2026-10-02T15:00:00+00:00</published>
 </entry>
 <entry>
  <yt:videoId>8Xv5BLnXzgI</yt:videoId>
  <title>A short one</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/8Xv5BLnXzgI"/>
  <published>2026-10-01T23:00:21+00:00</published>
 </entry>
</feed>`;
    expect(channelFeed(xml)).toEqual({
      title: "Age of the MGA & Friends",
      videos: [
        { id: "jUKgY8cqdWo", published: new Date("2026-10-02T15:00:00Z"), short: false },
        { id: "8Xv5BLnXzgI", published: new Date("2026-10-01T23:00:21Z"), short: true },
      ],
    });
    expect(channelFeed("<feed></feed>")).toEqual({ title: null, videos: [] });
  });
});
