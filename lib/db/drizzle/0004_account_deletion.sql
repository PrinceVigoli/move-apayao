CREATE TABLE "account_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"retention_reason" text,
	"retention_until" timestamp with time zone,
	CONSTRAINT "account_deletion_requests_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "account_deletion_status_check" CHECK ("account_deletion_requests"."status" in ('pending','reviewing','completed')),
	CONSTRAINT "account_deletion_completion_check" CHECK (("account_deletion_requests"."status" = 'completed') = ("account_deletion_requests"."completed_at" is not null)),
	CONSTRAINT "account_deletion_retention_check" CHECK (("account_deletion_requests"."retention_reason" is null) = ("account_deletion_requests"."retention_until" is null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletion_status_idx" ON "account_deletion_requests" USING btree ("status","requested_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_account_check" CHECK ("users"."deleted_at" is null or ("users"."is_active" = false and "users"."password_hash" is null and "users"."phone" is null and "users"."full_name" is null and "users"."avatar_url" is null));
--> statement-breakpoint
-- Serialize new account-associated writes with permanent deletion.
CREATE FUNCTION guard_deleted_account_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_id uuid; erased_at timestamptz; column_name text;
BEGIN
  FOREACH column_name IN ARRAY TG_ARGV LOOP
    account_id := (to_jsonb(NEW)->>column_name)::uuid;
    IF account_id IS NOT NULL THEN
      SELECT deleted_at INTO erased_at FROM users WHERE id=account_id FOR SHARE;
      IF erased_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot add personal records to a deleted account' USING ERRCODE='23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER refresh_tokens_deleted_account_guard BEFORE INSERT ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('user_id');
--> statement-breakpoint
CREATE TRIGGER password_reset_tokens_deleted_account_guard BEFORE INSERT ON password_reset_tokens FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('user_id');
--> statement-breakpoint
CREATE TRIGGER device_push_tokens_deleted_account_guard BEFORE INSERT OR UPDATE ON device_push_tokens FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('user_id');
--> statement-breakpoint
CREATE TRIGGER driver_profiles_deleted_account_guard BEFORE INSERT OR UPDATE ON driver_profiles FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('user_id');
--> statement-breakpoint
CREATE TRIGGER driver_location_points_deleted_account_guard BEFORE INSERT ON driver_location_points FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('driver_id');
--> statement-breakpoint
CREATE TRIGGER app_feedback_deleted_account_guard BEFORE INSERT ON app_feedback FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('reporter_id');
--> statement-breakpoint
CREATE TRIGGER incident_reports_deleted_account_guard BEFORE INSERT ON incident_reports FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('reporter_id');
--> statement-breakpoint
CREATE TRIGGER fare_transactions_deleted_account_guard BEFORE INSERT ON fare_transactions FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('user_id');
--> statement-breakpoint
CREATE TRIGGER pending_top_ups_deleted_account_guard BEFORE INSERT ON pending_top_ups FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('user_id');
--> statement-breakpoint
CREATE TRIGGER trips_deleted_account_guard BEFORE INSERT ON trips FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('passenger_id','driver_id');
--> statement-breakpoint
CREATE TRIGGER fixed_loop_reservations_deleted_account_guard BEFORE INSERT ON fixed_loop_reservations FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('passenger_id','booked_by_id');
--> statement-breakpoint
CREATE TRIGGER vehicle_location_points_deleted_account_guard BEFORE INSERT ON vehicle_location_points FOR EACH ROW EXECUTE FUNCTION guard_deleted_account_write('driver_id');
