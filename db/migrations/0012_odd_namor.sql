CREATE TABLE "analytics_credential" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"provider" text NOT NULL,
	"date" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_dimension" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"provider" text NOT NULL,
	"date" text NOT NULL,
	"dimension" text NOT NULL,
	"value" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_site" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"gsc_property" text,
	"bing_site_url" text,
	"ga4_property_id" text,
	"call_tracking_provider" text,
	"callrail_account_id" text,
	"callrail_company_id" text,
	"whatconverts_account_id" text,
	"whatconverts_profile_id" text,
	"netlify_site_id" text,
	"digest_enabled" boolean DEFAULT false NOT NULL,
	"digest_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_credential" ADD CONSTRAINT "analytics_credential_site_id_analytics_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."analytics_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_site_id_analytics_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."analytics_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_dimension" ADD CONSTRAINT "analytics_dimension_site_id_analytics_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."analytics_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_analytics_credential_siteId_provider" ON "analytics_credential" USING btree ("site_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_analytics_daily" ON "analytics_daily" USING btree ("site_id","provider","date");--> statement-breakpoint
CREATE INDEX "idx_analytics_daily_siteId_date" ON "analytics_daily" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "idx_analytics_dimension" ON "analytics_dimension" USING btree ("site_id","provider","date","dimension");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_analytics_dimension_row" ON "analytics_dimension" USING btree ("site_id","provider","date","dimension","value");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_analytics_site_owner_repo" ON "analytics_site" USING btree ("owner","repo");