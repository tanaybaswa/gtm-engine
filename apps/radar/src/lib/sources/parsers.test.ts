import { describe, expect, it } from "vitest";
import { readFeed } from "./feed";
import { parseLinkedInResult, parseSerperDate } from "./serper";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Google News</title><link>https://news.google.com</link>
<item>
  <title>Beazley expands cyber cover for AI malfunctions - City AM</title>
  <link>https://news.google.com/rss/articles/CBMiXYZ?oc=5</link>
  <guid isPermaLink="false">CBMiXYZ</guid>
  <pubDate>Thu, 24 Sep 2026 08:00:00 GMT</pubDate>
  <description>&lt;a href="x"&gt;Beazley expands&lt;/a&gt;</description>
  <source url="https://www.cityam.com">City AM</source>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>search results</title><id>x</id><updated>2026-09-24T00:00:00Z</updated>
<entry>
  <author><name>/u/underwriter42</name><uri>https://www.reddit.com/user/underwriter42</uri></author>
  <id>t3_abc123</id>
  <link href="https://www.reddit.com/r/Insurance/comments/abc123/ai_exclusions/"/>
  <updated>2026-09-24T10:00:00+00:00</updated>
  <published>2026-09-24T09:00:00+00:00</published>
  <title>Are carriers adding AI exclusions to E&amp;O renewals?</title>
  <content type="html">&lt;p&gt;Seeing new wording&lt;/p&gt;</content>
</entry>
</feed>`;

describe("readFeed", () => {
  it("reads RSS items including Google News source tags", () => {
    const feed = readFeed(RSS);
    expect(feed.entries).toHaveLength(1);
    const [entry] = feed.entries;
    expect(entry.title).toBe("Beazley expands cyber cover for AI malfunctions - City AM");
    expect(entry.sourceTitle).toBe("City AM");
    expect(entry.sourceUrl).toBe("https://www.cityam.com");
    expect(entry.published?.toISOString()).toBe("2026-09-24T08:00:00.000Z");
  });

  it("reads the FCA's non-standard dates", () => {
    const fca = RSS.replace("Thu, 24 Sep 2026 08:00:00 GMT", "Wednesday, September 23, 2026 - 12:17");
    expect(readFeed(fca).entries[0].published?.getUTCDate()).toBe(23);
  });

  it("reads Atom entries with authors and ids", () => {
    const [entry] = readFeed(ATOM).entries;
    expect(entry.id).toBe("t3_abc123");
    expect(entry.author).toBe("/u/underwriter42");
    expect(entry.link).toBe("https://www.reddit.com/r/Insurance/comments/abc123/ai_exclusions/");
    expect(entry.title).toBe("Are carriers adding AI exclusions to E&O renewals?");
    expect(entry.summary).toBe("Seeing new wording");
  });
});

describe("Serper helpers", () => {
  it("parses relative and absolute dates", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    expect(parseSerperDate("3 hours ago", now)?.toISOString()).toBe("2026-09-24T09:00:00.000Z");
    expect(parseSerperDate("1 day ago", now)?.toISOString()).toBe("2026-09-23T12:00:00.000Z");
    expect(parseSerperDate(undefined)).toBeUndefined();
  });

  it("finds the author of a public LinkedIn post", () => {
    expect(
      parseLinkedInResult(
        "https://www.linkedin.com/posts/jane-doe-123_ai-insurance-activity-7240000000000000000-AbCd",
        "Jane Doe on LinkedIn: Affirmative AI cover is coming to tech E&O",
      ),
    ).toEqual({ vanity: "jane-doe-123", name: "Jane Doe", text: "Affirmative AI cover is coming to tech E&O" });
    expect(
      parseLinkedInResult("https://www.linkedin.com/posts/jdoe_x-activity-1-a", "Why silent AI matters | Jane Doe | 12 comments").name,
    ).toBe("Jane Doe");
  });
});
