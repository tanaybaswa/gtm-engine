import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

// Sends signed-out visitors to /login. Server actions check the session again themselves.
export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Cron routes authenticate with CRON_SECRET instead.
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
