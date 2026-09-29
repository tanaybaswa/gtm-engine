import { describe, expect, it } from "vitest";
import { linkedInItems } from "./serper";
import {
  activityTime,
  hashtagQuery,
  hashtagsIn,
  linkedInQuery,
  linkedInVanity,
  parseLinkedInPost,
  parseLinkedInProfile,
  sameName,
  simplerQuery,
} from "./linkedin";

// Titles, links and snippets below are real Google results (through Serper), Sep 2026.
describe("parseLinkedInPost", () => {
  it("reads 'headline | Name' titles, checking the name against the account", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/ryan-calo-13b48327b_ai-leaders-are-standing-on-a-liability-landmine-activity-7508217125774249984-2l8Z",
      "AI Leaders Are Standing On a Liability Landmine | Ryan Calo",
      "AI liability isn't abstract for companies it's in The Wall Street Journal as a headline and insurance for AI is necessary now.",
    );
    expect(post).toMatchObject({ vanity: "ryan-calo-13b48327b", name: "Ryan Calo", org: false, kind: "post" });
    expect(post.text).toBe("AI Leaders Are Standing On a Liability Landmine");
  });

  it("drops credentials and trailing ellipses from names", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/deeann-kelly-sphr_the-efficiency-tool-that-became-a-liability-activity-7508873807508533248-31uC",
      "AI Liability Risks in Legal Practice | DeeAnn Kelly, SHRM- ...",
      "AI Liability Risks in Legal Practice. View profile for DeeAnn Kelly, SHRM-SCP. DeeAnn Kelly, SHRM-SCP. Human Resources M&A Integration Leader. 2d.",
    );
    expect(post.name).toBe("DeeAnn Kelly");
    expect(post.text).toBe("AI Liability Risks in Legal Practice");
  });

  it("reads \"Name's Post\" titles and takes the text from the snippet", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/lukasz-szpruch-4604bb88_what-is-ai-insurance-and-how-is-it-related-activity-7434963439988600833-A6Z9",
      "Lukasz Szpruch's Post",
      "What is AI insurance, why AI assurance needs accountability and what can we learn from cyber insurance:",
    );
    expect(post.name).toBe("Lukasz Szpruch");
    expect(post.text).toBe("What is AI insurance, why AI assurance needs accountability and what can we learn from cyber insurance:");
  });

  it("reads 'Name - headline' titles", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/tesssbuckley_aiinsurance-aiassurance-activity-7375861495789719552-0iI9",
      "Tess Buckley - Understanding AI insurance",
      "AI insurance isn't about covering machines.",
    );
    expect(post).toMatchObject({ name: "Tess Buckley", text: "Understanding AI insurance" });
  });

  it("recognizes organizations", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/gallagher-re_in-association-with-massachusetts-institute-activity-7442139444310138880-lgfq",
      "AI Liability Gaps in Insurance Market | Gallagher Re posted ...",
      "AI Liability Gaps in Insurance Market. View organization page for ... READ ALL ABOUT IT: we are defining the AI insurance category with ...",
    );
    expect(post).toMatchObject({ name: "Gallagher Re", org: true, text: "AI Liability Gaps in Insurance Market" });
    expect(parseLinkedInPost("https://www.linkedin.com/posts/ai-insurance-organization_x-activity-7462857228325273602-yWKY", "Ai Insurance Organization Inc.'s Post", "").org).toBe(true);
  });

  it("finds the poster's name at the end of a snippet", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/christopherjohnmoore_the-insurance-industry-cannot-afford-to-ignore-activity-7508412209316720641-FIWy",
      "The Insurance Industry cannot afford to ignore AI Liability",
      "It may be our clients deciding to retain the risk themselves. The Insurance Industry cannot afford to ignore AI Liability Christopher Moore on LinkedIn.",
    );
    expect(post.name).toBe("Christopher Moore");
  });

  it("leaves the name empty rather than guessing", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/freedomaisolutions_ailiability-aipolicy-aiandorder-activity-7508525825168809985-9hTa",
      "AI Liability: Who's Responsible When AI Goes Wrong",
      "... AI Liability Directive. The US? Still debating. If you deploy AI in your business, YOU might be liable for its mistakes.",
    );
    expect(post.name).toBeNull();
    expect(post.text).toBe("AI Liability: Who's Responsible When AI Goes Wrong");
  });

  it("replaces a hashtag-only title with the start of the snippet", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/the-mahoney-group_tmgpeoplefirst-insurance-ai-activity-7503115169301024769-K1yT",
      "#tmgpeoplefirst #insurance #ai #insurtech ...",
      "What happens when an AI system makes a decision, delivers the wrong recommendation, or causes a real-world loss?",
    );
    expect(post.text).toBe("What happens when an AI system makes a decision, delivers the wrong recommendation, or causes a real-world loss?");
  });

  it("handles LinkedIn articles", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/pulse/who-pays-when-ai-wrong-sayantan-sarkar-9aese",
      "Who Pays When the AI Is Wrong?",
      "I think AI liability will likely follow the same path.",
    );
    expect(post).toMatchObject({ kind: "article", vanity: null, name: null, text: "Who Pays When the AI Is Wrong?" });
  });
});

describe("parseLinkedInPost, second round of real results", () => {
  it("reads \"Name's Post - #tags\" and \"Name posted this\"", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/reinier-van-lanschot_ai-liability-activity-7509000000000000000-abcd",
      "Reinier van Lanschot's Post - ai #liability #openai #hack",
      "Who is liable when an AI agent goes rogue? The answer matters for insurers.",
    );
    expect(post).toMatchObject({ name: "Reinier van Lanschot", text: "Who is liable when an AI agent goes rogue?" });
    const posted = parseLinkedInPost(
      "https://www.linkedin.com/posts/adam-aljahdhami-550586218_ailiability-techpolicy-openai-activity-7508299322824900000-abcd",
      "Adam Aljahdhami posted this",
      "#ailiability #techpolicy. AI companies' liability when their tools are involved in violent crimes.",
    );
    expect(posted).toMatchObject({ name: "Adam Aljahdhami", text: "AI companies' liability when their tools are involved in violent crimes." });
  });

  it("drops bylines Google cut short, and reads mostly-hashtag titles from the snippet", () => {
    expect(
      parseLinkedInPost(
        "https://www.linkedin.com/posts/lawandtechnology-eu_who-answers-when-the-system-acts-activity-7508000000000000000-abcd",
        "attributability and liability in the AI value chain | Law &",
        "Since 30 September, Italian courts hearing AI-related claims can order disclosure of logs.",
      ).text,
    ).toBe("attributability and liability in the AI value chain");
    expect(
      parseLinkedInPost(
        "https://www.linkedin.com/posts/barboravalaskova_aiact-ailiability-internalaudit-activity-7508829008223096833-S",
        "#aiact #ailiability #internalaudit #aigovernance | Barbora",
        "Four members of the European Parliament are calling for a new AI Liability Act. Product Liability Directive includes AI software.",
      ).text,
    ).toBe("Four members of the European Parliament are calling for a new AI Liability Act.");
    expect(
      parseLinkedInPost(
        "https://www.linkedin.com/posts/fast-lta_silentai-offcloudai-activity-7508451557936000000-abcd",
        "silentai #offcloudai #datensouveränität #kiappliance",
        "Im Juni 2026 hat eine Anordnung der US-Regierung zwei KI-Modelle gesperrt.",
      ).text,
    ).toBe("Im Juni 2026 hat eine Anordnung der US-Regierung zwei KI-Modelle gesperrt.");
  });

  it("skips the poster's own byline at the start of a snippet, and names shown twice", () => {
    const post = parseLinkedInPost(
      "https://www.linkedin.com/posts/ekenneally_cyberrisk-airisk-aiinsurance-activity-7509313725573681153-lDsD",
      "Erin Kenneally's Post",
      "Erin Kenneally AI Risk Insurance | Tech Risk Translation | AI Governance Enablement. Insurance has long been a necessary safety net to absorb shocks.",
    );
    expect(post.text).toBe("Insurance has long been a necessary safety net to absorb shocks.");
    const twice = parseLinkedInPost(
      "https://www.linkedin.com/posts/karanveer-sirohi_ai-liability-activity-7508000000000000001-abcd",
      "AI Liability: Trial of the Century at SF TECH WEEK | Karanveer Sirohi · Karanveer Sirohi",
      "",
    );
    expect(twice.name).toBe("Karanveer Sirohi");
    expect(parseLinkedInProfile("https://www.linkedin.com/in/michaelmeighu", "(Dr) Michael Meighu - Vice President Artificial Intelligence")?.name).toBe("Michael Meighu");
  });
});

describe("activityTime", () => {
  it("reads the post time from the link", () => {
    // Google said "3 days ago" on Sep 28 for this one.
    expect(activityTime("https://www.linkedin.com/posts/judsonalthoff_x-activity-7509270174127124480-Q26P")?.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(activityTime("https://www.linkedin.com/posts/tesssbuckley_x-activity-7375861495789719552-0iI9")?.toISOString().slice(0, 10)).toBe("2025-09-22");
    expect(activityTime("https://www.linkedin.com/pulse/who-pays-when-ai-wrong-sayantan-sarkar-9aese")).toBeUndefined();
  });
});

describe("parseLinkedInProfile", () => {
  it("reads name, headline, company and location, and normalizes the link", () => {
    const profile = parseLinkedInProfile(
      "https://uk.linkedin.com/in/alessandro-lezzi-75015117",
      "Alessandro Lezzi - Group Head of Cyber Risks at Beazley",
      "London, England, United Kingdom · Group Head of Cyber Risks · Beazley",
      "Group Head of Cyber Risks at Beazley · Experience: Beazley · Location: London · 500+ connections on LinkedIn. View Alessandro Lezzi's profile on LinkedIn, ...",
    );
    expect(profile).toMatchObject({
      vanity: "alessandro-lezzi-75015117",
      url: "https://www.linkedin.com/in/alessandro-lezzi-75015117",
      name: "Alessandro Lezzi",
      headline: "Group Head of Cyber Risks at Beazley",
      company: "Beazley",
      location: "London, England, United Kingdom",
    });
    expect(profile?.about).not.toMatch(/connections|View Alessandro/);
  });

  it("works without a subtitle, and ignores links that aren't profiles", () => {
    const profile = parseLinkedInProfile("https://www.linkedin.com/in/-marialong", "Maria Long - Chief Underwriting Officer | Cyber and Tech ...");
    expect(profile).toMatchObject({ name: "Maria Long", headline: "Chief Underwriting Officer | Cyber and Tech", company: null });
    expect(parseLinkedInProfile("https://www.linkedin.com/posts/x_y-activity-1", "Post")).toBeNull();
  });
});

describe("helpers", () => {
  it("matches names across middle initials and credentials", () => {
    expect(sameName("Michael S. Levine", "Michael Levine")).toBe(true);
    expect(sameName("Yiannos Tolias", "Yiannos Tolias PhD")).toBe(true);
    expect(sameName("Jane Smith", "Jane Doe")).toBe(false);
    expect(sameName("Madonna", "Madonna")).toBe(false); // one word is too ambiguous
    // A real mismatch from testing: same first name and a longer surname.
    expect(sameName("Andrew Ferguson", "Andrew Ferguson-Johns")).toBe(false);
    expect(sameName("Rebiah Bardot-Girard", "Rebiah Bardot-Girard, CPCU")).toBe(true);
  });

  it("builds searches from what people type", () => {
    expect(linkedInQuery('"AI liability"', "posts")).toBe('site:linkedin.com/posts "AI liability"');
    expect(linkedInQuery('"AI liability"', "profiles")).toBe('site:linkedin.com/in "AI liability"');
    expect(linkedInQuery('site:linkedin.com/pulse "AI liability"', "posts")).toBe('site:linkedin.com/pulse "AI liability"');
    expect(hashtagQuery("#AIinsurance")).toBe("site:linkedin.com/posts #AIinsurance");
    expect(linkedInVanity("https://be.linkedin.com/in/Yiannos-Tolias?trk=x")).toBe("yiannos-tolias");
  });

  it("simplifies searches the provider refuses", () => {
    expect(simplerQuery('site:linkedin.com/posts "AI liability" insurance')).toBe('site:linkedin.com/posts "AI liability"');
    expect(simplerQuery('site:linkedin.com/posts "silent AI" OR "affirmative AI"')).toBe('site:linkedin.com/posts "silent AI"');
    expect(simplerQuery('"affirmative AI" OR "AI exclusion" insurance')).toBe('"affirmative AI"');
    expect(simplerQuery("site:linkedin.com/posts AIinsurance insurance tech")).toBe("site:linkedin.com/posts AIinsurance insurance");
    expect(simplerQuery('site:linkedin.com/posts "AI liability"')).toBeNull();
  });

  it("finds hashtags, including Google's 'hashtag#' form, but not C# or entities", () => {
    expect(hashtagsIn("Great news #AIinsurance and hashtag#AIliability! #ai_risk")).toEqual(["AIinsurance", "ai_risk", "AIliability"]);
    expect(hashtagsIn("I write C# daily &#39;quoted&#39;")).toEqual([]);
  });
});

describe("linkedInItems", () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const post = (daysAgo: number, slug: string) => {
    const id = (BigInt(now - daysAgo * 86_400_000) << BigInt(22)).toString();
    return { title: `${slug} | Jane Smith`, link: `https://www.linkedin.com/posts/jane-smith-1a2b_${slug}-activity-${id}-AbCd`, snippet: "About AI cover." };
  };
  const data = {
    organic: [
      post(2, "recent"),
      post(40, "old"),
      { title: "An undated article", link: "https://www.linkedin.com/pulse/an-undated-article-jane-smith-xyz", snippet: "Text." },
      { title: "Not LinkedIn", link: "https://example.com/post", snippet: "" },
    ],
  };

  it("keeps recent posts with their exact date, and drops old ones and other sites", () => {
    const found = linkedInItems(data, '"AI liability"', true, now);
    expect(found.map((i) => i.title)).toEqual(["recent", "An undated article"]);
    expect(found[0]).toMatchObject({ source: "linkedin", author: "Jane Smith", sourceKey: "linkedin:jane-smith-1a2b", matchedQuery: '"AI liability"' });
    expect(found[0].publishedAt?.toISOString().slice(0, 10)).toBe("2026-09-26");
  });

  it("drops undated results when the search ran without a time filter", () => {
    expect(linkedInItems(data, "q", false, now).map((i) => i.title)).toEqual(["recent"]);
  });
});
