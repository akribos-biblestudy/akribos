ALTER TABLE "saved_reader_workspaces" ADD COLUMN "content_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_reader_workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "reader_workspace_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_reader_workspace_id_saved_reader_workspaces_id_fk" FOREIGN KEY ("active_reader_workspace_id") REFERENCES "public"."saved_reader_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reader_workspaces" ADD CONSTRAINT "saved_reader_workspaces_content_version_check" CHECK ("saved_reader_workspaces"."content_version" > 0);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_reader_workspace_version_check" CHECK ("sessions"."reader_workspace_version" >= 0);