import Link from "next/link";
import { logout } from "@/app/actions";
import { NavLink, SubmitButton } from "@/components/client";
import { passwordConfigured } from "@/lib/auth";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-950" />
            Radar
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            <NavLink href="/">Brief</NavLink>
            <NavLink href="/people">People</NavLink>
            <NavLink href="/sources">Sources</NavLink>
            <NavLink href="/feed">Feed</NavLink>
            <NavLink href="/topics">Topics</NavLink>
          </nav>
          {passwordConfigured() ? (
            <form action={logout}>
              <SubmitButton variant="subtle" pendingText="Signing out...">
                Sign out
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
