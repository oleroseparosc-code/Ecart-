import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sharedState = sqliteTable("shared_state", {
  key: text("key").primaryKey(),
  payload: text("payload").notNull(),
  sha: text("sha").notNull(),
  updatedAt: text("updated_at").notNull(),
});
