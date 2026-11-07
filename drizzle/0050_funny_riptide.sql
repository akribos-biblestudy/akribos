ALTER TABLE "users" ADD COLUMN "copy_reference_position" text DEFAULT 'before' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "copy_include_source" boolean DEFAULT false NOT NULL;