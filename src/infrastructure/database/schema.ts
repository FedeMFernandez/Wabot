import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const audiences = sqliteTable('audiences', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  recipients: text('recipients', { mode: 'json' })
    .notNull()
    .$type<string[]>()
    .default([]),
});

export const publications = sqliteTable('publications', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  text: text('text').notNull().default(''),
});

export const publicationImages = sqliteTable('publication_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  publicationId: text('publication_id')
    .notNull()
    .references(() => publications.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  mimetype: text('mimetype').notNull(),
  data: text('data').notNull(),
  filename: text('filename'),
  caption: text('caption'),
});

export const scheduledMessages = sqliteTable('scheduled_messages', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  audienceId: text('audience_id').notNull(),
  publicationId: text('publication_id').notNull(),
  schedule: text('schedule', { mode: 'json' }).notNull().$type<SerializedSchedule>(),
  status: text('status', { enum: ['pending', 'sent'] }).notNull().default('pending'),
  lastFiredKey: text('last_fired_key'),
});

export const usersRelations = relations(users, ({ many }) => ({
  audiences: many(audiences),
  publications: many(publications),
  scheduledMessages: many(scheduledMessages),
}));

export const audiencesRelations = relations(audiences, ({ one }) => ({
  user: one(users, { fields: [audiences.userId], references: [users.id] }),
}));

export const publicationsRelations = relations(publications, ({ one, many }) => ({
  user: one(users, { fields: [publications.userId], references: [users.id] }),
  images: many(publicationImages),
}));

export const publicationImagesRelations = relations(publicationImages, ({ one }) => ({
  publication: one(publications, {
    fields: [publicationImages.publicationId],
    references: [publications.id],
  }),
}));

export const scheduledMessagesRelations = relations(scheduledMessages, ({ one }) => ({
  user: one(users, { fields: [scheduledMessages.userId], references: [users.id] }),
}));

export type SerializedScheduleOnce = { kind: 'once'; date: string };
export type SerializedScheduleWeekly = { kind: 'weekly'; weekdays: number[]; time: string };
export type SerializedSchedule = SerializedScheduleOnce | SerializedScheduleWeekly;

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type AudienceRow = typeof audiences.$inferSelect;
export type NewAudienceRow = typeof audiences.$inferInsert;
export type PublicationRow = typeof publications.$inferSelect;
export type NewPublicationRow = typeof publications.$inferInsert;
export type PublicationImageRow = typeof publicationImages.$inferSelect;
export type NewPublicationImageRow = typeof publicationImages.$inferInsert;
export type ScheduledMessageRow = typeof scheduledMessages.$inferSelect;
export type NewScheduledMessageRow = typeof scheduledMessages.$inferInsert;
