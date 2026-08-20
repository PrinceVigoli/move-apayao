CREATE TABLE "fleet_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plate_number" text NOT NULL,
	"label" text,
	"vehicle_type" text DEFAULT 'e-jeepney' NOT NULL,
	"capacity" integer DEFAULT 15 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"current_lat" double precision,
	"current_lon" double precision,
	"last_location_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_vehicles_plate_number_unique" UNIQUE("plate_number"),
	CONSTRAINT "fleet_vehicles_capacity_check" CHECK ("fleet_vehicles"."capacity" between 1 and 100),
	CONSTRAINT "fleet_vehicles_coordinates_check" CHECK (("fleet_vehicles"."current_lat" is null and "fleet_vehicles"."current_lon" is null) or ("fleet_vehicles"."current_lat" between -90 and 90 and "fleet_vehicles"."current_lon" between -180 and 180))
);
--> statement-breakpoint
CREATE TABLE "gps_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"label" text,
	"protocol" text DEFAULT 'https_json_v1' NOT NULL,
	"token_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_battery_percent" double precision,
	"last_signal_dbm" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gps_devices_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "gps_devices_battery_check" CHECK ("gps_devices"."last_battery_percent" is null or "gps_devices"."last_battery_percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "vehicle_driver_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unassigned_at" timestamp with time zone,
	"created_by" uuid,
	CONSTRAINT "vehicle_driver_assignments_date_order_check" CHECK ("vehicle_driver_assignments"."unassigned_at" is null or "vehicle_driver_assignments"."unassigned_at" >= "vehicle_driver_assignments"."assigned_at")
);
--> statement-breakpoint
CREATE TABLE "vehicle_location_points" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"driver_id" uuid,
	"event_id" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position" geometry(point) NOT NULL,
	"accuracy_m" double precision,
	"speed_mps" double precision,
	"heading_degrees" double precision,
	"battery_percent" double precision,
	"signal_dbm" double precision,
	CONSTRAINT "vehicle_location_points_accuracy_check" CHECK ("vehicle_location_points"."accuracy_m" is null or "vehicle_location_points"."accuracy_m" between 0 and 10000),
	CONSTRAINT "vehicle_location_points_speed_check" CHECK ("vehicle_location_points"."speed_mps" is null or "vehicle_location_points"."speed_mps" between 0 and 100),
	CONSTRAINT "vehicle_location_points_heading_check" CHECK ("vehicle_location_points"."heading_degrees" is null or ("vehicle_location_points"."heading_degrees" >= 0 and "vehicle_location_points"."heading_degrees" < 360)),
	CONSTRAINT "vehicle_location_points_battery_check" CHECK ("vehicle_location_points"."battery_percent" is null or "vehicle_location_points"."battery_percent" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "gps_devices" ADD CONSTRAINT "gps_devices_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_driver_assignments" ADD CONSTRAINT "vehicle_driver_assignments_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_driver_assignments" ADD CONSTRAINT "vehicle_driver_assignments_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_driver_assignments" ADD CONSTRAINT "vehicle_driver_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_points" ADD CONSTRAINT "vehicle_location_points_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_points" ADD CONSTRAINT "vehicle_location_points_device_id_gps_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."gps_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_location_points" ADD CONSTRAINT "vehicle_location_points_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fleet_vehicles_active_idx" ON "fleet_vehicles" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "gps_devices_vehicle_idx" ON "gps_devices" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gps_devices_active_vehicle_idx" ON "gps_devices" USING btree ("vehicle_id") WHERE "gps_devices"."is_active" = true;--> statement-breakpoint
CREATE INDEX "vehicle_driver_assignments_vehicle_idx" ON "vehicle_driver_assignments" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_driver_assignments_driver_idx" ON "vehicle_driver_assignments" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_driver_assignments_active_vehicle_idx" ON "vehicle_driver_assignments" USING btree ("vehicle_id") WHERE "vehicle_driver_assignments"."unassigned_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_driver_assignments_active_driver_idx" ON "vehicle_driver_assignments" USING btree ("driver_id") WHERE "vehicle_driver_assignments"."unassigned_at" is null;--> statement-breakpoint
CREATE INDEX "vehicle_location_points_vehicle_time_idx" ON "vehicle_location_points" USING btree ("vehicle_id","captured_at");--> statement-breakpoint
CREATE INDEX "vehicle_location_points_position_gist_idx" ON "vehicle_location_points" USING gist ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_location_points_device_event_idx" ON "vehicle_location_points" USING btree ("device_id","event_id");--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trips_vehicle_id_idx" ON "trips" USING btree ("vehicle_id");