CREATE TABLE "linkedin_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" integer NOT NULL,
	"vanity" text NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"headline" text,
	"company" text,
	"location" text,
	"about" text,
	"matched_query" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "linkedin_headline" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "linkedin_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linkedin_profiles" ADD CONSTRAINT "linkedin_profiles_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linkedin_profiles_topic_vanity_idx" ON "linkedin_profiles" USING btree ("topic_id","vanity");--> statement-breakpoint
-- Turn LinkedIn on for the AI liability topic, which was created before these settings existed.
-- Only missing settings are added, and searches are replaced only while they still match the
-- old defaults, so anything edited by hand stays as it is.
UPDATE "topics" SET "config" = jsonb_set("config", '{queries,hashtags}', '["AIinsurance", "AIliability", "silentAI"]'::jsonb, true)
WHERE "slug" = 'ai-liability-insurance' AND NOT (("config"->'queries') ? 'hashtags');--> statement-breakpoint
UPDATE "topics" SET "config" = jsonb_set("config", '{queries,serper,profiles}', '["\"AI liability\"", "\"AI insurance\"", "\"affirmative AI\""]'::jsonb, true)
WHERE "slug" = 'ai-liability-insurance' AND jsonb_typeof("config"->'queries'->'serper') = 'object' AND NOT (("config"->'queries'->'serper') ? 'profiles');--> statement-breakpoint
UPDATE "topics" SET "config" = jsonb_set("config", '{queries,serper,linkedin}', '["\"AI liability\"", "\"AI insurance\"", "\"silent AI\"", "\"affirmative AI\"", "site:linkedin.com/pulse \"AI liability\""]'::jsonb, true)
WHERE "slug" = 'ai-liability-insurance' AND "config"->'queries'->'serper'->'linkedin' = '["site:linkedin.com/posts \"AI liability\" insurance", "site:linkedin.com/posts \"silent AI\" OR \"affirmative AI\"", "site:linkedin.com/posts \"AI insurance\" underwriting", "site:linkedin.com/posts \"tech E&O\" AI"]'::jsonb;--> statement-breakpoint
UPDATE "topics" SET "config" = jsonb_set("config", '{queries,serper,news}', '["AI liability insurance", "\"affirmative AI\" insurance"]'::jsonb, true)
WHERE "slug" = 'ai-liability-insurance' AND "config"->'queries'->'serper'->'news' = '["AI liability insurance", "\"affirmative AI\" OR \"AI exclusion\" insurance"]'::jsonb;
