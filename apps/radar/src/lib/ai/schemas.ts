import { z } from "zod";

export const CATEGORIES = [
  "product_launch",
  "coverage_wording",
  "market_deal",
  "claims_litigation",
  "regulation_policy",
  "research_report",
  "incident",
  "people_move",
  "event",
  "opinion_analysis",
  "other",
] as const;

export const ORG_KINDS = [
  "carrier",
  "reinsurer",
  "mga",
  "lloyds_syndicate",
  "broker",
  "insurtech",
  "ai_company",
  "enterprise",
  "law_firm",
  "regulator",
  "standards_body",
  "research",
  "investor",
  "media",
  "other",
] as const;

export const PERSON_RELATIONS = ["author", "quoted", "mentioned", "poster", "speaker"] as const;
export const ORG_RELATIONS = ["subject", "quoted", "mentioned", "publisher"] as const;
export const PRIMARY_KINDS = [
  "report",
  "filing",
  "regulation",
  "policy_wording",
  "press_release",
  "study",
  "court_case",
  "statement",
  "post",
  "other",
] as const;

const personRef = z.object({
  name: z.string(),
  role: z.string().nullable(),
  org: z.string().nullable(),
  relation: z.enum(PERSON_RELATIONS),
});

const orgRef = z.object({
  name: z.string(),
  kind: z.enum(ORG_KINDS),
  relation: z.enum(ORG_RELATIONS),
});

export const triageSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      relevance: z.number().int(),
      category: z.enum(CATEGORIES),
      isOrigin: z.boolean(),
      originHint: z.string().nullable(),
      gist: z.string(),
      people: z.array(personRef),
      orgs: z.array(orgRef),
    }),
  ),
});
export type TriageResult = z.infer<typeof triageSchema>;

export const extractSchema = z.object({
  summary: z.string(),
  whyItMatters: z.string(),
  isOrigin: z.boolean(),
  primarySources: z.array(
    z.object({
      title: z.string(),
      url: z.string().nullable(),
      kind: z.enum(PRIMARY_KINDS),
      publisher: z.string().nullable(),
    }),
  ),
  people: z.array(personRef.extend({ quote: z.string().nullable() })),
  orgs: z.array(orgRef),
});
export type ExtractResult = z.infer<typeof extractSchema>;

export const briefSchema = z.object({
  stories: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      whyItMatters: z.string(),
      originItemId: z.number().int().nullable(),
      itemIds: z.array(z.number().int()),
      people: z.array(z.string()),
      orgs: z.array(z.string()),
    }),
  ),
});
export type BriefResult = z.infer<typeof briefSchema>;

export type PersonRef = z.infer<typeof personRef> & { quote?: string | null };
export type OrgRef = z.infer<typeof orgRef>;
