CREATE TABLE "document_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_attachments_size_check" CHECK ("document_attachments"."size_bytes" > 0 and "document_attachments"."size_bytes" <= 52428800 and octet_length("document_attachments"."content") = "document_attachments"."size_bytes"),
	CONSTRAINT "document_attachments_filename_check" CHECK (length(btrim("document_attachments"."filename")) > 0 and octet_length("document_attachments"."filename") <= 255)
);
--> statement-breakpoint
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_owner_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_attachments_document_owner_idx" ON "document_attachments" USING btree ("document_id","user_id");