CREATE TABLE "document_links" (
	"user_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"target_document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_links_source_document_id_target_document_id_pk" PRIMARY KEY("source_document_id","target_document_id"),
	CONSTRAINT "document_links_distinct_documents_check" CHECK ("document_links"."source_document_id" <> "document_links"."target_document_id")
);
--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_source_owner_fk" FOREIGN KEY ("source_document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_target_owner_fk" FOREIGN KEY ("target_document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_links_user_target_idx" ON "document_links" USING btree ("user_id","target_document_id");
--> statement-breakpoint
-- Backfill ordinary private-document links which predate the derived relationship index. The owner
-- join enforces the same boundary as future repository writes. Deleted targets remain indexed so a
-- restored target immediately regains its backlinks; the UI labels them unavailable while deleted.
INSERT INTO "document_links" ("user_id", "source_document_id", "target_document_id")
SELECT DISTINCT source."user_id", source."id", target."id"
FROM "documents" source
CROSS JOIN LATERAL regexp_matches(
	source."body_html",
	E'href="/notes/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:[?#][^"]*)?"',
	'gi'
) matched
JOIN "documents" target
	ON target."id" = matched[1]::uuid
	AND target."user_id" = source."user_id"
WHERE source."id" <> target."id"
ON CONFLICT DO NOTHING;
