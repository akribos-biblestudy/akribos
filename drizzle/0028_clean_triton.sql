CREATE TABLE "document_body_reference_indexes" (
	"document_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"books" integer[] NOT NULL,
	"ranges" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_body_reference_indexes" ADD CONSTRAINT "document_body_reference_indexes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_body_reference_indexes" ADD CONSTRAINT "document_body_reference_indexes_owner_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."documents"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_body_reference_indexes_user_idx" ON "document_body_reference_indexes" USING btree ("user_id");