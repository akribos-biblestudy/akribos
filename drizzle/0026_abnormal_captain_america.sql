CREATE TABLE "sermon_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"location" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sermon_deliveries_location_check" CHECK (length(btrim("sermon_deliveries"."location")) > 0 and length("sermon_deliveries"."location") <= 200)
);
--> statement-breakpoint
CREATE TABLE "sermon_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body_markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sermon_templates_content_check" CHECK (length(btrim("sermon_templates"."name")) > 0 and length("sermon_templates"."name") <= 120
				and octet_length("sermon_templates"."body_markdown") <= 1048576)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_id_user_idx" ON "documents" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "sermon_deliveries" ADD CONSTRAINT "sermon_deliveries_document_owner_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sermon_templates" ADD CONSTRAINT "sermon_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sermon_deliveries_document_date_idx" ON "sermon_deliveries" USING btree ("document_id","date");--> statement-breakpoint
CREATE INDEX "sermon_deliveries_user_idx" ON "sermon_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sermon_templates_user_name_idx" ON "sermon_templates" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "sermon_templates_user_updated_idx" ON "sermon_templates" USING btree ("user_id","updated_at");
