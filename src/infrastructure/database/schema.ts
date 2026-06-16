import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Meta = typeof meta.$inferSelect;
export type NewMeta = typeof meta.$inferInsert;
