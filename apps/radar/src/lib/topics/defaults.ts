import type { FeedConfig, TopicConfig } from "./types";

export type TopicSeed = {
  slug: string;
  name: string;
  description: string;
  config: TopicConfig;
};

// Feeds verified live on 2026-09-24. "filter: false" marks feeds that are already about
// AI and insurance, so every item is kept; general feeds only keep keyword matches.
const feeds: FeedConfig[] = [
  // Insurance trade press
  { name: "Insurance Journal", url: "https://www.insurancejournal.com/feed/", kind: "trade_press", filter: true },
  { name: "Insurance Journal: AI", url: "https://www.insurancejournal.com/topics/artificial-intelligence/feed/", kind: "trade_press", filter: false },
  { name: "Carrier Management: AI", url: "https://www.carriermanagement.com/tag/artificial-intelligence/feed/", kind: "trade_press", filter: false },
  { name: "Claims Journal: AI", url: "https://www.claimsjournal.com/topics/artificial-intelligence/feed/", kind: "trade_press", filter: false },
  { name: "Reinsurance News", url: "https://www.reinsurancene.ws/feed/", kind: "trade_press", filter: true },
  { name: "Artemis", url: "https://www.artemis.bm/feed/", kind: "trade_press", filter: true },
  { name: "Insurance Business US", url: "https://www.insurancebusinessmag.com/us/rss/", kind: "trade_press", filter: true },
  { name: "Risk & Insurance", url: "https://riskandinsurance.com/feed/", kind: "trade_press", filter: true },
  { name: "Business Insurance", url: "https://www.businessinsurance.com/feed/", kind: "trade_press", filter: true },
  { name: "Digital Insurance", url: "https://www.dig-in.com/feed?rss=true", kind: "trade_press", filter: true },
  { name: "Commercial Risk", url: "https://www.commercialriskonline.com/feed/", kind: "trade_press", filter: true },
  { name: "Insurance Day", url: "https://www.insuranceday.com/rss/insuranceday-all", kind: "trade_press", filter: true },
  // Legal commentary
  { name: "JD Supra: Insurance", url: "https://www.jdsupra.com/resources/syndication/docsRSSfeed.aspx?ftype=Insurance", kind: "law_firm", filter: true },
  { name: "JD Supra: Technology", url: "https://www.jdsupra.com/resources/syndication/docsRSSfeed.aspx?ftype=ScienceComputersTechnology", kind: "law_firm", filter: true },
  { name: "The D&O Diary: AI", url: "https://www.dandodiary.com/articles/artificial-intelligence/feed/", kind: "law_firm", filter: false },
  { name: "Hunton Insurance Recovery Blog", url: "https://www.hunton.com/hunton-insurance-recovery-blog/?rss", kind: "law_firm", filter: true },
  { name: "Pillsbury Policyholder Pulse", url: "https://www.policyholderpulse.com/feed/", kind: "law_firm", filter: true },
  { name: "Covington Inside Global Tech", url: "https://www.insideglobaltech.com/feed/", kind: "law_firm", filter: true },
  { name: "Debevoise Data Blog", url: "https://www.debevoisedatablog.com/feed/", kind: "law_firm", filter: true },
  { name: "ChatGPT Is Eating the World", url: "https://chatgptiseatingtheworld.com/feed/", kind: "blog", filter: true },
  // Press-release wires (insurance industry)
  { name: "Business Wire: Insurance", url: "https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeGFNTWA==", kind: "wire", filter: true },
  { name: "PR Newswire: Insurance", url: "https://www.prnewswire.com/rss/financial-services-latest-news/insurance-list.rss", kind: "wire", filter: true },
  { name: "GlobeNewswire: Insurance", url: "https://www.globenewswire.com/RssFeed/industry/8500-Insurance", kind: "wire", filter: true },
  // Regulators
  { name: "EIOPA", url: "https://www.eiopa.europa.eu/node/4816/rss_en", kind: "regulator", filter: true },
  { name: "UK FCA", url: "https://www.fca.org.uk/news/rss.xml", kind: "regulator", filter: true },
  { name: "Bank of England: PRA", url: "https://www.bankofengland.co.uk/rss/prudential-regulation-publications", kind: "regulator", filter: true },
  { name: "EU Digital Strategy (AI Office)", url: "https://digital-strategy.ec.europa.eu/en/rss.xml", kind: "regulator", filter: true },
  { name: "Texas DOI: News", url: "https://www.tdi.texas.gov/news/index.rss", kind: "regulator", filter: true },
  { name: "Texas DOI: Bulletins", url: "https://www.tdi.texas.gov/bulletins/index.rss", kind: "regulator", filter: true },
  // AI risk and incidents
  { name: "AI Incident Database", url: "https://incidentdatabase.ai/rss.xml", kind: "research", filter: false },
  { name: "OECD.AI", url: "https://wp.oecd.ai/feed/", kind: "research", filter: true },
  { name: "AI Safety Newsletter", url: "https://newsletter.safe.ai/feed", kind: "newsletter", filter: true },
  { name: "Transformer", url: "https://www.transformernews.ai/feed", kind: "newsletter", filter: true },
  { name: "EU AI Act Newsletter", url: "https://artificialintelligenceact.substack.com/feed", kind: "newsletter", filter: true },
  { name: "Geneva Association", url: "https://www.genevaassociation.org/rss.xml", kind: "research", filter: true },
  // Newsletters
  { name: "The Weekly Dose of Risk", url: "https://overlookvc.substack.com/feed", kind: "newsletter", filter: true },
  { name: "P&C Insurance Executive Intelligence", url: "https://insuranceintel.substack.com/feed", kind: "newsletter", filter: true },
  { name: "InsurTech Weekly", url: "https://fgtrends.substack.com/feed", kind: "newsletter", filter: true },
  // Podcasts
  { name: "Insurance Covered (RPC)", url: "https://feeds.acast.com/public/shows/insurance-covered", kind: "podcast", filter: true },
  { name: "INsight (Insurance News)", url: "https://feeds.blubrry.com/feeds/1448930.xml", kind: "podcast", filter: true },
  { name: "Insurance Insider: Behind the Headlines", url: "https://rss.buzzsprout.com/2317674.rss", kind: "podcast", filter: true },
  { name: "InsTech", url: "https://feed.podbean.com/instechlondon/feed.xml", kind: "podcast", filter: true },
  // Companies writing AI cover
  { name: "CFC", url: "https://www.cfc.com/en-us/rss/", kind: "company", filter: true },
  { name: "Relm Insurance", url: "https://relminsurance.com/feed/", kind: "company", filter: true },
  { name: "Vouch", url: "https://www.vouch.us/blog/rss.xml", kind: "company", filter: true },
  { name: "Coalition", url: "https://www.coalitioninc.com/rss.xml", kind: "company", filter: true },
];

// The first topic. Everything here is editable from the Topics page.
export const aiLiabilityInsurance: TopicSeed = {
  slug: "ai-liability-insurance",
  name: "AI liability insurance",
  description:
    "Insurance and risk transfer for AI: AI liability cover, AI performance guarantees and " +
    "warranties, affirmative AI coverage and AI exclusions (silent AI), tech E&O, cyber and D&O as " +
    "they apply to AI, AI incidents and litigation that drive claims, and regulation that shapes the " +
    "market (EU AI Act, EIOPA, NAIC AI bulletin, state laws). Goal: find the original sources and " +
    "the people behind them, not just the headlines.",
  config: {
    keywords: {
      groups: [
        [
          "AI",
          "A.I.",
          "artificial intelligence",
          "machine learning",
          "LLM*",
          "large language model*",
          "generative",
          "GenAI",
          "agentic",
          "AI agent*",
          "chatbot*",
          "deepfake*",
          "algorithm*",
          "autonomous",
          "foundation model*",
        ],
        [
          "insur*",
          "reinsur*",
          "underwrit*",
          "liabilit*",
          "liable",
          "E&O",
          "D&O",
          "errors and omissions",
          "errors & omissions",
          "cover*",
          "endorsement*",
          "cyber",
          "surplus lines",
          "exclusion*",
          "indemn*",
          "warranty",
          "warranties",
          "risk transfer",
          "Lloyd's",
          "broker*",
          "MGA*",
          "policyholder*",
          "actuar*",
          "litigation",
          "lawsuit*",
        ],
      ],
      exclude: [
        "car insurance quote*",
        "auto insurance quote*",
        "cheap car insurance",
        "cheap insurance",
        "insurance quotes near me",
        "compare quotes",
        "insurance leads",
        "life insurance quote*",
        "pet insurance",
        "AIA Group",
        "Ai Group",
        "Air India",
        "AI171",
      ],
    },
    queries: {
      googleNews: [
        '"AI liability" (insurance OR insurer OR underwriting) -"car insurance" -quote',
        '("silent AI" OR "AI exclusion" OR "generative AI exclusion" OR "affirmative AI") insurance',
        '("AI-related securities" OR "AI washing" OR "chatbot lawsuit" OR "AI hallucination") (insurer OR D&O OR coverage)',
        '"AI insurance" (liability OR coverage OR underwriting)',
        '"artificial intelligence" "errors and omissions"',
        '"tech E&O" AI',
        '"AI warranty" OR "AI performance guarantee" OR aiSure',
        'insurers "AI risk" coverage',
        // Outlets without a usable feed, and bodies we can only reach through search.
        "site:insuranceinsider.com AI",
        "site:reinsurancene.ws AI",
        "site:theinsurer.com AI",
        "site:propertycasualty360.com AI (liability OR exclusion OR coverage)",
        "site:intelligentinsurer.com AI",
        "site:coverager.com AI",
        "site:naic.org AI",
        "site:lloyds.com AI",
      ],
      gdelt: ['("silent AI" OR "AI exclusion" OR "AI liability insurance" OR "affirmative AI")', '"AI liability" insurance'],
      hackerNews: ['"AI insurance"', '"AI liability"', '"insure AI"'],
      reddit: {
        search: ['"AI liability" OR "AI insurance" OR "silent AI"'],
        subreddits: ["Insurance", "InsuranceProfessional", "insurtech", "AI_Governance"],
      },
      x: {
        search: [
          '("silent AI" OR "AI exclusion" OR "AI liability" OR "affirmative AI" OR aiSure OR "AIUC-1") (insurance OR insurer OR underwriting OR Lloyd\'s) -"car insurance" -quote -is:retweet lang:en',
        ],
        accounts: [],
      },
      // Serper's free plan refuses some complex searches, so these stay simple: one phrase each.
      serper: {
        news: ["AI liability insurance", '"affirmative AI" insurance'],
        linkedin: ['"AI liability"', '"AI insurance"', '"silent AI"', '"affirmative AI"', 'site:linkedin.com/pulse "AI liability"'],
        profiles: ['"AI liability"', '"AI insurance"', '"affirmative AI"'],
      },
      hashtags: ["AIinsurance", "AIliability", "silentAI"],
    },
    feeds,
    watch: {
      orgs: [
        "Armilla AI",
        "Chaucer",
        "Munich Re",
        "HSB",
        "AIUC",
        "Testudo",
        "CFC",
        "Relm Insurance",
        "Vouch",
        "Coalition",
        "AXA XL",
        "Beazley",
        "W. R. Berkley",
        "AIG",
        "Great American",
        "Verisk",
        "Gallagher Re",
        "Aon",
        "Marsh",
        "Lloyd's",
        "NAIC",
        "EIOPA",
        "IAIS",
        "Geneva Association",
      ],
      people: [
        "Karthik Ramakrishnan",
        "Michael Berger",
        "Rune Kvist",
        "Rajiv Dattani",
        "George Lewin-Smith",
        "Kevin Kalinich",
        "Jaymin Kim",
        "Ed Pocock",
        "Nick Line",
        "Anat Lior",
        "Kevin LaCroix",
        "Michael S. Levine",
        "Geoffrey B. Fehling",
        "Gregory C. Allen",
        "Risto Uuk",
      ],
    },
    guide: {
      relevance: [
        "80-100: directly about insuring or transferring AI risk: AI liability products and launches, affirmative AI cover or AI exclusions, tech E&O or cyber wordings that address AI, underwriting AI systems, AI warranties and performance guarantees, capacity, pricing, claims or losses involving AI.",
        "55-79: closely adjacent and useful: AI incidents, litigation or regulation that creates liability exposure; research that quantifies AI risk; insurers' AI governance when it concerns liability or regulation; people moves at AI insurance players.",
        "20-54: loosely related: AI used inside insurance operations (claims automation, underwriting productivity) with no liability or risk-transfer angle; general AI regulation with no insurance angle.",
        "0-19: off-topic, spam, consumer insurance quotes, or pages that are not news or commentary.",
      ].join("\n"),
      audience: "a go-to-market team selling into the AI liability insurance market",
      orgs: "insurers, reinsurers, MGAs, Lloyd's syndicates, brokers, insurtechs, AI companies, regulators, standards bodies, law firms and research groups",
    },
    lookbackHours: 36,
    relevanceThreshold: 55,
  },
};

export const defaultTopics: TopicSeed[] = [aiLiabilityInsurance];
