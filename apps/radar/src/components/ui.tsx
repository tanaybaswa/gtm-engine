import type { ReactNode } from "react";
import { connectorLabel } from "@/lib/sources";
import { timeZone } from "@/lib/config";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </section>
  );
}

const TONES = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  red: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  indigo: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-900",
} as const;

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: keyof typeof TONES; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function RelevanceBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge title="Not scored yet">unscored</Badge>;
  const tone = value >= 80 ? "green" : value >= 55 ? "indigo" : value >= 20 ? "neutral" : "red";
  return (
    <Badge tone={tone} title="Relevance to the topic, 0 to 100">
      {value}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: string }) {
  return <Badge>{connectorLabel(source)}</Badge>;
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "amber" | "green" | "red"; children: ReactNode }) {
  const styles = {
    neutral: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    red: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>;
}

export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300 ${className}`}
    >
      {children}
    </a>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{children}</div> : null}
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left text-xs font-medium tracking-wide text-zinc-500 uppercase ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] border-collapse text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-zinc-100 dark:[&_tbody_tr]:border-zinc-800">
        {children}
      </table>
    </div>
  );
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "undated";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(date);
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(date);
}

export function timeAgo(date: Date | null | undefined, now = Date.now()): string {
  if (!date) return "never";
  const minutes = Math.round((now - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
