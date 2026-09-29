import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

// Sends signed-out visitors to /login, and answers signed-out API calls with a 401.
// Server actions check the session again themselves.
export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "signed out" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Cron routes authenticate with CRON_SECRET instead; the health check is public.
  matcher: ["/((?!login|api/cron|api/health|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
