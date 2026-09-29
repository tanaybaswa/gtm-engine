import { z } from "zod";
import { SOURCE_KINDS } from "./kinds";

export { SOURCE_KINDS, type SourceKind } from "./kinds";

export const feedSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  kind: z.enum(SOURCE_KINDS).optional(),
  // General feeds (all of insurance news, all of a law firm's alerts) only keep
  // items that pass the topic's keyword filter. Topic-specific feeds keep everything.
  filter: z.boolean().default(true),
});
export type FeedConfig = z.infer<typeof feedSchema>;

/**
 * The phrases in LinkedIn searches: 'site:linkedin.com/posts "AI liability" insurance' -> "AI liability".
 * Unquoted searches count as one phrase, without their operators.
 */
export function linkedInPhrases(searches: string[]): string[] {
  const phrases = new Map<string, string>();
  for (const q of searches) {
    const quoted = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const found = quoted.length ? quoted : [q.replace(/\S+:\S+|#\S+|(^|\s)-\S+|\b(OR|AND)\b|[()"]/g, " ")];
    for (const raw of found) {
      const phrase = raw.replace(/\s+/g, " ").trim();
      if (phrase.length >= 3 && phrase.split(" ").length <= 4) phrases.set(phrase.toLowerCase(), phrase);
    }
  }
  return [...phrases.values()];
}

/** "parametric insurance" -> "ParametricInsurance". */
const toHashtag = (phrase: string) =>
  phrase
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("")
    .replace(/[^\p{L}\p{N}_]/gu, "");

// Topics saved before people searches and hashtags existed get them from their LinkedIn
// searches. Once saved, even as empty lists, they're left alone.
function fillLinkedInDefaults(input: unknown): unknown {
  const config = input as { queries?: { serper?: { linkedin?: unknown; profiles?: unknown }; hashtags?: unknown } } | null;
  const queries = config?.queries;
  const serper = queries?.serper;
  if (!serper || !Array.isArray(serper.linkedin) || (serper.profiles !== undefined && queries.hashtags !== undefined)) return input;
  const phrases = linkedInPhrases(serper.linkedin.filter((q): q is string => typeof q === "string"));
  return {
    ...config,
    queries: {
      ...queries,
      serper: { ...serper, profiles: serper.profiles ?? phrases.slice(0, 3).map((p) => `"${p}"`) },
      hashtags: queries.hashtags ?? phrases.filter((p) => p.split(" ").length <= 3).slice(0, 3).map(toHashtag),
    },
  };
}

const configShape = z.object({
  // Every group needs at least one match; terms ending in * match as prefixes.
  keywords: z.object({
    groups: z.array(z.array(z.string().min(1)).min(1)).default([]),
    exclude: z.array(z.string().min(1)).default([]),
  }),
  queries: z.object({
    googleNews: z.array(z.string()).default([]),
    gdelt: z.array(z.string()).default([]),
    hackerNews: z.array(z.string()).default([]),
    reddit: z
      .object({
        search: z.array(z.string()).default([]),
        subreddits: z.array(z.string()).default([]),
      })
      .default({ search: [], subreddits: [] }),
    x: z
      .object({
        search: z.array(z.string()).default([]),
        accounts: z.array(z.string()).default([]),
      })
      .default({ search: [], accounts: [] }),
    serper: z
      .object({
        news: z.array(z.string()).default([]),
        // LinkedIn posts and articles. A phrase is enough: site:linkedin.com/posts is added.
        linkedin: z.array(z.string()).default([]),
        // People whose public LinkedIn profile mentions these. site:linkedin.com/in is added.
        profiles: z.array(z.string()).default([]),
      })
      .default({ news: [], linkedin: [], profiles: [] }),
    // Hashtags, without the #, searched on LinkedIn (and on X when X is on).
    hashtags: z.array(z.string()).default([]),
  }),
  feeds: z.array(feedSchema).default([]),
  watch: z
    .object({
      orgs: z.array(z.string()).default([]),
      people: z.array(z.string()).default([]),
    })
    .default({ orgs: [], people: [] }),
  // How Claude judges this topic. Empty fields fall back to the topic's defaults, or to a
  // general-purpose rubric for topics created from scratch.
  guide: z
    .object({
      // What scores high, medium and low for this topic.
      relevance: z.string().default(""),
      // Who reads the brief, so "why it matters" is written for them.
      audience: z.string().default(""),
      // Which kinds of organizations are worth extracting.
      orgs: z.string().default(""),
    })
    .default({ relevance: "", audience: "", orgs: "" }),
  // How far back each collection looks. Overlap between runs is fine; items are deduplicated.
  lookbackHours: z.number().int().positive().max(24 * 30).default(36),
  // Items scoring at or above this are treated as relevant (0-100).
  relevanceThreshold: z.number().int().min(0).max(100).default(55),
});

export const topicConfigSchema = z.preprocess(fillLinkedInDefaults, configShape);

export type TopicConfig = z.infer<typeof topicConfigSchema>;
