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

export const topicConfigSchema = z.object({
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
        linkedin: z.array(z.string()).default([]),
      })
      .default({ news: [], linkedin: [] }),
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

export type TopicConfig = z.infer<typeof topicConfigSchema>;
