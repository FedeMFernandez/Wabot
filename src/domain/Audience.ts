export class Audience {
  readonly id: string;
  name: string;
  readonly recipients: string[];

  constructor(id: string, name: string, recipients: string[] = []) {
    this.id = id;
    this.name = name;
    this.recipients = recipients;
  }

  addRecipient(chatId: string): void {
    if (!this.recipients.includes(chatId)) {
      this.recipients.push(chatId);
    }
  }

  removeRecipient(chatId: string): void {
    const index = this.recipients.indexOf(chatId);
    if (index !== -1) {
      this.recipients.splice(index, 1);
    }
  }

  isEmpty(): boolean {
    return this.recipients.length === 0;
  }
}
