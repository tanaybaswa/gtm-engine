// Kinds of sources. Kept apart from the Zod schemas so the browser can use it cheaply.
export const SOURCE_KINDS = [
  "publication",
  "trade_press",
  "blog",
  "newsletter",
  "podcast",
  "video",
  "regulator",
  "law_firm",
  "wire",
  "company",
  "research",
  "community",
  "social_account",
  "aggregator",
  "other",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
