import { describe, expect, it } from "vitest";
import { linkedInPhrases, topicConfigSchema } from "./types";

const base = { keywords: { groups: [["parametric"]] }, feeds: [] };

describe("topic config", () => {
  it("finds the phrases in LinkedIn searches", () => {
    expect(
      linkedInPhrases([
        'site:linkedin.com/posts "parametric insurance"',
        'site:linkedin.com/posts ("parametric cover" OR "Parametric Insurance")',
        "site:linkedin.com/pulse climate risk transfer",
        "site:linkedin.com/posts #parametric -jobs",
      ]),
    ).toEqual(["Parametric Insurance", "parametric cover", "climate risk transfer"]);
  });

  it("gives topics saved before people searches and hashtags some from their LinkedIn searches", () => {
    const config = topicConfigSchema.parse({
      ...base,
      queries: { serper: { news: [], linkedin: ['site:linkedin.com/posts "parametric insurance"', 'site:linkedin.com/posts "cat bond" payout'] } },
    });
    expect(config.queries.serper.profiles).toEqual(['"parametric insurance"', '"cat bond"']);
    expect(config.queries.hashtags).toEqual(["ParametricInsurance", "CatBond"]);
    expect(config.queries.youtube).toEqual({ search: ['"parametric insurance"', '"cat bond"'], channels: [] });
  });

  it("leaves saved people searches and hashtags alone, even when empty", () => {
    const config = topicConfigSchema.parse({
      ...base,
      queries: { serper: { news: [], linkedin: ['"parametric insurance"'], profiles: [] }, hashtags: ["parametric"] },
    });
    expect(config.queries.serper.profiles).toEqual([]);
    expect(config.queries.hashtags).toEqual(["parametric"]);
  });

  it("parses a topic with no LinkedIn searches", () => {
    const config = topicConfigSchema.parse({ ...base, queries: {} });
    expect(config.queries.serper).toEqual({ news: [], linkedin: [], profiles: [] });
    expect(config.queries.hashtags).toEqual([]);
    expect(config.queries.youtube).toEqual({ search: [], channels: [] });
  });
});
