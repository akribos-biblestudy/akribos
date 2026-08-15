ALTER TABLE "verse_list_items" ALTER COLUMN "added_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "verse_list_items" DROP COLUMN "note_html";