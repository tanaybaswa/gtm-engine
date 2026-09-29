import { LoginForm } from "@/components/login-form";
import { RadarMark } from "@/components/console/icons";
import { passwordConfigured } from "@/lib/auth";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/";
  return (
    <main className="backdrop flex min-h-dvh items-center justify-center px-4 text-fg">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <RadarMark size={40} live />
          <h1 className="mt-4 text-[22px] font-semibold tracking-tight">Radar</h1>
          <p className="mt-1 text-[13px] text-fg-2">The sources and people behind the news, every morning.</p>
        </div>
        <div className="surface rounded-2xl p-6 shadow-[var(--shadow)]">
          {passwordConfigured() ? (
            <LoginForm next={next} />
          ) : (
            <p className="text-[13px] leading-relaxed text-fg-2">
              Set <code className="font-mono text-[12px] text-fg">RADAR_PASSWORD</code> in the Vercel project settings and redeploy to sign in.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
