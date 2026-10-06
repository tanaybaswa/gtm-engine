import type { ItemDTO } from "@/lib/console/types";
import type { Range } from "./store";

export const itemTime = (item: Pick<ItemDTO, "publishedAt" | "collectedAt">): string => item.publishedAt ?? item.collectedAt;

const RANGE_MS: Record<Range, number> = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, all: Infinity };
export const RANGE_LABELS: Record<Range, string> = { "24h": "24h", "7d": "7d", "30d": "30d", all: "All" };

export function inRange(item: ItemDTO, range: Range, now: number): boolean {
  return range === "all" || now - Date.parse(itemTime(item)) <= RANGE_MS[range];
}

export function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function formatDay(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

/** "2026-09-28" -> "Monday, September 28". Brief dates are already in the team's timezone. */
export function formatBriefDate(date: string, style: "long" | "short" = "long"): string {
  const d = new Date(`${date}T12:00:00Z`);
  return style === "long"
    ? d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function duration(fromIso: string, toIso: string | null, now: number): string {
  const ms = (toIso ? Date.parse(toIso) : now) - Date.parse(fromIso);
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export const compact = (n: number): string => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export const usd = (n: number): string => `$${n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString()}`;

export const CATEGORY_LABELS: Record<string, string> = {
  product_launch: "Launch",
  coverage_wording: "Coverage",
  market_deal: "Deal",
  claims_litigation: "Claims and litigation",
  regulation_policy: "Regulation",
  research_report: "Research",
  incident: "Incident",
  people_move: "People move",
  event: "Event",
  opinion_analysis: "Analysis",
  other: "Other",
};

export const KIND_LABELS: Record<string, string> = {
  publication: "Publication",
  trade_press: "Trade press",
  blog: "Blog",
  newsletter: "Newsletter",
  podcast: "Podcast",
  video: "Video channel",
  regulator: "Regulator",
  law_firm: "Law firm",
  wire: "Press wire",
  company: "Company",
  research: "Research",
  community: "Community",
  social_account: "Social account",
  aggregator: "Aggregator",
  other: "Other",
};

export const RELATION_LABELS: Record<string, string> = {
  quoted: "Quoted",
  speaker: "Speaker",
  poster: "Posted",
  author: "Author",
  mentioned: "Named",
  subject: "Subject",
  publisher: "Publisher",
};

// Market voices first, then the people who write about the market.
export const RELATION_ORDER = ["quoted", "speaker", "poster", "author", "subject", "mentioned", "publisher"];

export const PRIMARY_KIND_LABELS: Record<string, string> = {
  report: "Report",
  filing: "Filing",
  regulation: "Regulation",
  policy_wording: "Policy wording",
  press_release: "Press release",
  study: "Study",
  court_case: "Court case",
  statement: "Statement",
  post: "Post",
  other: "Source",
};

export function linkedinSearch(name: string, org: string | null): string {
  return `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent([name, org].filter(Boolean).join(" "))}`;
}

export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(q));
}
