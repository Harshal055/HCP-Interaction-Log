import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  time,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { hcpsTable } from "./hcps";

export const interactionsTable = pgTable("interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hcpId: uuid("hcp_id").references(() => hcpsTable.id, {
    onDelete: "set null",
  }),
  hcpName: varchar("hcp_name", { length: 255 }),
  interactionType: varchar("interaction_type", { length: 100 }),
  interactionDate: date("interaction_date"),
  interactionTime: time("interaction_time"),
  attendees: text("attendees").array().notNull().default([]),
  topicsDiscussed: text("topics_discussed"),
  materialsShared: text("materials_shared").array().notNull().default([]),
  samplesDistributed: text("samples_distributed").array().notNull().default([]),
  sentiment: varchar("sentiment", { length: 50 }),
  outcomes: text("outcomes"),
  followUpActions: text("follow_up_actions"),
  aiSummary: text("ai_summary"),
  sourceMode: varchar("source_mode", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertInteractionSchema = createInsertSchema(
  interactionsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Interaction = typeof interactionsTable.$inferSelect;
