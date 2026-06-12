import {
  Buttons,
  MessageMedia,
  type Chat,
  type GroupChat,
  type Message,
} from 'whatsapp-web.js';
import type { WhatsAppClient } from '../../infrastructure/whatsapp';

export type MessageHandler = (message: Message) => void | Promise<void>;

export interface MenuButton {
  id?: string;
  body: string;
}

export class WhatsAppService {
  private readonly fromMeHandlers: MessageHandler[] = [];
  private readonly incomingHandlers: MessageHandler[] = [];
  private readonly selfSentIds = new Set<string>();

  constructor(private readonly client: WhatsAppClient) {}

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.registerMessageDetection();
      this.client.once('ready', () => {
        console.log('Cliente listo. Bot en línea.');
        resolve();
      });
      this.client.initialize();
    });
  }

  async buildMedia(source: string): Promise<MessageMedia | null> {
    if (!source) return null;
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return await MessageMedia.fromUrl(source);
    }
    return MessageMedia.fromFilePath(source);
  }

  async sendToChat(
    chatId: string,
    message: string,
    media: MessageMedia | null = null,
  ): Promise<void> {
    const sent = media
      ? await this.client.sendMessage(chatId, media, { caption: message })
      : await this.client.sendMessage(chatId, message);
    this.selfSentIds.add(sent.id._serialized);
  }

  async sendToNumber(
    number: string,
    message: string,
    media: MessageMedia | null = null,
  ): Promise<boolean> {
    const numberId = await this.client.getNumberId(number);
    if (!numberId) {
      console.warn(`El número ${number} no está registrado en WhatsApp.`);
      return false;
    }
    await this.sendToChat(numberId._serialized, message, media);
    return true;
  }

  async sendButtons(
    chatId: string,
    body: string,
    buttons: MenuButton[],
    title?: string,
    footer?: string,
  ): Promise<void> {
    const menu = new Buttons(body, buttons, title, footer);
    const sent = await this.client.sendMessage(chatId, menu);
    this.selfSentIds.add(sent.id._serialized);
  }

  async isSelfChat(message: Message): Promise<boolean> {
    if (!message.fromMe) return false;
    try {
      const contact = await this.client.getContactById(message.to);
      return contact.isMe === true;
    } catch {
      return false;
    }
  }

  onMessageFromMe(handler: MessageHandler): void {
    this.fromMeHandlers.push(handler);
  }

  onMessage(handler: MessageHandler): void {
    this.incomingHandlers.push(handler);
  }

  private registerMessageDetection(): void {
    this.client.on('message_create', async (message: Message) => {
      const id = message.id._serialized;
      if (this.selfSentIds.has(id)) {
        this.selfSentIds.delete(id);
        return;
      }
      const handlers = message.fromMe ? this.fromMeHandlers : this.incomingHandlers;
      console.log(`📩 Mensaje de ${message.from}: ${message.body}`);
      await this.dispatch(handlers, message);
    });
  }

  private async dispatch(handlers: MessageHandler[], message: Message): Promise<void> {
    for (const handler of handlers) {
      try {
        await handler(message);
      } catch (err) {
        console.error('Error en handler de mensaje:', (err as Error).message);
      }
    }
  }

  async listGroups(): Promise<GroupChat[]> {
    const chats: Chat[] = await this.client.getChats();
    return chats.filter((chat): chat is GroupChat => chat.isGroup);
  }
}
