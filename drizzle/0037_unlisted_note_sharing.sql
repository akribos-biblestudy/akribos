-- Retire public discovery without invalidating existing direct links or modifying snapshot content.
-- Keep an up-to-date snapshot aligned when only its working-copy visibility changes.
UPDATE "document_publications" AS p
SET "publication_revision" = p."publication_revision" + 1
FROM "documents" AS d
WHERE p."document_id" = d."id" AND d."visibility" = 'public'
  AND p."publication_revision" = d."revision";
--> statement-breakpoint
UPDATE "documents" SET "visibility" = 'unlisted', "revision" = "revision" + 1,
  "updated_at" = now() WHERE "visibility" = 'public';
--> statement-breakpoint
UPDATE "document_publications" SET "visibility" = 'unlisted' WHERE "visibility" = 'public';
--> statement-breakpoint
ALTER TABLE "document_publications" ADD CONSTRAINT "document_publications_visibility_check" CHECK ("document_publications"."visibility" = 'unlisted');--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_visibility_check" CHECK ("documents"."visibility" in ('private', 'unlisted'));