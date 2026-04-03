import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Single-row config table — stores the project's write key and ingest endpoint.
  // Populated by calling analytics.configure(ctx) once during app setup.
  config: defineTable({
    writeKey: v.string(),
    ingestUrl: v.string(),
  }),
});
