import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { interactionsTable } from "./interactions";

export const interactionAuditTable = pgTable("interaction_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  interactionId: uuid("interaction_id")
    .notNull()
    .references(() => interactionsTable.id, { onDelete: "cascade" }),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  changeSummary: text("change_summary"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertInteractionAuditSchema = createInsertSchema(
  interactionAuditTable,
).omit({ id: true, createdAt: true });
export type InsertInteractionAudit = z.infer<
  typeof insertInteractionAuditSchema
>;
export type InteractionAudit = typeof interactionAuditTable.$inferSelect;
