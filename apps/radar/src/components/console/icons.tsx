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
  type LucideIcon,
} from "lucide-react";
import type { StreamId } from "@/lib/console/types";
import type { ViewId } from "./store";

// Streams are told apart by icon and label, never by color alone.
export const STREAM_ICONS: Record<StreamId, LucideIcon> = {
  news: Newspaper,
  trade: Briefcase,
  legal: Scale,
  companies: Building2,
  research: BookOpen,
  social: MessagesSquare,
};

export const VIEW_ICONS: Record<ViewId, LucideIcon> = {
  panel: LayoutGrid,
  brief: Sparkles,
  stream: Waves,
  people: Users,
  sources: Radio,
  health: Activity,
  settings: Settings,
};

/** The Radar mark: rings and a sweep that turns while a run is going. */
export function RadarMark({ live = false, size = 22 }: { live?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size} height={size} className="text-accent">
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
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

/** A plain "in" mark for LinkedIn links (the icon set has no brand logos). */
export function LinkedInMark({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-[3px] border border-current font-sans leading-none font-bold"
      style={{ width: size, height: size, fontSize: size * 0.6 }}
    >
      in
    </span>
  );
}
