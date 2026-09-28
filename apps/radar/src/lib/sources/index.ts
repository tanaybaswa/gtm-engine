import { gdelt } from "./gdelt";
import { googleNews } from "./googleNews";
import { hackerNews } from "./hackerNews";
import { reddit } from "./reddit";
import { rss } from "./rss";
import { serper } from "./serper";
import type { Connector } from "./types";
import { x } from "./x";

export const connectors: Connector[] = [googleNews, gdelt, rss, hackerNews, reddit, serper, x];

export function connectorLabel(id: string): string {
  if (id === "linkedin") return "LinkedIn";
  return connectors.find((c) => c.id === id)?.label ?? id;
}

export type { Connector, RawItem, SourceId } from "./types";
