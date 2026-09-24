# Radar

- **Goal:** Find leads, Get insights, Always on
- **Status:** prototype
- **Owner:** Tanay

A morning brief for one market, built to find the original sources and the people behind the news, not just the headlines. The first topic is **AI liability insurance**: AI liability cover, AI exclusions and affirmative AI coverage, tech E&O, cyber and D&O as they apply to AI, the incidents and lawsuits that drive claims, and the regulation shaping the market.

## Hypothesis

If a tool reads every free source on a niche market each day and hands us the few stories that matter, traced back to where they started and who is behind them, we will spot accounts, partners and conversations weeks earlier than we would by scrolling LinkedIn and the trade press.

## Success metric

- We read it every morning instead of scrolling.
- At least 7 of the top 10 stories are worth our time.
- At least one action a week comes from it: a conversation, an intro, a post.
- It runs on free tiers, plus Claude at under $30 a month.

## How it works

1. **Collect** (twice a day). Google News searches, 46 verified feeds (trade press, law firms, press wires, regulators, AI incident trackers, newsletters, podcasts, and the companies writing AI cover), Hacker News, Reddit and GDELT. Optional: X through the official API, and Serper for Google News publisher links and public LinkedIn posts.
2. **Clean.** Keyword rules drop off-topic items from general sources. Duplicates are removed by URL and by headline plus outlet.
3. **Judge.** Claude scores each item from 0 to 100, decides whether it is the origin or an echo of something else, and pulls out the people and organizations in it.
4. **Read.** For the most relevant items, Radar resolves Google News links to the publisher, reads the article, and extracts the primary sources it relies on (reports, filings, policy wordings), plus quotes and roles.
5. **Brief** (each morning). Claude groups the day's items into stories, each led by its origin, with every outlet that echoed it.
6. **Learn.** The People and Sources pages build up over time. Following a source makes the next run collect from it directly, so coverage compounds.

## Pages

| Page | What it shows |
| --- | --- |
| Brief | Today's stories, origin first, with primary sources, echoes, and the people and organizations involved. Without an API key it lists everything collected. |
| People | Everyone found: role, organization, how often and where they appear, with quotes. Organizations are on a second tab. |
| Sources | Every outlet, feed, account and community, ranked by how often it is the origin. Follow one to collect from it directly. |
| Feed | Every collected item, filterable by source and relevance. |
| Topics | Run buttons, source health, spend against caps, run history, feeds, and the topic's settings. |

## Run it locally

```bash
cd apps/radar
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY to turn on the AI steps
npm run radar -- collect     # pull from every source into the local database
npm run radar -- run         # collect, score, read and write the brief
npm run dev                  # http://localhost:3000
```

Local runs use an embedded Postgres (PGlite) stored in `.data/`, so there is no database to set up. Leave `RADAR_PASSWORD` empty locally to skip sign-in.

## Deploy on Vercel's free plan

1. Import the repo in Vercel and set **Root Directory** to `apps/radar`.
2. Under **Storage**, add a Neon Postgres database (free tier). It sets `DATABASE_URL`.
3. Add environment variables: `RADAR_PASSWORD`, `CRON_SECRET` (any long random string) and `ANTHROPIC_API_KEY`. Optional: `X_BEARER_TOKEN`, `SERPER_API_KEY`. See `.env.example` for the rest.
4. Deploy. The build applies database migrations, and `vercel.json` schedules the runs.

| Job | UTC | Pacific (daylight time) |
| --- | --- | --- |
| Collect | 02:00 and 11:00 | 7pm and 4am |
| Score and read | 03:00 and 12:00 | 8pm and 5am |
| Write the brief | 13:00 | 6am |

The free plan runs each job once a day and may start it anywhere within the hour, so the brief is ready by about 7am Pacific. Vercel's free plan is meant for non-commercial use. That is fine for this experiment; if the team comes to rely on Radar, move to Pro ($20 a month) with no code changes.

## Costs

| Piece | Cost |
| --- | --- |
| Vercel, Neon, Google News, feeds, Hacker News, Reddit RSS, GDELT | Free |
| Claude (`claude-opus-5` by default) | Pay as you go. Expect roughly $15 to $45 a month for this topic. Radar stops calling Claude at `RADAR_AI_MONTHLY_BUDGET_USD` (default $30). `RADAR_MODEL` switches to a cheaper Claude model. |
| X API (optional) | Pay per use, $0.005 per post read. Radar stops at `X_MONTHLY_BUDGET_USD` (default $10). |
| Serper (optional) | 2,500 free searches. Radar stops at `SERPER_MONTHLY_QUERIES` a month (default 300). |

The Topics page shows this month's spend against each cap.

## Configuration

Each topic's settings live in the database and are editable on the Topics page:

- **Description:** Claude reads it to judge relevance.
- **Keyword groups:** filter general feeds. Every group needs a match, and a trailing `*` matches word prefixes.
- **Searches:** one set per source.
- **Feeds:** "filter": false keeps every item from a feed that is already on-topic.
- **Watchlist:** organizations and people Claude should always extract.

The defaults are in `src/lib/topics/defaults.ts`, and **Reset to defaults** restores them.

## Ground rules

- Radar stores headlines, short snippets, its own summaries and links. It does not keep full articles.
- It reads public pages only, never logs in to LinkedIn or X, and uses official APIs wherever one exists.
- Requests go out with a generic user agent that carries no names or emails.
- Google News RSS is licensed for personal use. Treat it as a prototyping source. For production, add `SERPER_API_KEY`, which returns the same results with publisher links.

## Code map

| Path | Contents |
| --- | --- |
| `src/lib/sources/` | One file per source, plus feed parsing and feed discovery |
| `src/lib/pipeline/` | Collect, enrich (score and read), brief, and run bookkeeping |
| `src/lib/ai/` | Claude client with budget and refusal handling, prompts, output schemas |
| `src/lib/topics/` | Topic settings, defaults and storage |
| `src/db/` | Schema (Drizzle) and the Neon or PGlite client |
| `src/app/` | Pages, server actions, and the scheduled-run endpoint |
| `scripts/` | Database migrations and the local runner |

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

## Learnings

- **Keyword filter placement.** Topic searches should skip the keyword filter. The search query already scoped them, and headlines alone miss relevant stories such as "Beazley launches new cyber endorsements to cover firms' internal AI use". General feeds and `site:` searches do need the filter.
- **Rate limits.** GDELT and Reddit throttle shared cloud IP addresses. Both fail softly and show up in source health.
- **Outlets with no usable feed.** Some outlets block automated feed readers (Reinsurance News) or have no feed at all (The Insurer, Insurance Insider). Google News `site:` searches cover them.
- **Google News links.** They have to be decoded to reach the publisher, so Radar only decodes the items it reads in full.

## Next

- Slack delivery of the morning brief.
- Instant alerts when a watched company or person shows up.
- Ranking by acceleration: stories getting more mentions than usual.
- Watchlists pulled from the CRM.
- A per-topic schedule for each timezone (needs Vercel Pro or a scheduler such as Trigger.dev).
