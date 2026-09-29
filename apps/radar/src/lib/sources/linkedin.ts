// Reading public LinkedIn results that Google returns (through Serper). Radar never opens
// linkedin.com itself; everything here comes from search result titles, links and snippets.

const ORG_WORDS = /\b(inc|llc|ltd|llp|plc|gmbh|corp|corporation|company|group|organization|organisation|association|institute|partners|holdings)\b\.?/i;
const CREDENTIALS = /,\s*(?:[A-Z][A-Za-z-]*\.?\s*)+(?:\.\.\.|…)?$/;
const BOILERPLATE = [
  // "View Jane Smith's profile on LinkedIn, a professional community of 1 billion members.", often cut short.
  /View [^.]*?['’]s profile on LinkedIn(?:, a professional community of [^.]*)?[,.]?\s*(?:\.\.\.|…)?/gi,
  /\d+\+? connections on LinkedIn\.?/gi,
  /\bReport this (?:post|article)\b/gi,
];

const clean = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/\s*(?:\.\.\.|…)\s*$/, "")
    .trim();

/** "Karanveer Sirohi · Karanveer Sirohi" -> "Karanveer Sirohi"; "(Dr) Michael Meighu" -> "Michael Meighu". */
const cleanName = (name: string) =>
  clean(
    name
      .split(/\s+·\s+/)[0]
      .replace(/^\(?(?:dr|prof|mr|mrs|ms)\.?\)?\s+/i, ""),
  );

/** Mostly hashtags, like "#aiact #ailiability #internalaudit" or "silentai #offcloudai #kiappliance". */
function isHashtagsOnly(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const tags = words.filter((w) => w.startsWith("#")).length;
  return words.length <= 10 && tags / words.length >= 0.6;
}

/** The first sentence of a snippet that says something: not hashtags, not the poster's own byline. */
function firstSentence(snippet: string, name: string | null): string {
  const sentences = clean(snippet.replace(/^\.\.\.\s*/, ""))
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const useful = sentences.find(
    (s) =>
      s.length >= 12 &&
      !isHashtagsOnly(s.replace(/[|.]/g, " ")) &&
      !(name && s.toLowerCase().startsWith(name.toLowerCase())) &&
      !/View (?:profile|organization page) for|Report this/i.test(s),
  );
  return useful ?? sentences[0] ?? "";
}

/** "linkedin.com/posts/jane-smith-1a2b_..." or "uk.linkedin.com/in/jane-smith-1a2b" -> "jane-smith-1a2b". */
export function linkedInVanity(url: string): string | null {
  const match = url.match(/linkedin\.com\/(?:in|posts|company)\/([^/?#_]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

export function profileUrl(vanity: string, org = false): string {
  return `https://www.linkedin.com/${org ? "company" : "in"}/${encodeURIComponent(vanity)}`;
}

/** LinkedIn post ids begin with the post's time: the top 41 bits are milliseconds since 1970. */
export function activityTime(url: string): Date | undefined {
  const id = url.match(/(?:activity|share|ugcPost)[-:](\d{16,20})/i)?.[1];
  if (!id) return undefined;
  const ms = Number(BigInt(id) >> BigInt(22));
  // Only trust dates between LinkedIn's launch and tomorrow.
  if (ms < Date.UTC(2003, 0, 1) || ms > Date.now() + 86_400_000) return undefined;
  return new Date(ms);
}

/** Hashtags in a post: "#AIinsurance", including Google's "hashtag#AIinsurance" rendering. */
export function hashtagsIn(text: string): string[] {
  const tags = new Map<string, string>();
  for (const match of text.matchAll(/(?:^|[^\p{L}\p{N}_&])#([\p{L}][\p{L}\p{N}_]{1,49})/gu)) {
    const tag = match[1];
    if (!tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag);
  }
  for (const match of text.matchAll(/hashtag#([\p{L}][\p{L}\p{N}_]{1,49})/giu)) {
    const tag = match[1];
    if (!tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag);
  }
  return [...tags.values()];
}

/** Letters-only words of a name, for comparing it with a profile's handle or another name. */
function nameTokens(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length >= 2);
}

/** True when every word of a name (three letters or more) appears in the account's handle. */
function nameMatchesVanity(name: string, vanity: string | null): boolean {
  if (!vanity) return false;
  const handle = vanity.replace(/[^a-z]/g, "");
  const tokens = nameTokens(name).filter((t) => t.length >= 3);
  return tokens.length > 0 && tokens.every((t) => handle.includes(t));
}

/** Looser check for names a title already presents as a byline: the surname is in the handle ("jdoe"). */
function surnameMatchesVanity(name: string, vanity: string | null): boolean {
  if (!vanity) return false;
  const tokens = nameTokens(name);
  const surname = tokens[tokens.length - 1];
  return Boolean(surname && surname.length >= 3 && vanity.replace(/[^a-z]/g, "").includes(surname));
}

/**
 * Finds the poster's name in free text such as "... ignore AI Liability Christopher Moore on
 * LinkedIn.": the longest run of capitalized words whose every word is in the account handle.
 */
function nameFromText(text: string, vanity: string | null): string | null {
  if (!vanity) return null;
  let best: string | null = null;
  for (const match of text.matchAll(/\p{Lu}[\p{L}'.-]*(?:\s+\p{Lu}[\p{L}'.-]*)+/gu)) {
    const words = match[0].split(/\s+/);
    for (let start = 0; start < words.length - 1; start += 1) {
      const candidate = words.slice(start, start + 4).join(" ");
      for (let end = candidate.split(" ").length; end >= 2; end -= 1) {
        const name = candidate.split(" ").slice(0, end).join(" ");
        if (nameMatchesVanity(name, vanity) && (!best || name.length > best.length)) best = name;
      }
    }
  }
  return best;
}

const looksLikeName = (text: string) => /^[\p{Lu}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.&-]*){0,5}$/u.test(text) && text.split(/\s+/).length <= 6;

export type LinkedInPost = {
  vanity: string | null;
  /** The person or organization who posted, when the result says. */
  name: string | null;
  org: boolean;
  /** What the post says: its headline, or the start of its text. */
  text: string;
  kind: "post" | "article";
};

/** Reads a post or article result. Titles come in several shapes, so each is checked. */
export function parseLinkedInPost(link: string, title: string, snippet = ""): LinkedInPost {
  const kind: LinkedInPost["kind"] = /linkedin\.com\/pulse\//i.test(link) ? "article" : "post";
  const vanity = kind === "post" ? linkedInVanity(link) : null;
  const rawTitle = clean(title.replace(/\s*\|\s*LinkedIn\s*$/i, ""));
  let name: string | null = null;
  let text = rawTitle;
  let org = /View organization page for/i.test(snippet);

  const onLinkedIn = rawTitle.match(/^(.+?) on LinkedIn:\s*(.*)$/i);
  const possessive = rawTitle.match(/^(.+?)['’]s (?:Post|Article)(?:\s*[-–|:]\s*(.*))?$/i);
  const postedThis = rawTitle.match(/^(.+?) posted (?:this|on LinkedIn)$/i);
  const pipes = rawTitle.split(/\s+\|\s+/);
  const dashed = rawTitle.match(/^(.+?)\s+[-–]\s+(.+)$/);
  const byline = (part: string) =>
    cleanName(
      part
        .replace(/\s+posted\b.*$/i, "")
        .replace(CREDENTIALS, "")
        .replace(/\s+on LinkedIn.*$/i, ""),
    );
  const isByline = (candidate: string) =>
    looksLikeName(candidate) && candidate.includes(" ") && (surnameMatchesVanity(candidate, vanity) || nameMatchesVanity(candidate, vanity));

  if (onLinkedIn) {
    name = onLinkedIn[1].trim();
    text = onLinkedIn[2].trim();
  } else if (possessive) {
    name = possessive[1].trim();
    text = possessive[2]?.trim() ?? "";
  } else if (postedThis) {
    name = postedThis[1].trim();
    text = "";
  } else if (pipes.length > 1) {
    // "Post headline | Jane Smith, CPCU ...", "Headline | Gallagher Re posted ...", "Headline | Jane Doe | 12 comments",
    // or a byline Google cut short: "Headline | Law &", "Headline | Thushan".
    const found = pipes.slice(1).map(byline).find(isByline);
    if (found) name = found;
    if (found || pipes.slice(1).every((part) => part.split(/\s+/).length <= 3)) text = pipes[0];
  } else if (dashed && isByline(byline(dashed[1]))) {
    name = byline(dashed[1]);
    text = dashed[2].trim();
  }

  if (!name) {
    const viewFor = snippet.match(/View (?:profile|organization page) for ([^.]+?)\./i)?.[1]?.trim();
    name = viewFor && nameMatchesVanity(viewFor, vanity) ? viewFor : nameFromText(snippet, vanity);
  }
  if (name) name = cleanName(name);
  if (name && ORG_WORDS.test(name)) org = true;

  // A title that is only hashtags or a byline says nothing; use the start of the snippet.
  if (!text || isHashtagsOnly(text)) text = firstSentence(snippet, name) || rawTitle;
  return { vanity, name, org, text: clean(text), kind };
}

export type LinkedInProfileResult = {
  vanity: string;
  url: string;
  name: string;
  headline: string | null;
  company: string | null;
  location: string | null;
  about: string | null;
};

/** Reads a profile result: "Jane Smith - Head of AI Risk at Acme", "London · Head of AI Risk · Acme". */
export function parseLinkedInProfile(link: string, title: string, subtitle?: string, snippet?: string): LinkedInProfileResult | null {
  if (!/linkedin\.com\/in\//i.test(link)) return null;
  const vanity = linkedInVanity(link);
  if (!vanity) return null;
  const rawTitle = clean(title.replace(/\s*\|\s*LinkedIn\s*$/i, ""));
  const split = rawTitle.match(/^(.+?)\s+[-–|]\s+(.+)$/);
  const name = cleanName((split ? split[1] : rawTitle).replace(CREDENTIALS, ""));
  if (!name || name.split(/\s+/).length > 6) return null;
  const parts = (subtitle ?? "").split("·").map((p) => p.trim()).filter(Boolean);
  let about = snippet ?? "";
  for (const pattern of BOILERPLATE) about = about.replace(pattern, "");
  return {
    vanity,
    url: profileUrl(vanity),
    name,
    headline: split ? clean(split[2]) : parts.length >= 2 ? parts[parts.length - 2] : null,
    company: parts.length >= 3 ? parts[parts.length - 1] : null,
    location: parts.length >= 2 ? parts[0] : null,
    about: clean(about).replace(/[\s·.,;:]+$/, "") || null,
  };
}

// Letters after a name that aren't part of it.
const CREDENTIAL_WORDS = new Set([
  "phd", "mba", "cpcu", "cfa", "cpa", "esq", "jd", "md", "frm", "arm", "cissp", "cism", "pmp", "sphr", "shrm", "scp", "cic", "crm",
  "fcii", "acii", "faia", "ma", "msc", "llm", "jr", "sr", "ii", "iii", "cipp", "ccep", "facts",
]);

function coreName(name: string): string[] {
  const tokens = nameTokens(name.replace(/,.*$/, "")).filter((t) => t.length > 1);
  while (tokens.length > 2 && CREDENTIAL_WORDS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens;
}

/**
 * Does a profile's name belong to this person? First and last names must match; middle names,
 * initials and credentials are ignored ("Michael S. Levine" = "Michael Levine", but
 * "Andrew Ferguson" is not "Andrew Ferguson-Johns").
 */
export function sameName(person: string, candidate: string): boolean {
  const a = coreName(person);
  const b = coreName(candidate);
  if (a.length < 2 || b.length < 2) return false;
  return a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

/** What the user typed, as a Google search: adds site:linkedin.com/posts (or /in) when missing. */
export function linkedInQuery(q: string, kind: "posts" | "profiles"): string {
  const text = q.trim();
  if (/\bsite:/i.test(text)) return text;
  return `site:linkedin.com/${kind === "posts" ? "posts" : "in"} ${text}`;
}

export function hashtagQuery(tag: string): string {
  return `site:linkedin.com/posts #${tag.replace(/^#/, "").trim()}`;
}

/**
 * A simpler form of a search, for when the provider refuses the original (Serper's free plan
 * rejects some combinations). Keeps the site and the first quoted phrase, or the first two words.
 */
export function simplerQuery(q: string): string | null {
  const site = q.match(/\bsite:\S+/i)?.[0] ?? "";
  const phrase = q.match(/"([^"]+)"/)?.[1];
  const words = q
    .replace(/\bsite:\S+/gi, " ")
    .replace(/"[^"]*"/g, " ")
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(OR|AND)$/i.test(w) && !w.startsWith("-"));
  const core = phrase ? `"${phrase}"` : words.slice(0, 2).join(" ");
  const simpler = `${site} ${core}`.trim();
  return simpler && simpler.replace(/\s+/g, " ") !== q.trim().replace(/\s+/g, " ") ? simpler : null;
}
