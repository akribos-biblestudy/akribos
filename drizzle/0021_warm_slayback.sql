CREATE TABLE "verse_list_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verse_list_item_comment_reactions" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verse_list_item_comment_reactions_comment_id_user_id_emoji_pk" PRIMARY KEY("comment_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "verse_list_item_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"author_user_id" uuid NOT NULL,
	"body_html" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verse_list_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verse_list_items" ADD COLUMN "added_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "verse_list_invites" ADD CONSTRAINT "verse_list_invites_list_id_verse_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."verse_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_list_invites" ADD CONSTRAINT "verse_list_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_list_item_comment_reactions" ADD CONSTRAINT "verse_list_item_comment_reactions_comment_id_verse_list_item_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."verse_list_item_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_list_item_comment_reactions" ADD CONSTRAINT "verse_list_item_comment_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_list_item_comments" ADD CONSTRAINT "verse_list_item_comments_item_id_verse_list_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."verse_list_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_list_item_comments" ADD CONSTRAINT "verse_list_item_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_list_item_comments" ADD CONSTRAINT "verse_list_item_comments_parent_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."verse_list_item_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_list_members" ADD CONSTRAINT "verse_list_members_list_id_verse_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."verse_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_list_members" ADD CONSTRAINT "verse_list_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verse_list_members" ADD CONSTRAINT "verse_list_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verse_list_invites_list_idx" ON "verse_list_invites" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "verse_list_invites_email_idx" ON "verse_list_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verse_list_item_comment_reactions_comment_idx" ON "verse_list_item_comment_reactions" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "verse_list_item_comments_item_idx" ON "verse_list_item_comments" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "verse_list_item_comments_parent_idx" ON "verse_list_item_comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verse_list_members_unique_idx" ON "verse_list_members" USING btree ("list_id","user_id");--> statement-breakpoint
CREATE INDEX "verse_list_members_user_idx" ON "verse_list_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "verse_list_items" ADD CONSTRAINT "verse_list_items_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Data backfill for collaboration (issue #129), hand-added to the generated DDL above.
--
-- Every verse-list item predates collaboration, so it was added by the list's owner: that is the
-- only sensible author to backfill. `added_by_user_id` is made NOT NULL in the next migration, once
-- this has run.
UPDATE "verse_list_items" AS "item"
SET "added_by_user_id" = "list"."user_id"
FROM "verse_lists" AS "list"
WHERE "list"."id" = "item"."list_id"
	AND "item"."added_by_user_id" IS NULL;
--> statement-breakpoint
-- Every non-empty `note_html` becomes a root comment (no parent), authored by the list's owner —
-- the only person who could have written it before this feature existed. `note_html` itself is
-- dropped in the next migration, once this has run.
INSERT INTO "verse_list_item_comments" ("item_id", "parent_comment_id", "author_user_id", "body_html", "created_at", "updated_at")
SELECT "item"."id", NULL, "list"."user_id", "item"."note_html", "item"."created_at", "item"."updated_at"
FROM "verse_list_items" AS "item"
JOIN "verse_lists" AS "list" ON "list"."id" = "item"."list_id"
WHERE "item"."note_html" IS NOT NULL
	AND btrim("item"."note_html") <> '';
