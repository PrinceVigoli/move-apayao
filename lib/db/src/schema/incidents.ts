import {
  pgTable,
  serial,
  text,
  uuid,
  doublePrecision,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const incidentReportsTable = pgTable(
  "incident_reports",
  {
    id: serial("id").primaryKey(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => usersTable.id),
    type: text("type").notNull(), // accident | flood | fleet_issue
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    severity: text("severity").notNull(), // low | medium | high | critical
    description: text("description"),
    photoUrl: text("photo_url"),
    status: text("status").notNull().default("open"), // open | reviewing | resolved
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reporterIdx: index("incident_reports_reporter_id_idx").on(table.reporterId),
    createdIdx: index("incident_reports_created_at_idx").on(table.createdAt),
  }),
);

export const insertIncidentReportSchema = createInsertSchema(incidentReportsTable).omit({
  id: true,
  status: true,
  resolvedAt: true,
  resolvedBy: true,
  createdAt: true,
  reporterId: true,
});
export type InsertIncidentReport = z.infer<typeof insertIncidentReportSchema>;
export type IncidentReport = typeof incidentReportsTable.$inferSelect;
