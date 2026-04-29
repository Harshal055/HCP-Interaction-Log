import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hcpsTable = pgTable("hcps", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  specialty: varchar("specialty", { length: 255 }),
  institution: varchar("institution", { length: 255 }),
  territory: varchar("territory", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertHcpSchema = createInsertSchema(hcpsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertHcp = z.infer<typeof insertHcpSchema>;
export type Hcp = typeof hcpsTable.$inferSelect;
