// Export Zod schemas and their inferred TypeScript types.
// The generated/api.ts file already exports z.infer<> types for every schema,
// so we do NOT generate a separate generated/types output (see
// lib/api-spec/orval.config.ts) — that used to cause TS2308 naming
// collisions since Orval derives the same name for both the Zod schema and
// the plain TypeScript interface (e.g. ListTripsResponse, GetLoopVehiclesParams).
export * from "./generated/api";
