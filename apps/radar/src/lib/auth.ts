// A single shared password for the team, stored as an HMAC in an HttpOnly cookie.
// Works in the proxy (Web Crypto) and in server actions.

export const SESSION_COOKIE = "radar_session";

export function passwordConfigured(): boolean {
  return Boolean(process.env.RADAR_PASSWORD);
}

/** On Vercel the app refuses to run without a password; locally it stays open for development. */
export function authRequired(): boolean {
  return passwordConfigured() || Boolean(process.env.VERCEL);
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sessionToken(): Promise<string | null> {
  const password = process.env.RADAR_PASSWORD;
  return password ? hmac(password, "radar-session-v1") : null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!authRequired()) return true;
  const expected = await sessionToken();
  return Boolean(expected && cookieValue && safeEqual(cookieValue, expected));
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const password = process.env.RADAR_PASSWORD;
  if (!password) return false;
  return safeEqual(await hmac(password, candidate), await hmac(password, password));
}
