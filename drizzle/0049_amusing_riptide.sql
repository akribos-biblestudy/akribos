CREATE TABLE "bible_download_grants" (
	"resource_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"category" text NOT NULL,
	"resource_id" text,
	"resource_name" text,
	"location" text,
	"description" text NOT NULL,
	"suggestion" text,
	"page" text,
	"browser" text,
	"device" text,
	"attachment_name" text,
	"attachment_type" text,
	"attachment" "bytea",
	"status" text DEFAULT 'new' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strong_assignment_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" text NOT NULL,
	"book_id" integer NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"word_position" integer NOT NULL,
	"strong" text NOT NULL,
	"word" text NOT NULL,
	"verse_fingerprint" text NOT NULL,
	"decision" text NOT NULL,
	"author_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strong_review_position_check" CHECK ("strong_assignment_reviews"."word_position" >= 0),
	CONSTRAINT "strong_review_decision_check" CHECK ("strong_assignment_reviews"."decision" in ('confirmed', 'incorrect'))
);
--> statement-breakpoint
CREATE TABLE "strong_review_grants" (
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strong_review_grants_user_id_pk" PRIMARY KEY("user_id")
);
--> statement-breakpoint
ALTER TABLE "bible_download_grants" ADD CONSTRAINT "bible_download_grants_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strong_assignment_reviews" ADD CONSTRAINT "strong_assignment_reviews_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strong_assignment_reviews" ADD CONSTRAINT "strong_assignment_reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strong_assignment_reviews" ADD CONSTRAINT "strong_assignment_reviews_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strong_review_grants" ADD CONSTRAINT "strong_review_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_reports_status_created_idx" ON "feedback_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "strong_review_occurrence_idx" ON "strong_assignment_reviews" USING btree ("resource_id","book_id","chapter","verse","word_position","strong");--> statement-breakpoint
CREATE INDEX "strong_review_pending_idx" ON "strong_assignment_reviews" USING btree ("approved_at");