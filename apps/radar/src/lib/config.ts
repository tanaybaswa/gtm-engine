function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const config = {
  // Claude: pay as you go; capped per month by RADAR_AI_MONTHLY_BUDGET_USD.
  model: process.env.RADAR_MODEL || "claude-opus-5",
  aiEnabled: () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  aiMonthlyBudgetUsd: intEnv("RADAR_AI_MONTHLY_BUDGET_USD", 30),
  // Items sent to Claude per enrichment pass, and articles read in full per pass.
  triageBatchSize: intEnv("RADAR_TRIAGE_BATCH", 20),
  maxTriagePerRun: intEnv("RADAR_MAX_TRIAGE_PER_RUN", 160),
  maxExtractPerRun: intEnv("RADAR_MAX_EXTRACT_PER_RUN", 20),

  // X (official pay-per-use API): $0.005 per post read, $0.010 per user read.
  // Spend is estimated per request and stopped at a monthly dollar cap.
  xBearerToken: () => process.env.X_BEARER_TOKEN,
  xMonthlyBudgetUsd: intEnv("X_MONTHLY_BUDGET_USD", 10),

  // Serper (Google News with publisher links, and LinkedIn posts, hashtags and people through
  // Google). Free plan: 2,500 searches. Each search runs at most once a day, so one topic uses
  // up to about 450 a month; with more topics, searches are spaced out to fit the cap.
  serperApiKey: () => process.env.SERPER_API_KEY,
  serperMonthlyQueries: intEnv("SERPER_MONTHLY_QUERIES", 500),

  // YouTube Data API (a free key): about 100 searches a day per Google project, so Radar stops
  // a little short of that. Channels are read through their public feeds, which cost nothing.
  youtubeApiKey: () => process.env.YOUTUBE_API_KEY,
  youtubeDailySearches: intEnv("YOUTUBE_DAILY_SEARCHES", 90),

  // Scheduled runs on Vercel send "Authorization: Bearer <CRON_SECRET>".
  cronSecret: () => process.env.CRON_SECRET,

  // Each scheduled or manual run stops starting new work after this many seconds
  // (Vercel's free plan allows 300 seconds per function call).
  runBudgetSeconds: intEnv("RADAR_RUN_BUDGET_SECONDS", 250),
};

export function currentMonth(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/** The team's timezone, used to decide which day a brief belongs to. */
export const timeZone = process.env.RADAR_TIMEZONE || "America/Los_Angeles";

/** YYYY-MM-DD in the team's timezone. */
export function localDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
