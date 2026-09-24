import type { Topic } from "@/db/schema";

/** Shared system prompt. Stable per topic, so it is cached across calls in a run. */
export function analystSystemPrompt(topic: Topic): string {
  const watch = topic.config.watch;
  const watchLine =
    watch.orgs.length || watch.people.length
      ? `\nWatchlist: the team tracks these, so always extract them when an item names them. ${[...watch.orgs, ...watch.people].join(", ")}.`
      : "";
  return `You are the research analyst behind Radar, an internal market-intelligence tool for a go-to-market team.

Topic: ${topic.name}
${topic.description}${watchLine}

The team's goal is to find the original sources and the people behind this topic, not just the headlines.

Relevance, 0 to 100:
- 80-100: directly about insuring or transferring AI risk: AI liability products and launches, affirmative AI cover or AI exclusions, tech E&O or cyber wordings that address AI, underwriting AI systems, AI warranties and performance guarantees, capacity, pricing, claims or losses involving AI.
- 55-79: closely adjacent and useful: AI incidents, litigation or regulation that creates liability exposure; research that quantifies AI risk; insurers' AI governance when it concerns liability or regulation; people moves at AI insurance players.
- 20-54: loosely related: AI used inside insurance operations (claims automation, underwriting productivity) with no liability or risk-transfer angle; general AI regulation with no insurance angle.
- 0-19: off-topic, spam, consumer insurance quotes, or pages that are not news or commentary.

Origin versus echo: isOrigin is true when the item is the primary source itself: an organization's own announcement or report, a regulator's publication, a court filing, original reporting that adds new facts, or a first-person post by someone involved. It is false when the item summarizes or reacts to something published elsewhere; then originHint names that original (publisher, document, and date when known).

People: include only real, named individuals who appear in the item, as author, quoted, mentioned or poster. Give role and organization only when the item states them; never guess. Skip generic bylines such as "Staff" and famous people mentioned only in passing.

Organizations: include insurers, reinsurers, MGAs, Lloyd's syndicates, brokers, insurtechs, AI companies, regulators, standards bodies, law firms and research groups that matter to the item. Skip the publisher unless it is itself the subject.

Style: plain, factual sentences. No hype. Do not use em dashes.`;
}

type TriageInput = {
  id: number;
  source: string;
  outlet: string | null;
  title: string;
  snippet: string | null;
  author: string | null;
  publishedAt: Date | null;
};

export function triagePrompt(items: TriageInput[]): string {
  const lines = items.map((item) =>
    JSON.stringify({
      id: item.id,
      source: item.source,
      outlet: item.outlet,
      author: item.author,
      published: item.publishedAt?.toISOString().slice(0, 10) ?? null,
      title: item.title,
      snippet: item.snippet?.slice(0, 500) ?? null,
    }),
  );
  return `Score each of these ${items.length} items for the topic. Return exactly one entry per id, with a one-sentence gist. Only list people and organizations for items scoring 55 or higher.

${lines.join("\n")}`;
}

export function extractPrompt(input: {
  title: string;
  outlet: string | null;
  url: string;
  publishedAt: Date | null;
  text: string;
  truncated: boolean;
  links: { text: string; href: string }[];
}): string {
  const links = input.links.length
    ? `\n\nLinks inside the article (use these URLs for primary sources when they match):\n${input.links.map((l) => `- ${l.text}: ${l.href}`).join("\n")}`
    : "";
  return `Read this article and extract what the team needs.

- summary: two or three sentences on what happened.
- whyItMatters: one sentence on why it matters to a team selling into the AI liability insurance market.
- isOrigin: whether this article is itself the primary source.
- primarySources: the documents or announcements this article is based on (reports, filings, regulations, policy wordings, press releases, studies, court cases, statements or posts), with their URL when the article links to them. Empty if the article is itself the only source.
- people: every named person with their role and organization as stated, how they appear, and their most useful quote (25 words or fewer) if quoted.
- orgs: organizations that matter to the story.

Title: ${input.title}
Outlet: ${input.outlet ?? "unknown"}
URL: ${input.url}
Published: ${input.publishedAt?.toISOString().slice(0, 10) ?? "unknown"}
${input.truncated ? "Note: the article text below was shortened to fit.\n" : ""}
Article text:
${input.text}${links}`;
}

type BriefInput = {
  id: number;
  title: string;
  outlet: string | null;
  publishedAt: Date | null;
  relevance: number | null;
  isOrigin: boolean | null;
  originHint: string | null;
  summary: string | null;
  people: string[];
};

export function briefPrompt(date: string, items: BriefInput[]): string {
  const lines = items.map((item) =>
    JSON.stringify({
      id: item.id,
      title: item.title,
      outlet: item.outlet,
      published: item.publishedAt?.toISOString().slice(0, 10) ?? null,
      relevance: item.relevance,
      isOrigin: item.isOrigin,
      originHint: item.originHint,
      summary: item.summary,
      people: item.people,
    }),
  );
  return `Write the brief for ${date} from these relevant items.

Group items about the same development into one story, and order stories by how much they matter to a team selling into this market. For each story:
- title: 12 words or fewer.
- summary: two or three sentences.
- whyItMatters: one sentence.
- originItemId: the id of the item that is the original source, or null if none of them is.
- itemIds: every item in the story, origin first.
- people and orgs: the names that matter in this story.

At most 8 stories. Leave out weak or repetitive items rather than padding.

${lines.join("\n")}`;
}
