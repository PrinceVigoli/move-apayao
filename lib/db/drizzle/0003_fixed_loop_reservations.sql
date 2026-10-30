CREATE TABLE "fixed_loop_places" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_id" integer NOT NULL,
	"run_id" integer NOT NULL,
	"place_type" text NOT NULL,
	"place_number" integer NOT NULL,
	"segment" integer NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "fixed_loop_place_number_check" CHECK (("fixed_loop_places"."place_type" = 'seated' and "fixed_loop_places"."place_number" between 1 and 19) or ("fixed_loop_places"."place_type" = 'standing' and "fixed_loop_places"."place_number" between 1 and 10)),
	CONSTRAINT "fixed_loop_place_segment_check" CHECK ("fixed_loop_places"."segment" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fixed_loop_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"passenger_id" uuid,
	"booked_by_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"pickup_index" integer NOT NULL,
	"dropoff_index" integer NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixed_loop_reservation_stops_check" CHECK ("fixed_loop_reservations"."pickup_index" >= 0 and "fixed_loop_reservations"."dropoff_index" > "fixed_loop_reservations"."pickup_index"),
	CONSTRAINT "fixed_loop_reservation_source_check" CHECK (("fixed_loop_reservations"."source" = 'app' and "fixed_loop_reservations"."passenger_id" is not null) or ("fixed_loop_reservations"."source" = 'walk_in' and "fixed_loop_reservations"."passenger_id" is null)),
	CONSTRAINT "fixed_loop_reservation_status_check" CHECK ("fixed_loop_reservations"."status" in ('confirmed', 'boarded', 'completed', 'cancelled', 'no_show'))
);
--> statement-breakpoint
CREATE TABLE "fixed_loop_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"unit_label" text NOT NULL,
	"service_date" date NOT NULL,
	"direction" text NOT NULL,
	"departure_at" timestamp with time zone NOT NULL,
	"arrival_at" timestamp with time zone NOT NULL,
	"stops" jsonb NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"current_stop_index" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "fixed_loop_run_direction_check" CHECK ("fixed_loop_runs"."direction" in ('to_asc', 'to_pudtol')),
	CONSTRAINT "fixed_loop_run_status_check" CHECK ("fixed_loop_runs"."status" in ('scheduled', 'boarding', 'on_route', 'completed', 'cancelled')),
	CONSTRAINT "fixed_loop_run_times_check" CHECK ("fixed_loop_runs"."arrival_at" > "fixed_loop_runs"."departure_at"),
	CONSTRAINT "fixed_loop_run_stop_index_check" CHECK ("fixed_loop_runs"."current_stop_index" >= 0 and "fixed_loop_runs"."current_stop_index" < jsonb_array_length("fixed_loop_runs"."stops"))
);
--> statement-breakpoint
CREATE TABLE "fixed_loop_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"vehicle_id" integer NOT NULL,
	"unit_label" text NOT NULL,
	"outbound_stops" jsonb NOT NULL,
	"return_stops" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fixed_loop_services_key_unique" UNIQUE("key"),
	CONSTRAINT "fixed_loop_services_vehicle_id_unique" UNIQUE("vehicle_id"),
	CONSTRAINT "fixed_loop_outbound_stops_check" CHECK (jsonb_typeof("fixed_loop_services"."outbound_stops") = 'array' and jsonb_array_length("fixed_loop_services"."outbound_stops") >= 2),
	CONSTRAINT "fixed_loop_return_stops_check" CHECK (jsonb_typeof("fixed_loop_services"."return_stops") = 'array' and jsonb_array_length("fixed_loop_services"."return_stops") >= 2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_loop_reservation_run_id_idx" ON "fixed_loop_reservations" USING btree ("id","run_id");--> statement-breakpoint
ALTER TABLE "fixed_loop_places" ADD CONSTRAINT "fixed_loop_places_run_id_fixed_loop_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."fixed_loop_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_loop_places" ADD CONSTRAINT "fixed_loop_places_reservation_fk" FOREIGN KEY ("reservation_id","run_id") REFERENCES "public"."fixed_loop_reservations"("id","run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_loop_reservations" ADD CONSTRAINT "fixed_loop_reservations_run_id_fixed_loop_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."fixed_loop_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_loop_reservations" ADD CONSTRAINT "fixed_loop_reservations_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_loop_reservations" ADD CONSTRAINT "fixed_loop_reservations_booked_by_id_users_id_fk" FOREIGN KEY ("booked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_loop_runs" ADD CONSTRAINT "fixed_loop_runs_service_id_fixed_loop_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."fixed_loop_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_loop_runs" ADD CONSTRAINT "fixed_loop_runs_vehicle_id_loop_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."loop_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_loop_services" ADD CONSTRAINT "fixed_loop_services_vehicle_id_loop_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."loop_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_loop_place_segment_unique_idx" ON "fixed_loop_places" USING btree ("run_id","place_type","place_number","segment") WHERE "fixed_loop_places"."released_at" is null;--> statement-breakpoint
CREATE INDEX "fixed_loop_places_reservation_idx" ON "fixed_loop_places" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_loop_reservation_request_idx" ON "fixed_loop_reservations" USING btree ("booked_by_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_loop_passenger_active_run_idx" ON "fixed_loop_reservations" USING btree ("run_id","passenger_id") WHERE "fixed_loop_reservations"."status" in ('confirmed', 'boarded');--> statement-breakpoint
CREATE INDEX "fixed_loop_reservation_passenger_idx" ON "fixed_loop_reservations" USING btree ("passenger_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_loop_runs_departure_idx" ON "fixed_loop_runs" USING btree ("service_id","departure_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_loop_one_active_run_idx" ON "fixed_loop_runs" USING btree ("vehicle_id") WHERE "fixed_loop_runs"."status" in ('boarding', 'on_route');--> statement-breakpoint
CREATE INDEX "fixed_loop_runs_date_idx" ON "fixed_loop_runs" USING btree ("service_id","service_date");