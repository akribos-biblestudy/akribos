ALTER TABLE "verse_highlights" DROP CONSTRAINT "verse_highlights_range_check";--> statement-breakpoint
DROP INDEX "verse_highlights_range_idx";--> statement-breakpoint
-- Every existing highlight covers exactly one verse, so the new endpoint is the verse itself.
ALTER TABLE "verse_highlights" ADD COLUMN "end_verse" integer;--> statement-breakpoint
UPDATE "verse_highlights" SET "end_verse" = "verse" WHERE "end_verse" IS NULL;--> statement-breakpoint
ALTER TABLE "verse_highlights" ALTER COLUMN "end_verse" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "verse_highlights_range_idx" ON "verse_highlights" USING btree ("user_id","resource_id","book_id","chapter","verse","end_verse","start_word","end_word") WHERE "verse_highlights"."resource_id" is not null;--> statement-breakpoint
ALTER TABLE "verse_highlights" ADD CONSTRAINT "verse_highlights_range_check" CHECK ("verse_highlights"."end_verse" >= "verse_highlights"."verse"
				and (("verse_highlights"."resource_id" is null and "verse_highlights"."start_word" is null and "verse_highlights"."end_word" is null
						and "verse_highlights"."end_verse" = "verse_highlights"."verse")
					or ("verse_highlights"."resource_id" is not null and "verse_highlights"."start_word" is not null
						and "verse_highlights"."end_word" is not null and "verse_highlights"."start_word" >= 0
						and "verse_highlights"."end_word" >= 0
						and ("verse_highlights"."end_verse" > "verse_highlights"."verse" or "verse_highlights"."end_word" >= "verse_highlights"."start_word"))));