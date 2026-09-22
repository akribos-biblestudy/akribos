CREATE TABLE "reader_browser_tabs" (
	"id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"workspace_id" uuid,
	"selection_version" integer DEFAULT 1 NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reader_browser_tabs_session_id_id_pk" PRIMARY KEY("session_id","id")
);
--> statement-breakpoint
ALTER TABLE "reader_browser_tabs" ADD CONSTRAINT "reader_browser_tabs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reader_browser_tabs" ADD CONSTRAINT "reader_browser_tabs_workspace_id_saved_reader_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."saved_reader_workspaces"("id") ON DELETE set null ON UPDATE no action;