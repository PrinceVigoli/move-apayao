CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text,
	"full_name" text,
	"role" text DEFAULT 'passenger' NOT NULL,
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('passenger', 'driver_applicant', 'driver', 'admin', 'superadmin', 'developer'))
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "driver_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_type" text DEFAULT 'e-trike' NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"license_number" text,
	"plate_number" text,
	"vehicle_color" text,
	"approval_status" text DEFAULT 'approved' NOT NULL,
	"review_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"is_on_shift" boolean DEFAULT false NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"current_lat" double precision,
	"current_lon" double precision,
	"last_location_at" timestamp with time zone,
	"rating" double precision DEFAULT 0 NOT NULL,
	"total_trips" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "driver_profiles_capacity_positive_check" CHECK ("driver_profiles"."capacity" > 0),
	CONSTRAINT "driver_profiles_approval_status_check" CHECK ("driver_profiles"."approval_status" in ('pending', 'approved', 'rejected', 'revoked')),
	CONSTRAINT "driver_profiles_location_bounds_check" CHECK (("driver_profiles"."current_lat" is null and "driver_profiles"."current_lon" is null) or ("driver_profiles"."current_lat" between -90 and 90 and "driver_profiles"."current_lon" between -180 and 180)),
	CONSTRAINT "driver_profiles_rating_range_check" CHECK ("driver_profiles"."rating" between 0 and 5),
	CONSTRAINT "driver_profiles_total_trips_nonnegative_check" CHECK ("driver_profiles"."total_trips" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trip_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"rater_id" uuid NOT NULL,
	"ratee_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_ratings_rating_range_check" CHECK ("trip_ratings"."rating" between 1 and 5),
	CONSTRAINT "trip_ratings_different_users_check" CHECK ("trip_ratings"."rater_id" <> "trip_ratings"."ratee_id")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"passenger_id" uuid NOT NULL,
	"driver_id" uuid,
	"pickup_lat" double precision NOT NULL,
	"pickup_lon" double precision NOT NULL,
	"pickup_address" text,
	"dropoff_lat" double precision NOT NULL,
	"dropoff_lon" double precision NOT NULL,
	"dropoff_address" text,
	"passenger_count" integer DEFAULT 1 NOT NULL,
	"client_request_id" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"fare_amount" double precision,
	"fare_policy_id" integer,
	"distance_km" double precision,
	"route_duration_seconds" integer,
	"route_polyline" text,
	"distance_source" text,
	"cancel_reason" text,
	"cancel_reason_code" text,
	"cancel_details" text,
	"cancelled_by" uuid,
	"pickup_code" text,
	"matched_at" timestamp with time zone,
	"offer_expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_passenger_count_positive_check" CHECK ("trips"."passenger_count" between 1 and 15),
	CONSTRAINT "trips_coordinates_check" CHECK ("trips"."pickup_lat" between -90 and 90 and "trips"."dropoff_lat" between -90 and 90 and "trips"."pickup_lon" between -180 and 180 and "trips"."dropoff_lon" between -180 and 180),
	CONSTRAINT "trips_fare_nonnegative_check" CHECK ("trips"."fare_amount" is null or "trips"."fare_amount" >= 0),
	CONSTRAINT "trips_distance_nonnegative_check" CHECK ("trips"."distance_km" is null or "trips"."distance_km" >= 0),
	CONSTRAINT "trips_status_check" CHECK ("trips"."status" in ('requested', 'matched', 'accepted', 'arrived', 'in_progress', 'completing', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "loop_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"base_fare" double precision DEFAULT 0 NOT NULL,
	"distance_km" double precision,
	"route_duration_seconds" integer,
	"route_polyline" text,
	"distance_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loop_stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loop_stops_sequence_positive_check" CHECK ("loop_stops"."sequence" > 0),
	CONSTRAINT "loop_stops_coordinates_check" CHECK ("loop_stops"."lat" between -90 and 90 and "loop_stops"."lon" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "loop_vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"driver_id" uuid NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"current_lat" double precision,
	"current_lon" double precision,
	"current_stop_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loop_vehicles_status_check" CHECK ("loop_vehicles"."status" in ('idle', 'on_route', 'off_duty')),
	CONSTRAINT "loop_vehicles_coordinates_check" CHECK (("loop_vehicles"."current_lat" is null and "loop_vehicles"."current_lon" is null) or ("loop_vehicles"."current_lat" between -90 and 90 and "loop_vehicles"."current_lon" between -180 and 180))
);
--> statement-breakpoint
CREATE TABLE "fare_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" double precision NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"reference_id" text,
	"idempotency_key" text,
	"balance_before" double precision NOT NULL,
	"balance_after" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fare_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"balance" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fare_wallets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "pending_top_ups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" double precision NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fare_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'Point-to-point fare' NOT NULL,
	"base_fare" double precision NOT NULL,
	"per_km_fare" double precision NOT NULL,
	"minimum_fare" double precision NOT NULL,
	"extra_passenger_fare" double precision NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fare_policies_nonnegative_check" CHECK ("fare_policies"."base_fare" >= 0 and "fare_policies"."per_km_fare" >= 0 and "fare_policies"."minimum_fare" >= 0 and "fare_policies"."extra_passenger_fare" >= 0)
);
--> statement-breakpoint
CREATE TABLE "incident_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"trip_id" integer,
	"type" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"severity" text NOT NULL,
	"description" text,
	"photo_url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" text DEFAULT 'annual' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('active', 'expired', 'cancelled')),
	CONSTRAINT "subscriptions_plan_check" CHECK ("subscriptions"."plan" in ('annual', 'basic_weekly', 'premium_monthly', 'premium_yearly')),
	CONSTRAINT "subscriptions_date_order_check" CHECK ("subscriptions"."expires_at" > "subscriptions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_user_id" uuid,
	"amount" double precision,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_location_points" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"driver_id" uuid NOT NULL,
	"trip_id" integer,
	"loop_route_id" integer,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position" geometry(point) NOT NULL,
	"accuracy_m" double precision,
	"speed_mps" double precision,
	"heading_degrees" double precision,
	"device_point_id" text,
	"source" text DEFAULT 'driver_app' NOT NULL,
	"is_mocked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "driver_location_points_accuracy_check" CHECK ("driver_location_points"."accuracy_m" is null or "driver_location_points"."accuracy_m" >= 0),
	CONSTRAINT "driver_location_points_speed_check" CHECK ("driver_location_points"."speed_mps" is null or "driver_location_points"."speed_mps" >= 0),
	CONSTRAINT "driver_location_points_heading_check" CHECK ("driver_location_points"."heading_degrees" is null or ("driver_location_points"."heading_degrees" >= 0 and "driver_location_points"."heading_degrees" < 360))
);
--> statement-breakpoint
CREATE TABLE "gis_audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gis_route_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"geometry_geojson" jsonb NOT NULL,
	"supporting_runs" integer DEFAULT 0 NOT NULL,
	"supporting_drivers" integer DEFAULT 0 NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"distance_km" double precision,
	"source_window_start" timestamp with time zone,
	"source_window_end" timestamp with time zone,
	"created_by" uuid,
	"reviewed_by" uuid,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "gis_route_candidates_status_check" CHECK ("gis_route_candidates"."status" in ('draft', 'reviewing', 'approved', 'rejected', 'published')),
	CONSTRAINT "gis_route_candidates_supporting_runs_check" CHECK ("gis_route_candidates"."supporting_runs" >= 0),
	CONSTRAINT "gis_route_candidates_supporting_drivers_check" CHECK ("gis_route_candidates"."supporting_drivers" >= 0),
	CONSTRAINT "gis_route_candidates_confidence_check" CHECK ("gis_route_candidates"."confidence" >= 0 and "gis_route_candidates"."confidence" <= 1),
	CONSTRAINT "gis_route_candidates_distance_check" CHECK ("gis_route_candidates"."distance_km" is null or "gis_route_candidates"."distance_km" >= 0),
	CONSTRAINT "gis_route_candidates_source_window_check" CHECK ("gis_route_candidates"."source_window_start" is null or "gis_route_candidates"."source_window_end" is null or "gis_route_candidates"."source_window_end" >= "gis_route_candidates"."source_window_start")
);
--> statement-breakpoint
CREATE TABLE "device_push_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"app" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_ratings" ADD CONSTRAINT "trip_ratings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_ratings" ADD CONSTRAINT "trip_ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_ratings" ADD CONSTRAINT "trip_ratings_ratee_id_users_id_fk" FOREIGN KEY ("ratee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_fare_policy_id_fare_policies_id_fk" FOREIGN KEY ("fare_policy_id") REFERENCES "public"."fare_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loop_stops" ADD CONSTRAINT "loop_stops_route_id_loop_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."loop_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loop_vehicles" ADD CONSTRAINT "loop_vehicles_route_id_loop_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."loop_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loop_vehicles" ADD CONSTRAINT "loop_vehicles_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loop_vehicles" ADD CONSTRAINT "loop_vehicles_current_stop_id_loop_stops_id_fk" FOREIGN KEY ("current_stop_id") REFERENCES "public"."loop_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fare_transactions" ADD CONSTRAINT "fare_transactions_wallet_id_fare_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."fare_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fare_transactions" ADD CONSTRAINT "fare_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fare_wallets" ADD CONSTRAINT "fare_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_top_ups" ADD CONSTRAINT "pending_top_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fare_policies" ADD CONSTRAINT "fare_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_location_points" ADD CONSTRAINT "driver_location_points_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_location_points" ADD CONSTRAINT "driver_location_points_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_location_points" ADD CONSTRAINT "driver_location_points_loop_route_id_loop_routes_id_fk" FOREIGN KEY ("loop_route_id") REFERENCES "public"."loop_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis_audit_events" ADD CONSTRAINT "gis_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis_route_candidates" ADD CONSTRAINT "gis_route_candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gis_route_candidates" ADD CONSTRAINT "gis_route_candidates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "trip_ratings_trip_id_idx" ON "trip_ratings" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_ratings_ratee_id_idx" ON "trip_ratings" USING btree ("ratee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_ratings_trip_rater_unique_idx" ON "trip_ratings" USING btree ("trip_id","rater_id");--> statement-breakpoint
CREATE INDEX "trips_passenger_id_idx" ON "trips" USING btree ("passenger_id");--> statement-breakpoint
CREATE INDEX "trips_driver_id_idx" ON "trips" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "trips_passenger_created_idx" ON "trips" USING btree ("passenger_id","created_at");--> statement-breakpoint
CREATE INDEX "trips_driver_created_idx" ON "trips" USING btree ("driver_id","created_at");--> statement-breakpoint
CREATE INDEX "trips_status_idx" ON "trips" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_client_request_id_unique_idx" ON "trips" USING btree ("passenger_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_active_driver_unique_idx" ON "trips" USING btree ("driver_id") WHERE "trips"."status" in ('matched', 'accepted', 'arrived', 'in_progress');--> statement-breakpoint
CREATE UNIQUE INDEX "trips_active_passenger_unique_idx" ON "trips" USING btree ("passenger_id") WHERE "trips"."status" in ('requested', 'matched', 'accepted', 'arrived', 'in_progress');--> statement-breakpoint
CREATE INDEX "loop_stops_route_id_idx" ON "loop_stops" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loop_stops_route_sequence_idx" ON "loop_stops" USING btree ("route_id","sequence");--> statement-breakpoint
CREATE INDEX "loop_vehicles_route_id_idx" ON "loop_vehicles" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "loop_vehicles_driver_id_idx" ON "loop_vehicles" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "fare_transactions_user_id_idx" ON "fare_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fare_transactions_user_created_idx" ON "fare_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "fare_transactions_wallet_id_idx" ON "fare_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fare_transactions_idempotency_key_unique" ON "fare_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "pending_top_ups_user_id_idx" ON "pending_top_ups" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_top_ups_provider_ref_unique" ON "pending_top_ups" USING btree ("provider_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "fare_policies_one_active_idx" ON "fare_policies" USING btree ("is_active") WHERE "fare_policies"."is_active" = true;--> statement-breakpoint
CREATE INDEX "fare_policies_created_at_idx" ON "fare_policies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "incident_reports_reporter_id_idx" ON "incident_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "incident_reports_created_at_idx" ON "incident_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "incident_reports_trip_id_idx" ON "incident_reports" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_created_idx" ON "subscriptions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_active_per_user_idx" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_user_id_idx" ON "audit_logs" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "driver_location_points_driver_time_idx" ON "driver_location_points" USING btree ("driver_id","captured_at");--> statement-breakpoint
CREATE INDEX "driver_location_points_trip_time_idx" ON "driver_location_points" USING btree ("trip_id","captured_at");--> statement-breakpoint
CREATE INDEX "driver_location_points_position_gist_idx" ON "driver_location_points" USING gist ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_location_points_device_point_unique" ON "driver_location_points" USING btree ("driver_id","device_point_id");--> statement-breakpoint
CREATE INDEX "gis_audit_events_actor_idx" ON "gis_audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "gis_audit_events_created_idx" ON "gis_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gis_route_candidates_status_idx" ON "gis_route_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gis_route_candidates_created_at_idx" ON "gis_route_candidates" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_push_tokens_token_unique_idx" ON "device_push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "device_push_tokens_user_idx" ON "device_push_tokens" USING btree ("user_id");
