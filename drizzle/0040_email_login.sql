CREATE TABLE "email_logins" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"token_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"redirect_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_logins_attempts_check" CHECK ("email_logins"."attempts" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_logins" ADD CONSTRAINT "email_logins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_logins_token_idx" ON "email_logins" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_logins_email_idx" ON "email_logins" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_logins_expiry_idx" ON "email_logins" USING btree ("expires_at");