import { LoginForm } from "@/components/forms";
import { passwordConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/";
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2 font-semibold">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-600 ring-4 ring-indigo-100 dark:ring-indigo-950" />
          Radar
        </div>
        {passwordConfigured() ? (
          <LoginForm next={next} />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Set <code className="font-mono text-xs">RADAR_PASSWORD</code> in the Vercel project settings and redeploy to sign in.
          </p>
        )}
      </div>
    </main>
  );
}
