CREATE TABLE "document_verse_lists" (
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_verse_lists_document_id_list_id_pk" PRIMARY KEY("document_id","list_id")
);
--> statement-breakpoint
ALTER TABLE "document_verse_lists" ADD CONSTRAINT "document_verse_lists_list_id_verse_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."verse_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_verse_lists" ADD CONSTRAINT "document_verse_lists_owner_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_verse_lists_list_idx" ON "document_verse_lists" USING btree ("list_id");