ALTER TABLE "verse_comments" DROP CONSTRAINT "verse_comments_resource_id_resources_id_fk";
--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "cover_title" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "tab_title" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "selection_title" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "selection_subtitle" text;--> statement-breakpoint
ALTER TABLE "verse_comments" ADD CONSTRAINT "verse_comments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;