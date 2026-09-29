const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src",
  "ref_url",
  "cmpid",
  "oc", // Google News
  "ncid",
  "sr_share",
  "trk",
  "trackingid",
  "rcm",
  "_hsenc",
  "_hsmi",
  "mkt_tok",
]);

/** Normalizes a URL so the same article collected from two places dedupes to one key. */
export function canonicalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return input.trim();
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  if (url.protocol === "http:") url.protocol = "https:";
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  const out = url.toString();
  return url.pathname === "/" && !url.search ? out.replace(/\/$/, "") : out;
}

/** "https://www.insurancejournal.com/news/..." -> "insurancejournal.com" */
export function domainOf(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isHttpUrl(input: string | null | undefined): input is string {
  if (!input) return false;
  try {
    const { protocol } = new URL(input);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** An http(s) URL on a public host name: no IP addresses, localhost or internal names. */
export function isPublicHttpUrl(input: string | null | undefined): input is string {
  if (!isHttpUrl(input)) return false;
  const host = new URL(input).hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") return false;
  // IPv4 literals and bracketed IPv6 literals.
  return !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.startsWith("[");
}

/**
 * Where a Neon database runs, from its host name, without revealing the host:
 * "ep-name-123-pooler.c-14.us-east-1.aws.neon.tech" -> "aws-us-east-1".
 */
export function neonRegion(connectionUrl: string | null | undefined): string | null {
  if (!connectionUrl) return null;
  try {
    const parts = new URL(connectionUrl).hostname.split(".");
    const cloud = parts.findIndex((p) => p === "aws" || p === "azure" || p === "gcp");
    return cloud > 0 ? `${parts[cloud]}-${parts[cloud - 1]}` : null;
  } catch {
    return null;
  }
}
