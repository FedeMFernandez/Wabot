import { randomUUID } from 'node:crypto';
import type { Message } from 'whatsapp-web.js';
import { Audience, Publication, User } from '../../domain';
import type { WhatsAppService } from './WhatsAppService';

type MenuState =
  | { step: 'main' }
  | { step: 'audiences' }
  | { step: 'audienceName' }
  | { step: 'audienceRecipients'; audienceId: string }
  | { step: 'publications' }
  | { step: 'publicationName' }
  | { step: 'publicationContent'; publicationId: string }
  | { step: 'sendAudience' }
  | { step: 'sendPublication'; audienceId: string };

export class MenuService {
  private readonly states = new Map<string, MenuState>();

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly user: User,
  ) {}

  async handle(message: Message): Promise<void> {
    const chatId = message.from;
    const body = message.body.trim();

    if (body.toLowerCase().replace(/^!/, '') === 'menu') {
      this.states.set(chatId, { step: 'main' });
      await this.reply(chatId, this.mainMenu());
      return;
    }

    const state = this.states.get(chatId);
    if (!state) return;

    switch (state.step) {
      case 'main':
        return this.handleMain(chatId, body);
      case 'audiences':
        return this.handleAudiences(chatId, body);
      case 'audienceName':
        return this.handleAudienceName(chatId, body);
      case 'audienceRecipients':
        return this.handleAudienceRecipients(chatId, body, state.audienceId);
      case 'publications':
        return this.handlePublications(chatId, body);
      case 'publicationName':
        return this.handlePublicationName(chatId, body);
      case 'publicationContent':
        return this.handlePublicationContent(chatId, message, state.publicationId);
      case 'sendAudience':
        return this.handleSendAudience(chatId, body);
      case 'sendPublication':
        return this.handleSendPublication(chatId, body, state.audienceId);
    }
  }

  private async handleMain(chatId: string, body: string): Promise<void> {
    switch (body) {
      case '1':
        this.states.set(chatId, { step: 'audiences' });
        return this.reply(chatId, this.audiencesMenu());
      case '2':
        this.states.set(chatId, { step: 'publications' });
        return this.reply(chatId, this.publicationsMenu());
      case '3':
        return this.startSend(chatId);
      case '0':
        this.states.delete(chatId);
        return this.reply(chatId, 'Saliste del menú. Escribí *!menu* para volver.');
      default:
        return this.reply(chatId, `Opción inválida.\n\n${this.mainMenu()}`);
    }
  }

  private async handleAudiences(chatId: string, body: string): Promise<void> {
    switch (body) {
      case '1':
        this.states.set(chatId, { step: 'audienceName' });
        return this.reply(chatId, 'Nombre del grupo de remitentes:');
      case '2':
        return this.reply(chatId, this.listAudiences());
      case '0':
        this.states.set(chatId, { step: 'main' });
        return this.reply(chatId, this.mainMenu());
      default:
        return this.reply(chatId, `Opción inválida.\n\n${this.audiencesMenu()}`);
    }
  }

  private async handleAudienceName(chatId: string, body: string): Promise<void> {
    const audience = new Audience(randomUUID(), body);
    this.user.addAudience(audience);
    this.states.set(chatId, { step: 'audienceRecipients', audienceId: audience.id });
    return this.reply(
      chatId,
      `Grupo de remitentes *${body}* creado.\n\nMandame los IDs de destinatarios (uno por mensaje).\n` +
        'Escribí *grupos* para ver tus grupos, o *listo* para terminar.',
    );
  }

  private async handleAudienceRecipients(
    chatId: string,
    body: string,
    audienceId: string,
  ): Promise<void> {
    const audience = this.user.getAudience(audienceId);
    if (!audience) {
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(chatId, `Grupo de remitentes no encontrado.\n\n${this.audiencesMenu()}`);
    }

    const command = body.toLowerCase();
    if (command === 'listo') {
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(
        chatId,
        `Grupo de remitentes *${audience.name}* guardado con ${audience.recipients.length} destinatario(s).\n\n${this.audiencesMenu()}`,
      );
    }
    if (command === 'grupos') {
      const groups = await this.whatsapp.listGroups();
      if (groups.length === 0) return this.reply(chatId, 'No tenés grupos.');
      const lista = groups
        .map((g) => `• ${g.name}\n  ${g.id._serialized}`)
        .join('\n');
      return this.reply(chatId, `Tus grupos:\n${lista}`);
    }

    audience.addRecipient(body);
    return this.reply(
      chatId,
      `Agregado (${audience.recipients.length}). Otro ID, *grupos* o *listo*.`,
    );
  }

  private async handlePublications(chatId: string, body: string): Promise<void> {
    switch (body) {
      case '1':
        this.states.set(chatId, { step: 'publicationName' });
        return this.reply(chatId, 'Nombre de la publicación:');
      case '2':
        return this.reply(chatId, this.listPublications());
      case '0':
        this.states.set(chatId, { step: 'main' });
        return this.reply(chatId, this.mainMenu());
      default:
        return this.reply(chatId, `Opción inválida.\n\n${this.publicationsMenu()}`);
    }
  }

  private async handlePublicationName(chatId: string, body: string): Promise<void> {
    const publication = new Publication(randomUUID(), body, '');
    this.user.addPublication(publication);
    this.states.set(chatId, { step: 'publicationContent', publicationId: publication.id });
    return this.reply(
      chatId,
      `Publicación *${body}* creada.\n\nMandame el contenido: el próximo mensaje (texto) queda guardado como la publicación.`,
    );
  }

  private async handlePublicationContent(
    chatId: string,
    message: Message,
    publicationId: string,
  ): Promise<void> {
    const publication = this.user.getPublication(publicationId);
    if (!publication) {
      this.states.set(chatId, { step: 'publications' });
      return this.reply(chatId, `Publicación no encontrada.\n\n${this.publicationsMenu()}`);
    }

    publication.text = message.body;
    this.states.set(chatId, { step: 'publications' });
    return this.reply(
      chatId,
      `Publicación *${publication.name}* guardada.\n\n${this.publicationsMenu()}`,
    );
  }

  private async startSend(chatId: string): Promise<void> {
    if (this.user.listAudiences().length === 0) {
      this.states.set(chatId, { step: 'main' });
      return this.reply(chatId, `No hay grupos de remitentes. Creá uno primero.\n\n${this.mainMenu()}`);
    }
    this.states.set(chatId, { step: 'sendAudience' });
    return this.reply(chatId, `Elegí el grupo de remitentes:\n${this.numberedAudiences()}`);
  }

  private async handleSendAudience(chatId: string, body: string): Promise<void> {
    const audiences = this.user.listAudiences();
    const audience = audiences[Number(body) - 1];
    if (!audience) {
      return this.reply(chatId, `Opción inválida.\n${this.numberedAudiences()}`);
    }
    if (this.user.listPublications().length === 0) {
      this.states.set(chatId, { step: 'main' });
      return this.reply(chatId, `No hay publicaciones. Creá una primero.\n\n${this.mainMenu()}`);
    }
    this.states.set(chatId, { step: 'sendPublication', audienceId: audience.id });
    return this.reply(chatId, `Elegí la publicación:\n${this.numberedPublications()}`);
  }

  private async handleSendPublication(
    chatId: string,
    body: string,
    audienceId: string,
  ): Promise<void> {
    const audience = this.user.getAudience(audienceId);
    const publication = this.user.listPublications()[Number(body) - 1];
    if (!audience || !publication) {
      return this.reply(chatId, `Opción inválida.\n${this.numberedPublications()}`);
    }

    const { ok, fail } = await this.broadcast(audience, publication);
    this.states.set(chatId, { step: 'main' });
    return this.reply(
      chatId,
      `Envío terminado: ${ok} ok, ${fail} con error.\n\n${this.mainMenu()}`,
    );
  }

  private async broadcast(
    audience: Audience,
    publication: Publication,
  ): Promise<{ ok: number; fail: number }> {
    const media = publication.hasImages()
      ? await this.whatsapp.buildMedia(publication.images[0])
      : null;

    let ok = 0;
    let fail = 0;
    for (const recipient of audience.recipients) {
      try {
        await this.whatsapp.sendToChat(recipient, publication.text, media);
        ok++;
      } catch (err) {
        console.error(`Error enviando a ${recipient}:`, (err as Error).message);
        fail++;
      }
    }
    return { ok, fail };
  }

  private reply(chatId: string, text: string): Promise<void> {
    return this.whatsapp.sendToChat(chatId, text);
  }

  private mainMenu(): string {
    return '*📋 Menú Wabot*\n1. Grupos de remitentes\n2. Publicaciones\n3. Enviar\n0. Salir';
  }

  private audiencesMenu(): string {
    return '*👥 Grupos de remitentes*\n1. Crear\n2. Listar\n0. Volver';
  }

  private publicationsMenu(): string {
    return '*📰 Publicaciones*\n1. Crear\n2. Listar\n0. Volver';
  }

  private listAudiences(): string {
    const audiences = this.user.listAudiences();
    if (audiences.length === 0) return 'No hay grupos de remitentes.';
    return audiences
      .map((a) => `• ${a.name} (${a.recipients.length} destinatario/s)`)
      .join('\n');
  }

  private listPublications(): string {
    const publications = this.user.listPublications();
    if (publications.length === 0) return 'No hay publicaciones.';
    return publications.map((p) => `• ${p.name}`).join('\n');
  }

  private numberedAudiences(): string {
    return this.user
      .listAudiences()
      .map((a, i) => `${i + 1}. ${a.name} (${a.recipients.length})`)
      .join('\n');
  }

  private numberedPublications(): string {
    return this.user
      .listPublications()
      .map((p, i) => `${i + 1}. ${p.name}`)
      .join('\n');
  }
}
