"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      }`}
    >
      {children}
    </Link>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "subtle";
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-400",
    secondary:
      "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
    subtle: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  };
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-wait ${styles[variant]}`}
    >
      {pending ? (pendingText ?? "Working...") : children}
    </button>
  );
}

/** Refreshes server data every few seconds while a run is in progress. */
export function AutoRefresh({ active, intervalMs = 5000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
