const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return decodeEntities(
    input
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|h\d)>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1).trimEnd()}...`;
}

/** Key used to spot the same headline syndicated across outlets. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Google News titles end with " - Outlet". Returns the headline and the outlet. */
export function splitOutletSuffix(title: string, outlet?: string | null): { title: string; outlet: string | null } {
  const clean = title.trim();
  if (outlet && clean.endsWith(` - ${outlet}`)) {
    return { title: clean.slice(0, -(outlet.length + 3)).trim(), outlet };
  }
  const idx = clean.lastIndexOf(" - ");
  if (idx > 20 && clean.length - idx < 60) {
    return { title: clean.slice(0, idx).trim(), outlet: outlet ?? clean.slice(idx + 3).trim() };
  }
  return { title: clean, outlet: outlet ?? null };
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(term: string): string {
  const trimmed = term.trim();
  const prefix = trimmed.endsWith("*");
  const body = escapeRegExp(prefix ? trimmed.slice(0, -1) : trimmed).replace(/\s+/g, "\\s+");
  // Word boundaries that also work next to "&" or "'" (for example "E&O", "Lloyd's").
  return `(?<![\\p{L}\\p{N}])${body}${prefix ? "" : "(?![\\p{L}\\p{N}])"}`;
}

export type KeywordRules = { groups: string[][]; exclude: string[] };

export type KeywordFilter = {
  /** Every group has at least one matching term. */
  matchesGroups: (text: string) => boolean;
  /** Any exclude term matches. */
  excluded: (text: string) => boolean;
};

/** Compiles keyword rules. Matching is case-insensitive; "insur*" matches prefixes. */
export function compileKeywordFilter(rules: KeywordRules): KeywordFilter {
  const groups = rules.groups
    .filter((g) => g.length > 0)
    .map((g) => new RegExp(g.map(termPattern).join("|"), "iu"));
  const exclude = rules.exclude.length ? new RegExp(rules.exclude.map(termPattern).join("|"), "iu") : null;
  return {
    matchesGroups: (text) => groups.every((re) => re.test(text)),
    excluded: (text) => Boolean(exclude?.test(text)),
  };
}

/** Lowercase, punctuation-free key for matching a person's name across sources. */
export function personKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(dr|mr|mrs|ms|prof|sir)\.?\s+/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase key for an organization, ignoring legal suffixes. */
export function orgKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|inc|incorporated|llc|ltd|limited|plc|corp|corporation|co|company|group|holdings|se|ag|sa|nv|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
