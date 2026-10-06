import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { SourceKind, TopicConfig } from "@/lib/topics/types";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  config: jsonb("config").$type<TopicConfig>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RunStage = "collect" | "enrich" | "brief" | "full";

/** How one search went, so Settings can show what each search finds. */
export type QueryOutcome = {
  found: number;
  /** The simpler form Radar ran after the provider refused the original. */
  ranAs?: string;
  error?: string;
  /** What the search resolved to, such as a YouTube channel's name. */
  label?: string;
};

export type ConnectorStat = {
  fetched: number;
  inserted: number;
  skipped?: string;
  error?: string;
  ms: number;
  queries?: Record<string, QueryOutcome>;
  /** Something worth knowing that isn't an error, such as "searched today already". */
  info?: string;
};

/** Where a run is right now, for the live status in the console. */
export type RunProgress = {
  phase: "collect" | "score" | "read" | "brief";
  done?: number;
  total?: number;
  detail?: string;
  at: string;
};

export type RunStats = {
  progress?: RunProgress;
  connectors?: Record<string, ConnectorStat>;
  prefiltered?: number;
  triaged?: number;
  relevant?: number;
  extracted?: number;
  stories?: number;
  aiSkipped?: string;
  notes?: string[];
};

export const runs = pgTable(
  "runs",
  {
    id: serial("id").primaryKey(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    stage: text("stage").$type<RunStage>().notNull(),
    trigger: text("trigger").notNull(), // cron | manual | cli
    status: text("status").notNull(), // running | ok | partial | error
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    stats: jsonb("stats").$type<RunStats>().notNull().default({}),
    error: text("error"),
  },
  (t) => [index("runs_topic_started_idx").on(t.topicId, t.startedAt)],
);

export type ItemStatus = "new" | "filtered" | "triaged" | "extracted" | "error";

export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // connector id
    externalId: text("external_id"),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    titleKey: text("title_key").notNull(),
    title: text("title").notNull(),
    snippet: text("snippet"),
    author: text("author"),
    authorUrl: text("author_url"),
    outlet: text("outlet"),
    sourceKey: text("source_key").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
    engagement: jsonb("engagement").$type<Record<string, number>>(),
    matchedQuery: text("matched_query"),
    status: text("status").$type<ItemStatus>().notNull().default("new"),
    relevance: integer("relevance"),
    category: text("category"),
    isOrigin: boolean("is_origin"),
    originHint: text("origin_hint"),
    gist: text("gist"),
    summary: text("summary"),
    whyItMatters: text("why_it_matters"),
    resolvedUrl: text("resolved_url"),
    primarySources: jsonb("primary_sources").$type<PrimarySource[]>(),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("items_topic_canonical_idx").on(t.topicId, t.canonicalUrl),
    index("items_topic_title_idx").on(t.topicId, t.titleKey),
    index("items_topic_published_idx").on(t.topicId, t.publishedAt),
    index("items_topic_status_idx").on(t.topicId, t.status),
    index("items_source_key_idx").on(t.sourceKey),
  ],
);

export type PrimarySource = {
  title: string;
  url: string | null;
  kind: string;
  publisher: string | null;
};

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  nameKey: text("name_key").notNull().unique(),
  name: text("name").notNull(),
  role: text("role"),
  orgName: text("org_name"),
  linkedinUrl: text("linkedin_url"),
  // Headline from their public LinkedIn profile, and when Radar last looked them up.
  linkedinHeadline: text("linkedin_headline"),
  linkedinCheckedAt: timestamp("linkedin_checked_at", { withTimezone: true }),
  xHandle: text("x_handle"),
  mentionCount: integer("mention_count").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  watched: boolean("watched").notNull().default(false),
});

export const orgs = pgTable("orgs", {
  id: serial("id").primaryKey(),
  nameKey: text("name_key").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind"),
  mentionCount: integer("mention_count").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  watched: boolean("watched").notNull().default(false),
});

export const personMentions = pgTable(
  "person_mentions",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(), // author | quoted | mentioned | poster | speaker
    role: text("role"),
    orgName: text("org_name"),
    quote: text("quote"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("person_mentions_unique_idx").on(t.itemId, t.personId, t.relation),
    index("person_mentions_person_idx").on(t.personId),
  ],
);

export const orgMentions = pgTable(
  "org_mentions",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    orgId: integer("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(), // subject | quoted | mentioned | publisher
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("org_mentions_unique_idx").on(t.itemId, t.orgId, t.relation),
    index("org_mentions_org_idx").on(t.orgId),
  ],
);

// People found by searching public LinkedIn profiles for a topic's phrases (through Google).
export const linkedinProfiles = pgTable(
  "linkedin_profiles",
  {
    id: serial("id").primaryKey(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    vanity: text("vanity").notNull(), // the "jane-smith-123" in linkedin.com/in/jane-smith-123
    url: text("url").notNull(),
    name: text("name").notNull(),
    headline: text("headline"),
    company: text("company"),
    location: text("location"),
    about: text("about"),
    matchedQuery: text("matched_query"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("linkedin_profiles_topic_vanity_idx").on(t.topicId, t.vanity)],
);

// Where things come from: outlets, feeds, accounts and communities.
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // domain, "x:@handle", "reddit:r/name", "linkedin:handle"
  name: text("name").notNull(),
  kind: text("kind").$type<SourceKind>().notNull().default("publication"),
  homepage: text("homepage"),
  feedUrl: text("feed_url"),
  followed: boolean("followed").notNull().default(false),
  itemCount: integer("item_count").notNull().default(0),
  relevantCount: integer("relevant_count").notNull().default(0),
  originCount: integer("origin_count").notNull().default(0),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stories = pgTable(
  "stories",
  {
    id: serial("id").primaryKey(),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    briefDate: text("brief_date").notNull(), // YYYY-MM-DD
    rank: integer("rank").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    whyItMatters: text("why_it_matters"),
    originItemId: integer("origin_item_id").references(() => items.id, {
      onDelete: "set null",
    }),
    itemIds: jsonb("item_ids").$type<number[]>().notNull().default([]),
    peopleNames: jsonb("people_names").$type<string[]>().notNull().default([]),
    orgNames: jsonb("org_names").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("stories_topic_date_rank_idx").on(t.topicId, t.briefDate, t.rank)],
);

// Monthly meters for anything that costs money (X reads, Serper queries, Claude spend).
export const usage = pgTable(
  "usage",
  {
    id: serial("id").primaryKey(),
    month: text("month").notNull(), // YYYY-MM
    meter: text("meter").notNull(),
    amount: integer("amount").notNull().default(0),
  },
  (t) => [uniqueIndex("usage_month_meter_idx").on(t.month, t.meter)],
);

// Small cache for lookups we pay for once (for example X user ids).
export const kv = pgTable("kv", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Topic = typeof topics.$inferSelect;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Person = typeof people.$inferSelect;
export type Org = typeof orgs.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Story = typeof stories.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type LinkedInProfile = typeof linkedinProfiles.$inferSelect;
