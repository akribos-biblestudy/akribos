DROP INDEX "verse_highlights_verse_idx";--> statement-breakpoint
ALTER TABLE "verse_highlights" ADD COLUMN "resource_id" text;--> statement-breakpoint
ALTER TABLE "verse_highlights" ADD COLUMN "start_word" integer;--> statement-breakpoint
ALTER TABLE "verse_highlights" ADD COLUMN "end_word" integer;--> statement-breakpoint
ALTER TABLE "verse_highlights" ADD CONSTRAINT "verse_highlights_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verse_highlights_range_idx" ON "verse_highlights" USING btree ("user_id","resource_id","book_id","chapter","verse","start_word","end_word") WHERE "verse_highlights"."resource_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "verse_highlights_verse_idx" ON "verse_highlights" USING btree ("user_id","book_id","chapter","verse") WHERE "verse_highlights"."resource_id" is null;--> statement-breakpoint
ALTER TABLE "verse_highlights" ADD CONSTRAINT "verse_highlights_range_check" CHECK (("verse_highlights"."resource_id" is null and "verse_highlights"."start_word" is null and "verse_highlights"."end_word" is null)
				or ("verse_highlights"."resource_id" is not null and "verse_highlights"."start_word" is not null
					and "verse_highlights"."end_word" is not null and "verse_highlights"."start_word" >= 0
					and "verse_highlights"."end_word" >= "verse_highlights"."start_word"));