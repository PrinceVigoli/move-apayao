// Export Zod schemas and their inferred TypeScript types.
// The generated/api.ts file already exports z.infer<> types for every schema,
// so we do NOT re-export from generated/types to avoid TS2308 naming collisions
// that occur when Orval auto-derives the same name for both the Zod schema
// and the TypeScript interface (e.g. ListTripsResponse, GetLoopVehiclesParams).
export * from "./generated/api";
