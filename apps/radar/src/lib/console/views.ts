// The console's views, shared by the server page (to read ?view=) and the client.
export const VIEWS = [
  { id: "panel", label: "Panel", hint: "Every stream side by side" },
  { id: "brief", label: "Brief", hint: "The morning brief" },
  { id: "stream", label: "Stream", hint: "Everything, newest first" },
  { id: "linkedin", label: "LinkedIn", hint: "LinkedIn posts and the people behind them" },
  { id: "youtube", label: "YouTube", hint: "Videos and the people speaking in them" },
  { id: "people", label: "People", hint: "Who is behind the news" },
  { id: "sources", label: "Sources", hint: "Where stories start" },
  { id: "health", label: "Health", hint: "Runs, sources and spend" },
  { id: "settings", label: "Settings", hint: "Searches, feeds and filters" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

export const isView = (value: unknown): value is ViewId => VIEWS.some((v) => v.id === value);
