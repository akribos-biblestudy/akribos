CREATE TABLE "saved_reader_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_reader_workspaces_name_check" CHECK (char_length(btrim("saved_reader_workspaces"."name")) between 1 and 80),
	CONSTRAINT "saved_reader_workspaces_revision_check" CHECK ("saved_reader_workspaces"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "saved_reader_workspaces" ADD CONSTRAINT "saved_reader_workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_reader_workspaces_owner_name_idx" ON "saved_reader_workspaces" USING btree ("user_id",lower("name"));