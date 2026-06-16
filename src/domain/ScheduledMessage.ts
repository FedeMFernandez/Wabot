export type ScheduleOnce = {
  kind: 'once';
  date: Date;
};

export type ScheduleWeekly = {
  kind: 'weekly';
  weekdays: number[];
  time: string;
};

export type Schedule = ScheduleOnce | ScheduleWeekly;

export type ScheduledMessageStatus = 'pending' | 'sent';

export class ScheduledMessage {
  readonly id: string;
  readonly audienceId: string;
  readonly publicationId: string;
  schedule: Schedule;
  status: ScheduledMessageStatus;
  lastFiredKey: string | null;

  constructor(
    id: string,
    audienceId: string,
    publicationId: string,
    schedule: Schedule,
  ) {
    this.id = id;
    this.audienceId = audienceId;
    this.publicationId = publicationId;
    this.schedule = schedule;
    this.status = 'pending';
    this.lastFiredKey = null;
  }

  markSent(): void {
    this.status = 'sent';
  }
}
