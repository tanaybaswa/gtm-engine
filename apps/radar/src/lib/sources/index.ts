import { gdelt } from "./gdelt";
import { googleNews } from "./googleNews";
import { hackerNews } from "./hackerNews";
import { reddit } from "./reddit";
import { rss } from "./rss";
import { serper } from "./serper";
import type { Connector } from "./types";
import { x } from "./x";
import { youtube } from "./youtube";

export const connectors: Connector[] = [googleNews, gdelt, rss, hackerNews, reddit, serper, youtube, x];

export function connectorLabel(id: string): string {
  if (id === "linkedin") return "LinkedIn";
  return connectors.find((c) => c.id === id)?.label ?? id;
}

export type { Connector, RawItem, SourceId } from "./types";
