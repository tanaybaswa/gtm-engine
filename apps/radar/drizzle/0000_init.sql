CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" integer NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"title_key" text NOT NULL,
	"title" text NOT NULL,
	"snippet" text,
	"author" text,
	"author_url" text,
	"outlet" text,
	"source_key" text NOT NULL,
	"published_at" timestamp with time zone,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"engagement" jsonb,
	"matched_query" text,
	"status" text DEFAULT 'new' NOT NULL,
	"relevance" integer,
	"category" text,
	"is_origin" boolean,
	"origin_hint" text,
	"gist" text,
	"summary" text,
	"why_it_matters" text,
	"resolved_url" text,
	"primary_sources" jsonb,
	"enriched_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"org_id" integer NOT NULL,
	"relation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"watched" boolean DEFAULT false NOT NULL,
	CONSTRAINT "orgs_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_key" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"org_name" text,
	"linkedin_url" text,
	"x_handle" text,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"watched" boolean DEFAULT false NOT NULL,
	CONSTRAINT "people_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
CREATE TABLE "person_mentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"relation" text NOT NULL,
	"role" text,
	"org_name" text,
	"quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" integer NOT NULL,
	"stage" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'publication' NOT NULL,
	"homepage" text,
	"feed_url" text,
	"followed" boolean DEFAULT false NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"relevant_count" integer DEFAULT 0 NOT NULL,
	"origin_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" integer NOT NULL,
	"brief_date" text NOT NULL,
	"rank" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"why_it_matters" text,
	"origin_item_id" integer,
	"item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"people_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"org_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"config" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"meter" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_mentions" ADD CONSTRAINT "org_mentions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_mentions" ADD CONSTRAINT "org_mentions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_mentions" ADD CONSTRAINT "person_mentions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_mentions" ADD CONSTRAINT "person_mentions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_origin_item_id_items_id_fk" FOREIGN KEY ("origin_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_topic_canonical_idx" ON "items" USING btree ("topic_id","canonical_url");--> statement-breakpoint
CREATE INDEX "items_topic_title_idx" ON "items" USING btree ("topic_id","title_key");--> statement-breakpoint
CREATE INDEX "items_topic_published_idx" ON "items" USING btree ("topic_id","published_at");--> statement-breakpoint
CREATE INDEX "items_topic_status_idx" ON "items" USING btree ("topic_id","status");--> statement-breakpoint
CREATE INDEX "items_source_key_idx" ON "items" USING btree ("source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "org_mentions_unique_idx" ON "org_mentions" USING btree ("item_id","org_id","relation");--> statement-breakpoint
CREATE INDEX "org_mentions_org_idx" ON "org_mentions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_mentions_unique_idx" ON "person_mentions" USING btree ("item_id","person_id","relation");--> statement-breakpoint
CREATE INDEX "person_mentions_person_idx" ON "person_mentions" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "runs_topic_started_idx" ON "runs" USING btree ("topic_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stories_topic_date_rank_idx" ON "stories" USING btree ("topic_id","brief_date","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_month_meter_idx" ON "usage" USING btree ("month","meter");