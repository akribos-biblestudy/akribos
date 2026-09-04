CREATE TABLE "document_passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"resource_id" text,
	"start_book_id" integer NOT NULL,
	"start_chapter" integer NOT NULL,
	"start_verse" integer NOT NULL,
	"end_book_id" integer NOT NULL,
	"end_chapter" integer NOT NULL,
	"end_verse" integer NOT NULL,
	"start_key" integer NOT NULL,
	"end_key" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_passages_bounds_check" CHECK ("document_passages"."start_book_id" between 1 and 66
				and "document_passages"."end_book_id" between 1 and 66
				and "document_passages"."start_chapter" between 1 and 200
				and "document_passages"."end_chapter" between 1 and 200
				and "document_passages"."start_verse" between 1 and 999
				and "document_passages"."end_verse" between 1 and 999
				and "document_passages"."position" >= 0),
	CONSTRAINT "document_passages_keys_check" CHECK ("document_passages"."start_key" = "document_passages"."start_book_id" * 1000000
					+ "document_passages"."start_chapter" * 1000 + "document_passages"."start_verse"
				and "document_passages"."end_key" = "document_passages"."end_book_id" * 1000000
					+ "document_passages"."end_chapter" * 1000 + "document_passages"."end_verse"
				and "document_passages"."start_key" <= "document_passages"."end_key")
);
--> statement-breakpoint
CREATE TABLE "document_publications" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"body_html" text NOT NULL,
	"body_markdown" text NOT NULL,
	"author_name" text NOT NULL,
	"visibility" text NOT NULL,
	"passages" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"publication_revision" integer NOT NULL,
	"first_published_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_publications_title_check" CHECK (length(btrim("document_publications"."title")) > 0),
	CONSTRAINT "document_publications_slug_check" CHECK (length(btrim("document_publications"."slug")) > 0),
	CONSTRAINT "document_publications_author_check" CHECK (length(btrim("document_publications"."author_name")) > 0),
	CONSTRAINT "document_publications_revision_check" CHECK ("document_publications"."publication_revision" > 0),
	CONSTRAINT "document_publications_dates_check" CHECK ("document_publications"."published_at" >= "document_publications"."first_published_at")
);
--> statement-breakpoint
CREATE TABLE "document_tag_links" (
	"document_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "document_tag_links_document_id_tag_id_pk" PRIMARY KEY("document_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "document_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"path" text NOT NULL,
	"normalized_path" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_tags_names_check" CHECK (length(btrim("document_tags"."name")) > 0
				and length("document_tags"."normalized_name") > 0
				and length("document_tags"."path") > 0
				and length("document_tags"."normalized_path") > 0)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text NOT NULL,
	"body_html" text NOT NULL,
	"plain_text" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'native' NOT NULL,
	"source_filename" text,
	"legacy_verse_comment_id" uuid,
	"sermon_status" text,
	"sermon_date" date,
	"sermon_series" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_title_check" CHECK (length(btrim("documents"."title")) > 0),
	CONSTRAINT "documents_revision_check" CHECK ("documents"."revision" > 0),
	CONSTRAINT "documents_sermon_fields_check" CHECK (("documents"."kind" = 'sermon' and "documents"."sermon_status" is not null)
				or ("documents"."kind" <> 'sermon' and "documents"."sermon_status" is null
					and "documents"."sermon_date" is null and "documents"."sermon_series" is null)),
	CONSTRAINT "documents_legacy_source_check" CHECK (("documents"."source" = 'legacy-verse-comment' and "documents"."legacy_verse_comment_id" is not null)
				or ("documents"."source" <> 'legacy-verse-comment' and "documents"."legacy_verse_comment_id" is null))
);
--> statement-breakpoint
-- PostgreSQL requires the referenced `(id, user_id)` key to exist before the composite self-FK is
-- added. drizzle-kit otherwise emits this index later with the remaining indexes.
CREATE UNIQUE INDEX "document_tags_id_user_idx" ON "document_tags" USING btree ("id","user_id");
--> statement-breakpoint
ALTER TABLE "document_passages" ADD CONSTRAINT "document_passages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_passages" ADD CONSTRAINT "document_passages_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_publications" ADD CONSTRAINT "document_publications_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tag_links" ADD CONSTRAINT "document_tag_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tag_links" ADD CONSTRAINT "document_tag_links_tag_id_document_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."document_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_parent_owner_fk" FOREIGN KEY ("parent_id","user_id") REFERENCES "public"."document_tags"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_passages_document_position_idx" ON "document_passages" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "document_passages_overlap_idx" ON "document_passages" USING btree ("start_key","end_key");--> statement-breakpoint
CREATE INDEX "document_passages_resource_overlap_idx" ON "document_passages" USING btree ("resource_id","start_key","end_key");--> statement-breakpoint
CREATE UNIQUE INDEX "document_publications_slug_idx" ON "document_publications" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "document_publications_visibility_published_idx" ON "document_publications" USING btree ("visibility","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_tags_user_path_idx" ON "document_tags" USING btree ("user_id","normalized_path");--> statement-breakpoint
CREATE INDEX "document_tags_parent_idx" ON "document_tags" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "documents_user_updated_idx" ON "documents" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "documents_user_kind_updated_idx" ON "documents" USING btree ("user_id","kind","updated_at");--> statement-breakpoint
CREATE INDEX "documents_user_deleted_updated_idx" ON "documents" USING btree ("user_id","deleted_at","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_legacy_verse_comment_idx" ON "documents" USING btree ("legacy_verse_comment_id");

-- Preserve every private translation comment as a unified document without removing the legacy
-- source row. `legacy_verse_comment_id` is the stable provenance key: this insert and the matching
-- operational backfill can be retried without creating a second document. HTML stays byte-for-byte
-- available for the rich editor; the portable Markdown fallback is deliberately plain text because
-- SQL is not a Markdown serializer. The application backfill uses the full converter for comments
-- created after this migration (notably demo fixtures).
INSERT INTO "documents" (
	"id",
	"user_id",
	"kind",
	"title",
	"body_markdown",
	"body_html",
	"plain_text",
	"visibility",
	"revision",
	"source",
	"legacy_verse_comment_id",
	"created_at",
	"updated_at"
)
SELECT
	gen_random_uuid(),
	comment."user_id",
	'note',
	format('Versnotiz · %s:%s:%s', comment."book_id", comment."chapter", comment."verse"),
	-- Strip genuine legacy markup before interpreting entities. Decoding first would turn visible
	-- text such as `&lt;script&gt;` into a tag and silently delete it from the Markdown copy.
	btrim(
		regexp_replace(
			comment."comment_html",
			'<[^>]*>',
			' ',
			'g'
		)
	),
	comment."comment_html",
	btrim(
		regexp_replace(
			replace(replace(replace(replace(replace(
				regexp_replace(comment."comment_html", '<[^>]*>', ' ', 'g'),
				'&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', chr(39)), '&amp;', '&'),
			'\s+',
			' ',
			'g'
		)
	),
	'private',
	1,
	'legacy-verse-comment',
	comment."id",
	comment."created_at",
	comment."updated_at"
FROM "verse_comments" AS comment
ON CONFLICT ("legacy_verse_comment_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "document_passages" (
	"document_id",
	"resource_id",
	"start_book_id",
	"start_chapter",
	"start_verse",
	"end_book_id",
	"end_chapter",
	"end_verse",
	"start_key",
	"end_key",
	"position",
	"created_at"
)
SELECT
	document."id",
	comment."resource_id",
	comment."book_id",
	comment."chapter",
	comment."verse",
	comment."book_id",
	comment."chapter",
	comment."verse",
	comment."book_id" * 1000000 + comment."chapter" * 1000 + comment."verse",
	comment."book_id" * 1000000 + comment."chapter" * 1000 + comment."verse",
	0,
	comment."created_at"
FROM "verse_comments" AS comment
INNER JOIN "documents" AS document
	ON document."legacy_verse_comment_id" = comment."id"
WHERE NOT EXISTS (
	SELECT 1
	FROM "document_passages" AS passage
	WHERE passage."document_id" = document."id"
		AND passage."position" = 0
);
