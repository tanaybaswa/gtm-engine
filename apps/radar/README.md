# Radar

- **Goal:** Find leads, Get insights, Always on
- **Status:** prototype
- **Owner:** Tanay

A live console for the markets we sell into: every source side by side, and a morning brief built to find the original sources and the people behind the news, not just the headlines. Track as many topics as you like; describe a new one in plain words and Claude sets it up. The first topic is **AI liability insurance**: AI liability cover, AI exclusions and affirmative AI coverage, tech E&O, cyber and D&O as they apply to AI, the incidents and lawsuits that drive claims, and the regulation shaping the market.

## Hypothesis

If a tool reads every free source on a niche market each day and hands us the few stories that matter, traced back to where they started and who is behind them, we will spot accounts, partners and conversations weeks earlier than we would by scrolling LinkedIn and the trade press.

## Success metric

- We read it every morning instead of scrolling.
- At least 7 of the top 10 stories are worth our time.
- At least one action a week comes from it: a conversation, an intro, a post.
- It runs on free tiers, plus Claude at under $30 a month.

## How it works

1. **Collect** (twice a day, for every active topic). Google News searches, 46 verified feeds (trade press, law firms, press wires, regulators, AI incident trackers, newsletters, podcasts, and the companies writing AI cover), Hacker News, Reddit and GDELT. Optional: X through the official API, and Serper for Google News publisher links and for LinkedIn: public posts, articles, hashtags and people.
2. **Clean.** Keyword rules drop off-topic items from general sources. Duplicates are removed by URL and by headline plus outlet.
3. **Judge.** Claude scores each item from 0 to 100, decides whether it is the origin or an echo of something else, and pulls out the people and organizations in it.
4. **Read.** For the most relevant items, Radar resolves Google News links to the publisher, reads the article, and extracts the primary sources it relies on (reports, filings, policy wordings), plus quotes and roles.
5. **Brief** (each morning). Claude groups the day's items into stories, each led by its origin, with every outlet that echoed it.
6. **Learn.** People and Sources build up over time. Following a source makes the next run collect from it directly, so coverage compounds.

## The console

One screen, one topic at a time, with every topic in the rail on the left. Views switch instantly because each topic's data arrives in one piece and stays in the browser.

| View | What it shows |
| --- | --- |
| Panel | The viewing panel: live stats with 14-day trends, today's brief, and one column per stream (news, LinkedIn, trade press, legal and regulatory, companies and wires, research and newsletters, social and community). |
| Brief | Today's stories, origin first, with primary sources, echoes, and the people and organizations involved. Earlier briefs are one click away. |
| Stream | Everything in one list, newest or most relevant first, filtered by stream or to origins only. |
| LinkedIn | Only LinkedIn: posts and articles with their hashtags, and the people behind them. |
| People | Everyone found: role, organization, how they appear (quoted, author, posted), with their quotes. Organizations are on a second tab. Star someone to watch them. |
| Sources | Every outlet, feed, account and community, ranked by how often it is the origin. Follow one to collect from it directly. |
| Health | Run buttons with live progress, source health, spend against caps, the schedule, and run history. |
| Settings | The topic's searches, feeds, filters, watchlist and how Claude judges items, all editable. Archive a topic here. |

Clicking anything opens its details on the right: an item's summary and primary sources, a story's echoes, a person's quotes, a source's recent items.

The top bar filters every view (search, time range, signal only), and **Run now** starts a run you can watch step by step.

| Keys | Action |
| --- | --- |
| ⌘K or Ctrl+K | Search items, people and sources, or run a command |
| / | Filter the current view |
| 1 to 8 | Switch views |
| [ and ] | Previous or next topic |
| j, k, Enter, o | Move through the stream, open details, open the original |
| ? | All shortcuts |

### New topics

Press **New** in the rail, name the topic and describe what to track. Claude designs the Google News, Reddit, Hacker News, GDELT, X and LinkedIn searches, the keyword filters, a watchlist, a scoring guide written for the topic, and a list of feeds; each feed is checked live and dropped if it doesn't answer. The topic is saved and its first run starts right away. It costs about $0.10 of Claude. Without an API key the topic starts with a plain search for its name.

### LinkedIn

With `SERPER_API_KEY` set, Radar finds public LinkedIn posts, articles and people through Google, using Serper. It never logs in to LinkedIn or opens linkedin.com; it keeps what Google shows (title, snippet and link).

- **Posts and articles:** one quoted phrase per search works best, like `"AI liability"`; Radar adds `site:linkedin.com/posts`. Start a search with `site:linkedin.com/pulse` for articles. Posts older than three weeks are dropped. A post's link carries the time it was posted, so dates are exact.
- **Hashtags:** each one is searched on LinkedIn, and on X when X is on.
- **People searches:** phrases people put in their headline or About, like `"AI insurance"`; Radar adds `site:linkedin.com/in`.
- **People from the news:** each run looks up a few people who were quoted, wrote or posted. A profile only counts when the name matches and their organization shows on it, so namesakes are skipped.

Posts, hashtags and Serper news searches run once a day, people searches once a week. The **LinkedIn** view has the posts on the left, with hashtag and account filters, and the people on the right: who posted, who was matched from the news, and who turned up in a people search. Click someone to see all their posts. New posts show under Signal until Claude has scored them.

Settings, under LinkedIn, shows what each search found last time. Serper's free plan returns at most 10 results a search and refuses some complex searches; Radar then runs a simpler form and says so under the search. Topics created before people searches and hashtags existed get a few, taken from their LinkedIn searches.

### Why it's fast

- Each topic's whole console (items, stories, people, sources, runs, spend) is one payload in Next.js's data cache, so pages and topic switches rarely wait on the database.
- Views are client-side and stay mounted, so switching takes a frame. Other topics load in the background after the first screen.
- The browser polls a small status endpoint: every 2.5 seconds during a run, every 30 seconds otherwise. When a run step finishes or someone edits a setting, open consoles fetch fresh data.
- `/api/health` checks, without signing in, that the database answers (with latency and regions), that the console's data can be read, which optional services are on, and how the last scheduled run and each source did. It returns only statuses, counts and timings.

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
4. Deploy. The build applies database migrations, and `vercel.json` schedules the runs. Each scheduled call runs every active topic, sharing its five minutes among them.

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
| Claude (`claude-opus-5` by default) | Pay as you go. The first live run (113 items scored, 10 articles read, one brief) cost $0.59, so expect roughly $10 to $20 a month for this topic. Radar stops calling Claude at `RADAR_AI_MONTHLY_BUDGET_USD` (default $30). `RADAR_MODEL` switches to a cheaper Claude model. |
| X API (optional) | Pay per use, $0.005 per post read. Radar stops at `X_MONTHLY_BUDGET_USD` (default $10). |
| Serper (optional) | 2,500 free searches. One topic's news, LinkedIn and people searches use about 450 a month. Radar stops at `SERPER_MONTHLY_QUERIES` a month (default 500), shared by all topics. |

The Health view shows this month's spend against each cap.

## Configuration

Each topic's settings live in the database and are editable in Settings:

- **Description:** Claude reads it to judge relevance.
- **How Claude judges items:** who reads the brief, what scores high or low, and which organizations matter. Left empty, the topic's defaults (or a general guide) apply.
- **Keyword groups:** filter general feeds. Every group needs a match, and a trailing `*` matches word prefixes.
- **Searches:** one set per source, plus LinkedIn posts, hashtags and people searches.
- **Feeds:** "filter": false keeps every item from a feed that is already on-topic.
- **Watchlist:** organizations and people Claude should always extract.

The defaults are in `src/lib/topics/defaults.ts`, and **Reset to defaults** restores them.

## Ground rules

- Radar stores headlines, short snippets, its own summaries and links. It does not keep full articles.
- It reads public pages only, never logs in to LinkedIn or X, and uses official APIs wherever one exists. LinkedIn results come from Google; Radar doesn't open linkedin.com.
- Requests go out with a generic user agent that carries no names or emails.
- Google News RSS is licensed for personal use. Treat it as a prototyping source. For production, add `SERPER_API_KEY`, which returns the same results with publisher links.

## Code map

| Path | Contents |
| --- | --- |
| `src/lib/sources/` | One file per source, plus feed parsing, feed discovery, the Serper client and LinkedIn result parsing |
| `src/lib/pipeline/` | Collect, LinkedIn people, enrich (score and read), brief, and run bookkeeping |
| `src/lib/ai/` | Claude client with budget and refusal handling, prompts, output schemas |
| `src/lib/topics/` | Topic settings, defaults, storage, and Claude's design for new topics |
| `src/lib/console/` | The cached per-topic payload, live status, and change tracking |
| `src/components/console/` | The console: store, views, drawer, command palette, new-topic dialog |
| `src/db/` | Schema (Drizzle) and the Neon or PGlite client |
| `src/app/` | The console page, server actions, and the API routes (console data, status, health, scheduled runs) |
| `scripts/` | Database migrations and the local runner |

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

## Learnings

- **Keyword filter placement.** Topic searches should skip the keyword filter. The search query already scoped them, and headlines alone miss relevant stories such as "Beazley launches new cyber endorsements to cover firms' internal AI use". General feeds and `site:` searches do need the filter.
- **Rate limits.** GDELT and Reddit throttle shared cloud IP addresses. Both fail softly and show up in source health.
- **Outlets with no usable feed.** Some outlets block automated feed readers (Reinsurance News) or have no feed at all (The Insurer, Insurance Insider). Google News `site:` searches cover them.
- **Google News links.** They have to be decoded to reach the publisher, so Radar only decodes the items it reads in full.
- **First live run** (Sep 28). Claude scored 113 items (37 relevant), read 10 articles and wrote a 4-story brief for $0.59. Fixes that came out of it: a story leads with the item judged to be the origin when Claude names none; story people are picked by Claude from people who were quoted, wrote or posted; people only name-checked in passing are hidden from the directory by default.
- **Speed** (Sep 29). The first version rendered every page on the server, with five to eight database round trips to a Neon database that sleeps when idle, so each tab took seconds. The console now serves one cached payload per topic and switches views in the browser: 20 to 60 ms per view and about 15 ms per topic in local tests.
- **Serper's free plan** (Sep 29). It refuses searches that ask for 20 results ("Query pattern not allowed for free accounts"); 10 works. Refusals cost nothing, so Radar retries in simpler forms. The first real collection found 66 LinkedIn posts and articles and 20 people from three people searches.
- **LinkedIn titles.** Google shows posts in half a dozen shapes ("Name's Post", "Title | Name", hashtags only, a byline cut short), so a name is only kept when it matches the handle in the link. Matching people by name alone once picked a namesake for the FTC chair, so a match now also needs their organization on the profile.
- **Paywalls and roundups.** Paywalled articles (The Insurer) can't be read in full, so their people only come from the headline. Roundup articles quote big names about unrelated news, which can put them on a story.

## Next

- Slack delivery of the morning brief, per topic.
- Instant alerts when a watched company or person shows up.
- Ranking by acceleration: stories getting more mentions than usual.
- Watchlists pulled from the CRM.
- A per-topic schedule for each timezone (needs Vercel Pro or a scheduler such as Trigger.dev).
