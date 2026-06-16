import type { ScheduledMessage, User } from '../../domain';
import type { WhatsAppService } from './WhatsAppService';
import { logDebug, logError } from '../../infrastructure/logging';

const TICK_INTERVAL_MS = 30_000;

export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly user: User,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick(new Date());
    }, TICK_INTERVAL_MS);
    logDebug('SchedulerService iniciado.');
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logDebug('SchedulerService detenido.');
  }

  private async tick(now: Date): Promise<void> {
    for (const scheduled of this.user.listScheduledMessages()) {
      if (!this.isDue(scheduled, now)) continue;
      await this.fire(scheduled, now);
    }
  }

  private isDue(scheduled: ScheduledMessage, now: Date): boolean {
    const { schedule } = scheduled;
    if (schedule.kind === 'once') {
      if (scheduled.status === 'sent') return false;
      return this.sameMinute(schedule.date, now) || schedule.date.getTime() <= now.getTime();
    }

    if (!schedule.weekdays.includes(now.getDay())) return false;
    const time = this.formatTime(now);
    if (time !== schedule.time) return false;
    const fireKey = `${this.dayKey(now)} ${schedule.time}`;
    return scheduled.lastFiredKey !== fireKey;
  }

  private async fire(scheduled: ScheduledMessage, now: Date): Promise<void> {
    const audience = this.user.getAudience(scheduled.audienceId);
    const publication = this.user.getPublication(scheduled.publicationId);

    if (!audience || !publication) {
      logError(
        `Mensaje programado ${scheduled.id} sin grupo o publicación; se omite y marca enviado.`,
      );
      this.markFired(scheduled, now);
      return;
    }

    try {
      const { ok, fail } = await this.whatsapp.sendPublicationToRecipients(
        audience.recipients,
        publication,
      );
      logDebug(
        `Mensaje programado ${scheduled.id} enviado: ${ok} ok, ${fail} con error.`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logError(`Error disparando mensaje programado ${scheduled.id}: ${reason}`);
    } finally {
      this.markFired(scheduled, now);
    }
  }

  private markFired(scheduled: ScheduledMessage, now: Date): void {
    if (scheduled.schedule.kind === 'once') {
      scheduled.markSent();
      this.user.removeScheduledMessage(scheduled.id);
      return;
    }
    scheduled.lastFiredKey = `${this.dayKey(now)} ${scheduled.schedule.time}`;
  }

  private sameMinute(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate() &&
      a.getHours() === b.getHours() &&
      a.getMinutes() === b.getMinutes()
    );
  }

  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private formatTime(date: Date): string {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}
