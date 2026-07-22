import {
  Buttons,
  MessageMedia,
  type Chat,
  type GroupChat,
  type Message,
} from 'whatsapp-web.js';
import {
  expandSpintax,
  isGroupChatId,
  normalizeChatId,
  type Publication,
  type PublicationImage,
} from '../../domain';
import {
  delay,
  loadBroadcastConfig,
  randomBetween,
  type BroadcastConfig,
  type WhatsAppClient,
} from '../../infrastructure/whatsapp';
import { logAlways, logDebug, logError, logFatal, logWarn } from '../../infrastructure/logging';

export type MessageHandler = (message: Message) => void | Promise<void>;

export interface MenuButton {
  id?: string;
  body: string;
}

export class WhatsAppService {
  private readonly fromMeHandlers: MessageHandler[] = [];
  private readonly incomingHandlers: MessageHandler[] = [];
  private readonly selfSentIds = new Set<string>();
  private readonly broadcastConfig: BroadcastConfig = loadBroadcastConfig();

  constructor(private readonly client: WhatsAppClient) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.registerMessageDetection();
      this.client.once('ready', () => {
        logAlways('Cliente listo. Bot en línea.');
        resolve();
      });
      logAlways('Inicializando cliente de WhatsApp...');
      this.client.initialize().catch((err) => {
        const error = err as Error;
        logFatal('Error al inicializar el cliente:', error.message);
        logFatal(error.stack ?? error);
        reject(err);
      });
    });
  }

  async buildMedia(source: string): Promise<MessageMedia | null> {
    if (!source) return null;
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return await MessageMedia.fromUrl(source);
    }
    return MessageMedia.fromFilePath(source);
  }

  buildMediaFromImage(image: PublicationImage): MessageMedia {
    return new MessageMedia(image.mimetype, image.data, image.filename);
  }

  async sendToChat(
    chatId: string,
    message: string,
    media: MessageMedia | null = null,
  ): Promise<void> {
    const target = normalizeChatId(chatId);
    const sent = media
      ? await this.client.sendMessage(target, media, { caption: message })
      : await this.client.sendMessage(target, message);
    this.selfSentIds.add(sent.id._serialized);
  }

  async sendPublicationToChat(chatId: string, publication: Publication): Promise<void> {
    if (publication.images.length === 0) {
      await this.sendToChat(chatId, expandSpintax(publication.text));
      return;
    }
    for (const image of publication.images) {
      const media = this.buildMediaFromImage(image);
      await this.sendToChat(chatId, expandSpintax(image.caption ?? ''), media);
    }
    const hasAnyCaption = publication.images.some((image) => image.caption);
    if (publication.text && !hasAnyCaption) {
      await this.sendToChat(chatId, expandSpintax(publication.text));
    }
  }

  async sendPublicationToRecipients(
    recipients: string[],
    publication: Publication,
  ): Promise<{ ok: number; fail: number }> {
    let ok = 0;
    let fail = 0;
    for (let index = 0; index < recipients.length; index++) {
      const recipient = recipients[index];
      try {
        await this.simulateHumanPresence(recipient);
        await this.sendPublicationToChat(recipient, publication);
        ok++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logError(`Error enviando a ${recipient}: ${reason}`);
        fail++;
      }
      const isLast = index === recipients.length - 1;
      if (isLast) break;
      await this.pauseBetweenRecipients(recipient, index + 1);
    }
    return { ok, fail };
  }

  private async pauseBetweenRecipients(recipient: string, sentCount: number): Promise<void> {
    const config = this.broadcastConfig;
    if (config.batchSize > 0 && sentCount % config.batchSize === 0) {
      const pause = randomBetween(config.batchPauseMs, Math.round(config.batchPauseMs * 1.2));
      logDebug(`Pausa de lote tras ${sentCount} envíos: ${pause} ms.`);
      await delay(pause);
      return;
    }
    await delay(this.recipientDelay(recipient));
  }

  private recipientDelay(recipient: string): number {
    const config = this.broadcastConfig;
    if (isGroupChatId(recipient)) {
      return randomBetween(config.groupMinDelayMs, config.groupMaxDelayMs);
    }
    return randomBetween(config.minDelayMs, config.maxDelayMs);
  }

  private async simulateHumanPresence(chatId: string): Promise<void> {
    const config = this.broadcastConfig;
    if (!config.simulateTyping) return;
    try {
      const chat = await this.client.getChatById(normalizeChatId(chatId));
      await chat.sendSeen();
      await chat.sendStateTyping();
      await delay(randomBetween(config.typingMinMs, config.typingMaxMs));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logDebug(`No se pudo simular presencia en ${chatId}: ${reason}`);
    }
  }

  async sendToNumber(
    number: string,
    message: string,
    media: MessageMedia | null = null,
  ): Promise<boolean> {
    const numberId = await this.client.getNumberId(number);
    if (!numberId) {
      logWarn(`El número ${number} no está registrado en WhatsApp.`);
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
      logDebug(`📩 Mensaje de ${message.from}: ${message.body}`);
      await this.dispatch(handlers, message);
    });
  }

  private async dispatch(handlers: MessageHandler[], message: Message): Promise<void> {
    for (const handler of handlers) {
      try {
        await handler(message);
      } catch (err) {
        logError('Error en handler de mensaje:', (err as Error).message);
      }
    }
  }

  async listGroups(): Promise<GroupChat[]> {
    const chats: Chat[] = await this.client.getChats();
    return chats.filter((chat): chat is GroupChat => chat.isGroup);
  }
}
