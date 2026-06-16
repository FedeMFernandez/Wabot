import { Audience } from './Audience';
import { Publication } from './Publication';
import { ScheduledMessage } from './ScheduledMessage';

export class User {
  readonly id: string;
  private readonly audiences = new Map<string, Audience>();
  private readonly publications = new Map<string, Publication>();
  private readonly scheduledMessages = new Map<string, ScheduledMessage>();

  constructor(id: string) {
    this.id = id;
  }

  addAudience(audience: Audience): void {
    this.audiences.set(audience.id, audience);
  }

  getAudience(id: string): Audience | undefined {
    return this.audiences.get(id);
  }

  listAudiences(): Audience[] {
    return [...this.audiences.values()];
  }

  removeAudience(id: string): boolean {
    return this.audiences.delete(id);
  }

  addPublication(publication: Publication): void {
    this.publications.set(publication.id, publication);
  }

  getPublication(id: string): Publication | undefined {
    return this.publications.get(id);
  }

  listPublications(): Publication[] {
    return [...this.publications.values()];
  }

  removePublication(id: string): boolean {
    return this.publications.delete(id);
  }

  addScheduledMessage(scheduledMessage: ScheduledMessage): void {
    this.scheduledMessages.set(scheduledMessage.id, scheduledMessage);
  }

  getScheduledMessage(id: string): ScheduledMessage | undefined {
    return this.scheduledMessages.get(id);
  }

  listScheduledMessages(): ScheduledMessage[] {
    return [...this.scheduledMessages.values()];
  }

  removeScheduledMessage(id: string): boolean {
    return this.scheduledMessages.delete(id);
  }
}
