CREATE TABLE "app_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"app_version" text,
	"platform" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_feedback_category_check" CHECK ("app_feedback"."category" in ('bug', 'suggestion', 'other')),
	CONSTRAINT "app_feedback_status_check" CHECK ("app_feedback"."status" in ('open', 'reviewing', 'resolved')),
	CONSTRAINT "app_feedback_message_length_check" CHECK (char_length(trim("app_feedback"."message")) between 10 and 2000)
);
--> statement-breakpoint
ALTER TABLE "app_feedback" ADD CONSTRAINT "app_feedback_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_feedback_created_at_idx" ON "app_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "app_feedback_status_created_at_idx" ON "app_feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "app_feedback_reporter_id_idx" ON "app_feedback" USING btree ("reporter_id");