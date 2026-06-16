import { eq, asc } from 'drizzle-orm';
import type { DrizzleDB } from '../client';
import {
  users,
  audiences,
  publications,
  publicationImages,
  scheduledMessages,
} from '../schema';
import type { SerializedSchedule } from '../schema';
import {
  Audience,
  Publication,
  ScheduledMessage,
  User,
  type PublicationImage,
  type Schedule,
  type UserStore,
} from '../../../domain';

function serializeSchedule(schedule: Schedule): SerializedSchedule {
  if (schedule.kind === 'once') {
    return { kind: 'once', date: schedule.date.toISOString() };
  }
  return { kind: 'weekly', weekdays: schedule.weekdays, time: schedule.time };
}

function deserializeSchedule(schedule: SerializedSchedule): Schedule {
  if (schedule.kind === 'once') {
    return { kind: 'once', date: new Date(schedule.date) };
  }
  return { kind: 'weekly', weekdays: schedule.weekdays, time: schedule.time };
}

export class UserRepository implements UserStore {
  constructor(private readonly db: DrizzleDB) {}

  loadOrCreate(fallbackId: string): User {
    const existing = this.db.select().from(users).orderBy(asc(users.createdAt)).limit(1).all();
    const userId = existing[0]?.id ?? fallbackId;
    if (!existing[0]) {
      this.db.insert(users).values({ id: userId }).run();
    }

    const user = new User(userId);

    const audienceRows = this.db
      .select()
      .from(audiences)
      .where(eq(audiences.userId, userId))
      .all();
    for (const row of audienceRows) {
      user.hydrateAudience(new Audience(row.id, row.name, [...(row.recipients ?? [])]));
    }

    const publicationRows = this.db
      .select()
      .from(publications)
      .where(eq(publications.userId, userId))
      .all();
    for (const row of publicationRows) {
      const imageRows = this.db
        .select()
        .from(publicationImages)
        .where(eq(publicationImages.publicationId, row.id))
        .orderBy(asc(publicationImages.position))
        .all();
      const images: PublicationImage[] = imageRows.map((image) => ({
        mimetype: image.mimetype,
        data: image.data,
        filename: image.filename ?? undefined,
        caption: image.caption ?? undefined,
      }));
      user.hydratePublication(new Publication(row.id, row.name, row.text, images));
    }

    const scheduledRows = this.db
      .select()
      .from(scheduledMessages)
      .where(eq(scheduledMessages.userId, userId))
      .all();
    for (const row of scheduledRows) {
      const scheduled = new ScheduledMessage(
        row.id,
        row.audienceId,
        row.publicationId,
        deserializeSchedule(row.schedule),
      );
      scheduled.status = row.status;
      scheduled.lastFiredKey = row.lastFiredKey;
      user.hydrateScheduledMessage(scheduled);
    }

    user.attachStore(this);
    return user;
  }

  saveAudience(userId: string, audience: Audience): void {
    this.db
      .insert(audiences)
      .values({
        id: audience.id,
        userId,
        name: audience.name,
        recipients: [...audience.recipients],
      })
      .onConflictDoUpdate({
        target: audiences.id,
        set: { name: audience.name, recipients: [...audience.recipients] },
      })
      .run();
  }

  removeAudience(_userId: string, audienceId: string): void {
    this.db.delete(audiences).where(eq(audiences.id, audienceId)).run();
  }

  savePublication(userId: string, publication: Publication): void {
    this.db.transaction((tx) => {
      tx.insert(publications)
        .values({ id: publication.id, userId, name: publication.name, text: publication.text })
        .onConflictDoUpdate({
          target: publications.id,
          set: { name: publication.name, text: publication.text },
        })
        .run();
      tx.delete(publicationImages)
        .where(eq(publicationImages.publicationId, publication.id))
        .run();
      publication.images.forEach((image, index) => {
        tx.insert(publicationImages)
          .values({
            publicationId: publication.id,
            position: index,
            mimetype: image.mimetype,
            data: image.data,
            filename: image.filename ?? null,
            caption: image.caption ?? null,
          })
          .run();
      });
    });
  }

  removePublication(_userId: string, publicationId: string): void {
    this.db.delete(publications).where(eq(publications.id, publicationId)).run();
  }

  saveScheduledMessage(userId: string, scheduledMessage: ScheduledMessage): void {
    this.db
      .insert(scheduledMessages)
      .values({
        id: scheduledMessage.id,
        userId,
        audienceId: scheduledMessage.audienceId,
        publicationId: scheduledMessage.publicationId,
        schedule: serializeSchedule(scheduledMessage.schedule),
        status: scheduledMessage.status,
        lastFiredKey: scheduledMessage.lastFiredKey,
      })
      .onConflictDoUpdate({
        target: scheduledMessages.id,
        set: {
          schedule: serializeSchedule(scheduledMessage.schedule),
          status: scheduledMessage.status,
          lastFiredKey: scheduledMessage.lastFiredKey,
        },
      })
      .run();
  }

  removeScheduledMessage(_userId: string, scheduledMessageId: string): void {
    this.db.delete(scheduledMessages).where(eq(scheduledMessages.id, scheduledMessageId)).run();
  }
}
