import {
  Activity,
  BookOpen,
  Briefcase,
  Building2,
  LayoutGrid,
  MessagesSquare,
  Newspaper,
  Radio,
  Scale,
  Settings,
  Sparkles,
  Users,
  Waves,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import type { StreamId } from "@/lib/console/types";
import type { ViewId } from "./store";

/** A plain "in" drawn in the same line style as the other icons (the icon set has no brand logos). */
export function LinkedInIcon({ size = 24, strokeWidth = 2, className, ...rest }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={rest["aria-label"] ? undefined : true}
      {...rest}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 11v5" />
      <path d="M8 8v.01" />
      <path d="M12 16v-5" />
      <path d="M12 13.5a2.5 2.5 0 0 1 5 0V16" />
    </svg>
  );
}

/** Any icon the console draws: Lucide's, or the LinkedIn one above. */
export type IconComponent = ComponentType<LucideProps>;

// Streams are told apart by icon and label, never by color alone.
export const STREAM_ICONS: Record<StreamId, IconComponent> = {
  linkedin: LinkedInIcon,
  news: Newspaper,
  trade: Briefcase,
  legal: Scale,
  companies: Building2,
  research: BookOpen,
  social: MessagesSquare,
};

export const VIEW_ICONS: Record<ViewId, IconComponent> = {
  panel: LayoutGrid,
  brief: Sparkles,
  stream: Waves,
  linkedin: LinkedInIcon,
  people: Users,
  sources: Radio,
  health: Activity,
  settings: Settings,
};

/** The Radar mark: rings, a sweep that turns while a run is going, and a green dot for signal. */
export function RadarMark({ live = false, size = 22 }: { live?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} className="text-accent">
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="2.4" fill="var(--good-fill)" />
      </svg>
      <span
        className={`absolute inset-0 rounded-full ${live ? "animate-sweep" : ""}`}
        style={{
          background: "conic-gradient(from 0deg, transparent 0deg, transparent 290deg, var(--accent) 360deg)",
          opacity: live ? 0.55 : 0.22,
          maskImage: "radial-gradient(circle, black 62%, transparent 64%)",
          WebkitMaskImage: "radial-gradient(circle, black 62%, transparent 64%)",
        }}
      />
    </span>
  );
}
