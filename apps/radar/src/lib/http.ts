// Generic on purpose: no names or emails go out with requests.
export const USER_AGENT = process.env.RADAR_USER_AGENT || "Mozilla/5.0 (compatible; RadarBot/0.1)";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body?: string,
  ) {
    // Plain-text bodies (GDELT's rate-limit notes, API errors) are useful; HTML pages are noise.
    const detail = body && !body.trimStart().startsWith("<") ? `: ${body.slice(0, 200)}` : "";
    super(`HTTP ${status} for ${url}${detail}`);
  }
}

type FetchOptions = RequestInit & { timeoutMs?: number; retries?: number };

export async function httpFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15_000, retries = 1, headers, ...init } = options;
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, {
      ...init,
      headers: { "user-agent": USER_AGENT, accept: "*/*", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) return res;
    attempt += 1;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1500 * attempt);
  }
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const res = await httpFetch(url, options);
  const body = await res.text();
  if (!res.ok) throw new HttpError(res.status, url, body);
  return body;
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const res = await httpFetch(url, {
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  const body = await res.text();
  if (!res.ok) throw new HttpError(res.status, url, body);
  return JSON.parse(body) as T;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs async work over a list with bounded concurrency, keeping result order. */
export async function mapLimit<T, R>(list: T[], limit: number, fn: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(list.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const index = next++;
      results[index] = await fn(list[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
