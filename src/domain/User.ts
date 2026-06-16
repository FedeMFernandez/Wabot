import { Audience } from './Audience';
import { Publication } from './Publication';
import { ScheduledMessage } from './ScheduledMessage';

export interface UserStore {
  saveAudience(userId: string, audience: Audience): void;
  removeAudience(userId: string, audienceId: string): void;
  savePublication(userId: string, publication: Publication): void;
  removePublication(userId: string, publicationId: string): void;
  saveScheduledMessage(userId: string, scheduledMessage: ScheduledMessage): void;
  removeScheduledMessage(userId: string, scheduledMessageId: string): void;
}

export class User {
  readonly id: string;
  private store: UserStore | null = null;
  private readonly audiences = new Map<string, Audience>();
  private readonly publications = new Map<string, Publication>();
  private readonly scheduledMessages = new Map<string, ScheduledMessage>();

  constructor(id: string) {
    this.id = id;
  }

  attachStore(store: UserStore): void {
    this.store = store;
  }

  hydrateAudience(audience: Audience): void {
    this.audiences.set(audience.id, audience);
  }

  hydratePublication(publication: Publication): void {
    this.publications.set(publication.id, publication);
  }

  hydrateScheduledMessage(scheduledMessage: ScheduledMessage): void {
    this.scheduledMessages.set(scheduledMessage.id, scheduledMessage);
  }

  addAudience(audience: Audience): void {
    this.audiences.set(audience.id, audience);
    this.store?.saveAudience(this.id, audience);
  }

  getAudience(id: string): Audience | undefined {
    return this.audiences.get(id);
  }

  listAudiences(): Audience[] {
    return [...this.audiences.values()];
  }

  removeAudience(id: string): boolean {
    const removed = this.audiences.delete(id);
    if (removed) this.store?.removeAudience(this.id, id);
    return removed;
  }

  persistAudience(audience: Audience): void {
    this.store?.saveAudience(this.id, audience);
  }

  addPublication(publication: Publication): void {
    this.publications.set(publication.id, publication);
    this.store?.savePublication(this.id, publication);
  }

  getPublication(id: string): Publication | undefined {
    return this.publications.get(id);
  }

  listPublications(): Publication[] {
    return [...this.publications.values()];
  }

  removePublication(id: string): boolean {
    const removed = this.publications.delete(id);
    if (removed) this.store?.removePublication(this.id, id);
    return removed;
  }

  persistPublication(publication: Publication): void {
    this.store?.savePublication(this.id, publication);
  }

  addScheduledMessage(scheduledMessage: ScheduledMessage): void {
    this.scheduledMessages.set(scheduledMessage.id, scheduledMessage);
    this.store?.saveScheduledMessage(this.id, scheduledMessage);
  }

  getScheduledMessage(id: string): ScheduledMessage | undefined {
    return this.scheduledMessages.get(id);
  }

  listScheduledMessages(): ScheduledMessage[] {
    return [...this.scheduledMessages.values()];
  }

  removeScheduledMessage(id: string): boolean {
    const removed = this.scheduledMessages.delete(id);
    if (removed) this.store?.removeScheduledMessage(this.id, id);
    return removed;
  }

  persistScheduledMessage(scheduledMessage: ScheduledMessage): void {
    this.store?.saveScheduledMessage(this.id, scheduledMessage);
  }
}
