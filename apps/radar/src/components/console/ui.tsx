"use client";

import { LoaderCircle, type LucideIcon } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { formatDateTime, timeAgo } from "./format";
import { useConsole } from "./store";

const BUTTON_VARIANTS = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-strong shadow-[0_0_0_1px_var(--accent-soft),0_8px_24px_-10px_var(--accent)]",
  secondary: "border border-line bg-panel-2 text-fg hover:border-line-2 hover:bg-panel-3",
  ghost: "text-fg-2 hover:bg-panel-2 hover:text-fg",
  danger: "border border-line text-bad hover:border-bad/40 hover:bg-bad/10",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: "sm" | "md";
  icon?: LucideIcon;
  loading?: boolean;
}) {
  const sizing = size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]";
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 ${sizing} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <LoaderCircle size={14} className="animate-spin" /> : Icon ? <Icon size={14} strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  active = false,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-panel-2 hover:text-fg"
      } ${className}`}
      {...rest}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}

const BADGE_TONES = {
  neutral: "bg-panel-3 text-fg-2",
  accent: "bg-accent-soft text-accent",
  good: "bg-good/12 text-good",
  warn: "bg-warn/12 text-warn",
  bad: "bg-bad/12 text-bad",
  outline: "border border-line text-fg-2",
} as const;

export function Badge({
  tone = "neutral",
  children,
  title,
  className = "",
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-panel-2 px-1 font-mono text-[10.5px] text-fg-3">
      {children}
    </kbd>
  );
}

/** Relevance on one hue: the fill grows with the score and dims below the topic's threshold. */
export function RelevanceMeter({ value, threshold }: { value: number | null; threshold: number }) {
  if (value === null) {
    return (
      <span className="font-mono text-[10.5px] text-fg-3" title="Not scored yet">
        new
      </span>
    );
  }
  const strong = value >= threshold;
  return (
    <span className="inline-flex items-center gap-1.5" title={`Relevance ${value} of 100`}>
      <span className="relative h-1 w-7 overflow-hidden rounded-full bg-line">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${Math.max(4, value)}%`, opacity: strong ? 1 : 0.35 }}
        />
      </span>
      <span className={`font-mono text-[11px] tabular-nums ${strong ? "text-fg" : "text-fg-3"}`}>{value}</span>
    </span>
  );
}

/** Spend or quota against a cap. Turns critical, with a label, near the cap. */
export function Meter({ label, used, cap, format, off }: { label: string; used: number; cap: number; format: (n: number) => string; off?: string }) {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  const near = pct >= 90;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-fg">{label}</span>
        <span className="font-mono text-[12px] text-fg-2 tabular-nums">
          {off ? off : `${format(used)} of ${format(cap)}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${near ? "bg-bad" : "bg-accent"}`} style={{ width: `${off ? 0 : pct}%` }} />
      </div>
      {near && !off ? <div className="mt-1 text-[11.5px] text-bad">Near the monthly cap. Paid calls stop at the cap.</div> : null}
    </div>
  );
}

/** A small trend line: muted line, the latest point in the accent, and a hover readout. */
export function Sparkline({
  values,
  labels,
  width = 92,
  height = 30,
  unit = "",
}: {
  values: number[];
  labels: string[];
  width?: number;
  height?: number;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (values.length < 2) return null;
  const pad = 5;
  const max = Math.max(1, ...values);
  const step = (width - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => [pad + i * step, height - pad - (v / max) * (height - pad * 2)] as const);
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const active = hover === null ? null : points[hover];
  return (
    <div className="relative shrink-0" onMouseLeave={() => setHover(null)}>
      <svg
        width={width}
        height={height}
        className="block overflow-visible"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const index = Math.round((e.clientX - box.left - pad) / step);
          setHover(Math.max(0, Math.min(values.length - 1, index)));
        }}
        role="img"
        aria-label={`${labels[0]} to ${labels[labels.length - 1]}: ${values.join(", ")}`}
      >
        <path d={path} fill="none" stroke="var(--text-3)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {active ? <line x1={active[0]} x2={active[0]} y1={0} y2={height} stroke="var(--line-2)" strokeWidth={1} /> : null}
        {active && hover !== values.length - 1 ? (
          <circle cx={active[0]} cy={active[1]} r={3.5} fill="var(--text-2)" stroke="var(--panel)" strokeWidth={2} />
        ) : null}
        <circle cx={last[0]} cy={last[1]} r={4} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
      </svg>
      {hover !== null ? (
        <div className="pointer-events-none absolute right-0 bottom-full z-20 mb-1.5 rounded-md border border-line-2 bg-panel-3 px-2 py-1 font-mono text-[11px] whitespace-nowrap text-fg shadow-lg">
          {labels[hover]} · {values[hover]}
          {unit}
        </div>
      ) : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  foot,
  spark,
  children,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  spark?: { values: number[]; labels: string[]; unit?: string };
  children?: ReactNode;
}) {
  return (
    <div className="surface flex min-w-0 flex-col justify-between rounded-xl px-3.5 py-3">
      <div className="truncate text-[12px] text-fg-2">{label}</div>
      <div className="mt-0.5 flex items-end justify-between gap-2">
        <div className="text-[22px] leading-tight font-semibold tracking-tight tabular-nums">{value}</div>
        {spark ? (
          <div className="hidden min-[400px]:block">
            <Sparkline values={spark.values} labels={spark.labels} unit={spark.unit} width={76} height={26} />
          </div>
        ) : null}
      </div>
      {children}
      {foot ? <div className="mt-1 truncate text-[11.5px] text-fg-3">{foot}</div> : null}
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-2 px-6 py-10 text-center">
      {Icon ? (
        <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-panel-2 text-fg-3">
          <Icon size={17} />
        </span>
      ) : null}
      <p className="font-medium text-fg">{title}</p>
      {children ? <div className="mt-1.5 max-w-md text-[13px] leading-relaxed text-fg-2">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 shrink-0 items-center rounded-lg border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-full rounded-md px-2.5 font-mono text-[11.5px] transition-colors ${
            value === o.value ? "bg-panel-3 text-fg shadow-sm" : "text-fg-3 hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      title={hint}
      className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-[12.5px] text-fg-2 transition-colors hover:bg-panel-2 hover:text-fg disabled:pointer-events-none disabled:opacity-45"
    >
      <span className={`relative h-4 w-7 rounded-full transition-colors ${checked ? "bg-accent" : "bg-panel-3 ring-1 ring-line-2"}`}>
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full shadow transition-transform ${checked ? "translate-x-3 bg-accent-ink" : "bg-fg-3"}`}
        />
      </span>
      {label}
    </button>
  );
}

export function TimeAgo({ iso, className = "" }: { iso: string | null | undefined; className?: string }) {
  const now = useConsole((s) => s.now);
  const timeZone = useConsole((s) => s.timeZone);
  if (!iso) return <span className={className}>never</span>;
  return (
    <time dateTime={iso} title={formatDateTime(iso, timeZone)} className={`whitespace-nowrap ${className}`}>
      {timeAgo(iso, now)}
    </time>
  );
}

export function ExternalA({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`text-accent underline-offset-2 hover:underline ${className}`}>
      {children}
    </a>
  );
}

export function Panel({ title, meta, actions, children, className = "", bodyClassName = "" }: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`surface min-w-0 rounded-xl ${className}`}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="flex min-w-0 items-baseline gap-2">
            {title ? <h2 className="truncate text-[13px] font-semibold">{title}</h2> : null}
            {meta ? <span className="truncate text-[12px] text-fg-3">{meta}</span> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName || "p-4"}>{children}</div>
    </section>
  );
}
