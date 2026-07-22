export function normalizeChatId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes('@')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  return `${digits}@c.us`;
}

export function isGroupChatId(value: string): boolean {
  return normalizeChatId(value).endsWith('@g.us');
}

export class Audience {
  readonly id: string;
  name: string;
  readonly recipients: string[];

  constructor(id: string, name: string, recipients: string[] = []) {
    this.id = id;
    this.name = name;
    this.recipients = recipients;
  }

  rename(newName: string): void {
    this.name = newName.trim();
  }

  addRecipient(chatId: string): void {
    const normalized = normalizeChatId(chatId);
    if (!this.recipients.includes(normalized)) {
      this.recipients.push(normalized);
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
