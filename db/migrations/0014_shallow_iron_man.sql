CREATE TABLE "analytics_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"date" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"source" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_activity" ADD CONSTRAINT "analytics_activity_site_id_analytics_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."analytics_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_analytics_activity_external" ON "analytics_activity" USING btree ("site_id","source","external_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_activity_siteId_date" ON "analytics_activity" USING btree ("site_id","date");