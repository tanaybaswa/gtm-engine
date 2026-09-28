import { describe, expect, it } from "vitest";
import { aiLiabilityInsurance } from "./topics/defaults";
import { compileKeywordFilter, orgKey, personKey, splitOutletSuffix, stripHtml, titleKey } from "./text";
import { canonicalizeUrl, domainOf } from "./url";

describe("canonicalizeUrl", () => {
  it("drops tracking params, www, fragments and trailing slashes", () => {
    expect(canonicalizeUrl("http://www.Example.com/story/?utm_source=x&b=2&a=1#top")).toBe("https://example.com/story?a=1&b=2");
  });
  it("keeps Google News article ids but drops their oc param", () => {
    expect(canonicalizeUrl("https://news.google.com/rss/articles/CBMiABC?oc=5")).toBe("https://news.google.com/rss/articles/CBMiABC");
  });
  it("leaves unparseable input alone", () => {
    expect(canonicalizeUrl(" not a url ")).toBe("not a url");
  });
});

describe("domainOf", () => {
  it("returns the bare host", () => {
    expect(domainOf("https://www.insurancejournal.com/news/east/")).toBe("insurancejournal.com");
    expect(domainOf(null)).toBeNull();
  });
});

describe("text helpers", () => {
  it("strips tags and decodes entities", () => {
    expect(stripHtml("<p>AI &amp; E&amp;O&nbsp;cover</p><script>x()</script>")).toBe("AI & E&O cover");
  });
  it("splits Google News outlet suffixes", () => {
    expect(splitOutletSuffix("Beazley expands cyber cover for AI - City AM", "City AM")).toEqual({
      title: "Beazley expands cyber cover for AI",
      outlet: "City AM",
    });
  });
  it("builds stable title keys", () => {
    expect(titleKey("Insurers Split Over AI Coverage!")).toBe(titleKey("insurers split over ai coverage"));
  });
  it("normalizes people and organization names", () => {
    expect(personKey("Dr. Jane O'Neil")).toBe("jane o neil");
    expect(orgKey("Munich Re Group AG")).toBe(orgKey("munich re"));
    expect(orgKey("AXA XL, Inc.")).toBe("axa xl");
  });
});

describe("keyword filter for the default topic", () => {
  const filter = compileKeywordFilter(aiLiabilityInsurance.config.keywords);

  it.each([
    "Beazley launches new cyber endorsements to cover firms' internal AI use",
    "When AI becomes the product, not the tool: the E&O gap opening",
    "Lloyd's syndicate backs warranty for generative models",
    "Insurers weigh exclusions for agentic systems and LLMs",
  ])("keeps %s", (text) => {
    expect(filter.excluded(text)).toBe(false);
    expect(filter.matchesGroups(text)).toBe(true);
  });

  it.each([
    "Chubb reports record property premiums",
    "Said the AIs in the paper", // no insurance term
    "OpenAI ships a new model",
  ])("drops %s", (text) => {
    expect(filter.matchesGroups(text)).toBe(false);
  });

  it("excludes consumer quote spam", () => {
    expect(filter.excluded("Get AI-powered car insurance quotes in minutes")).toBe(true);
  });
});
