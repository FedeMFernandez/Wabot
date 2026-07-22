import { randomUUID } from 'node:crypto';
import type { Message } from 'whatsapp-web.js';
import {
  Audience,
  Publication,
  Schedule,
  ScheduledMessage,
  User,
  extractContactsFromVCards,
  validatePhoneNumber,
  validateRecipients,
} from '../../domain';
import type { WhatsAppService } from './WhatsAppService';

const VCARD_TYPES = ['vcard', 'multi_vcard'];

const WEEKDAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

type ScheduleDraft = {
  audienceId: string;
  publicationId: string;
  schedule?: Schedule;
};

type ScheduleDateInput =
  | { source: 'today' }
  | { source: 'explicit'; day: number; month: number; year: number | null };

type MenuState =
  | { step: 'main' }
  | { step: 'audiences' }
  | { step: 'audienceName' }
  | { step: 'audienceRecipients'; audienceId: string; mode: 'create' | 'edit' }
  | { step: 'audienceEdit' }
  | { step: 'audienceEditMenu'; audienceId: string }
  | { step: 'audienceRename'; audienceId: string }
  | { step: 'audienceDelete'; audienceId: string }
  | { step: 'audienceRemoveRecipients'; audienceId: string; mode: 'create' | 'edit' }
  | { step: 'publications' }
  | { step: 'publicationName' }
  | { step: 'publicationContent'; publicationId: string }
  | { step: 'sendAudience' }
  | { step: 'sendPublication'; audienceId: string }
  | { step: 'scheduled' }
  | { step: 'scheduleAudience' }
  | { step: 'schedulePublication'; audienceId: string }
  | { step: 'scheduleWhen'; draft: ScheduleDraft }
  | { step: 'scheduleDate'; draft: ScheduleDraft }
  | { step: 'scheduleTime'; draft: ScheduleDraft; dateInput: ScheduleDateInput }
  | { step: 'scheduleRepeat'; draft: ScheduleDraft; date: Date; dateInput: ScheduleDateInput }
  | { step: 'scheduleConfirm'; draft: ScheduleDraft }
  | { step: 'scheduleRemove' };

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
        return this.handleAudienceRecipients(chatId, message, state.audienceId, state.mode);
      case 'audienceEdit':
        return this.handleAudienceEdit(chatId, body);
      case 'audienceEditMenu':
        return this.handleAudienceEditMenu(chatId, body, state.audienceId);
      case 'audienceRename':
        return this.handleAudienceRename(chatId, body, state.audienceId);
      case 'audienceDelete':
        return this.handleAudienceDelete(chatId, body, state.audienceId);
      case 'audienceRemoveRecipients':
        return this.handleAudienceRemoveRecipients(chatId, body, state.audienceId, state.mode);
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
      case 'scheduled':
        return this.handleScheduled(chatId, body);
      case 'scheduleAudience':
        return this.handleScheduleAudience(chatId, body);
      case 'schedulePublication':
        return this.handleSchedulePublication(chatId, body, state.audienceId);
      case 'scheduleWhen':
        return this.handleScheduleWhen(chatId, body, state.draft);
      case 'scheduleDate':
        return this.handleScheduleDate(chatId, body, state.draft);
      case 'scheduleTime':
        return this.handleScheduleTime(chatId, body, state.draft, state.dateInput);
      case 'scheduleRepeat':
        return this.handleScheduleRepeat(chatId, body, state.draft, state.date, state.dateInput);
      case 'scheduleConfirm':
        return this.handleScheduleConfirm(chatId, body, state.draft);
      case 'scheduleRemove':
        return this.handleScheduleRemove(chatId, body);
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
      case '4':
        this.states.set(chatId, { step: 'scheduled' });
        return this.reply(chatId, this.scheduledMenu());
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
      case '3':
        return this.startAudienceEdit(chatId);
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
    this.states.set(chatId, { step: 'audienceRecipients', audienceId: audience.id, mode: 'create' });
    return this.reply(
      chatId,
      `Grupo de remitentes *${body}* creado.\n\nMandame los IDs de destinatarios (podés mandar varios separados por coma).\n` +
        '📇 También podés compartirme contactos de WhatsApp (uno o varios) y saco los números solo.\n' +
        'Escribí *grupos* para ver tus grupos, o *listo* para terminar.',
    );
  }

  private async startAudienceEdit(chatId: string): Promise<void> {
    if (this.user.listAudiences().length === 0) {
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(
        chatId,
        `No hay grupos de remitentes. Creá uno primero.\n\n${this.audiencesMenu()}`,
      );
    }
    this.states.set(chatId, { step: 'audienceEdit' });
    return this.reply(
      chatId,
      `Elegí el grupo de remitentes a editar:\n${this.numberedAudiences()}\n0. Volver`,
    );
  }

  private async handleAudienceEdit(chatId: string, body: string): Promise<void> {
    if (body === '0') {
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(chatId, this.audiencesMenu());
    }
    const audience = this.user.listAudiences()[Number(body) - 1];
    if (!audience) {
      return this.reply(chatId, `Opción inválida.\n${this.numberedAudiences()}\n0. Volver`);
    }
    this.states.set(chatId, { step: 'audienceEditMenu', audienceId: audience.id });
    return this.reply(chatId, this.audienceEditMenu(audience));
  }

  private async handleAudienceEditMenu(
    chatId: string,
    body: string,
    audienceId: string,
  ): Promise<void> {
    const audience = this.user.getAudience(audienceId);
    if (!audience) {
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(chatId, `Grupo de remitentes no encontrado.\n\n${this.audiencesMenu()}`);
    }
    switch (body) {
      case '1':
        this.states.set(chatId, { step: 'audienceRecipients', audienceId, mode: 'edit' });
        return this.reply(
          chatId,
          `Editando *${audience.name}* (${audience.recipients.length} destinatario/s).\n\n` +
            'Mandame IDs para agregar (varios separados por coma).\n' +
            '📇 También podés compartirme contactos de WhatsApp (uno o varios) y saco los números solo.\n' +
            'Escribí *borrar* para quitar destinatarios, *grupos* para ver tus grupos, o *listo* para terminar.',
        );
      case '2':
        this.states.set(chatId, { step: 'audienceRename', audienceId });
        return this.reply(chatId, 'Nuevo nombre para el grupo:');
      case '3':
        this.states.set(chatId, { step: 'audienceDelete', audienceId });
        return this.reply(
          chatId,
          `¿Seguro que querés eliminar *${audience.name}* y sus ${audience.recipients.length} destinatario(s)? Escribí *si* para confirmar o *no* para cancelar.`,
        );
      case '0':
        this.states.set(chatId, { step: 'audiences' });
        return this.reply(chatId, this.audiencesMenu());
      default:
        return this.reply(chatId, `Opción inválida.\n\n${this.audienceEditMenu(audience)}`);
    }
  }

  private async handleAudienceRename(
    chatId: string,
    body: string,
    audienceId: string,
  ): Promise<void> {
    const audience = this.user.getAudience(audienceId);
    if (!audience) {
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(chatId, `Grupo de remitentes no encontrado.\n\n${this.audiencesMenu()}`);
    }
    const newName = body.trim();
    if (newName.length === 0) {
      return this.reply(chatId, 'Nombre inválido. Nuevo nombre para el grupo:');
    }
    audience.rename(newName);
    this.user.persistAudience(audience);
    this.states.set(chatId, { step: 'audiences' });
    return this.reply(
      chatId,
      `Grupo de remitentes renombrado a *${audience.name}*.\n\n${this.audiencesMenu()}`,
    );
  }

  private async handleAudienceDelete(
    chatId: string,
    body: string,
    audienceId: string,
  ): Promise<void> {
    const audience = this.user.getAudience(audienceId);
    if (!audience) {
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(chatId, `Grupo de remitentes no encontrado.\n\n${this.audiencesMenu()}`);
    }
    const command = body.trim().toLowerCase();
    if (command === 'si' || command === 'sí') {
      const name = audience.name;
      this.user.removeAudience(audienceId);
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(
        chatId,
        `Grupo de remitentes *${name}* eliminado.\n\n${this.audiencesMenu()}`,
      );
    }
    this.states.set(chatId, { step: 'audiences' });
    return this.reply(chatId, `Cancelado.\n\n${this.audiencesMenu()}`);
  }

  private async handleAudienceRecipients(
    chatId: string,
    message: Message,
    audienceId: string,
    mode: 'create' | 'edit',
  ): Promise<void> {
    const audience = this.user.getAudience(audienceId);
    if (!audience) {
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(chatId, `Grupo de remitentes no encontrado.\n\n${this.audiencesMenu()}`);
    }

    if (VCARD_TYPES.includes(message.type)) {
      return this.addRecipientsFromVCards(chatId, audience, message.vCards ?? []);
    }

    const body = message.body.trim();
    const command = body.toLowerCase();
    if (command === 'listo') {
      this.states.set(chatId, { step: 'audiences' });
      const verb = mode === 'edit' ? 'actualizado' : 'guardado';
      return this.reply(
        chatId,
        `Grupo de remitentes *${audience.name}* ${verb} con ${audience.recipients.length} destinatario(s).\n\n${this.audiencesMenu()}`,
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
    if (command === 'borrar' || command.startsWith('borrar ')) {
      if (audience.recipients.length === 0) {
        return this.reply(chatId, 'El grupo no tiene destinatarios para borrar.');
      }
      const rest = body.slice('borrar'.length).trim();
      if (rest.length > 0) {
        const removed = this.removeRecipientsByNumbers(audience, rest);
        if (removed.length === 0) {
          return this.reply(
            chatId,
            `No reconocí números válidos.\n${this.numberedRecipients(audience)}`,
          );
        }
        this.user.persistAudience(audience);
        return this.reply(
          chatId,
          `Quité ${removed.length} destinatario(s). Total: ${audience.recipients.length}.\nMandá IDs, *borrar* o *listo*.`,
        );
      }
      this.states.set(chatId, { step: 'audienceRemoveRecipients', audienceId, mode });
      return this.reply(
        chatId,
        `Destinatarios actuales:\n${this.numberedRecipients(audience)}\n\n` +
          'Mandá los números a borrar (separados por coma, ej: 1,3).\n' +
          'Escribí *listo* para volver a agregar.',
      );
    }

    const { valid, errors } = validateRecipients(body);
    if (valid.length === 0 && errors.length === 0) {
      return this.reply(chatId, 'No detecté destinatarios. Mandá IDs separados por coma.');
    }

    const before = audience.recipients.length;
    for (const entry of valid) {
      audience.addRecipient(entry);
    }
    this.user.persistAudience(audience);
    const added = audience.recipients.length - before;

    const lines: string[] = [];
    if (added > 0) {
      lines.push(`Agregados ${added} destinatario(s). Total: ${audience.recipients.length}.`);
    }
    if (errors.length > 0) {
      const detail = errors
        .map((error) => `• ${error.input} → ${error.reason}`)
        .join('\n');
      lines.push(`⚠️ No agregué estos números porque tienen errores:\n${detail}`);
    }
    lines.push('Otro(s) ID(s), *borrar*, *grupos* o *listo*.');

    return this.reply(chatId, lines.join('\n\n'));
  }

  private async addRecipientsFromVCards(
    chatId: string,
    audience: Audience,
    vcards: string[],
  ): Promise<void> {
    const contacts = extractContactsFromVCards(vcards);
    if (contacts.length === 0) {
      return this.reply(
        chatId,
        'No pude leer ningún número en el/los contacto(s) que compartiste. Probá mandando los IDs separados por coma.',
      );
    }

    const added: string[] = [];
    const duplicated: string[] = [];
    const invalid: string[] = [];

    for (const contact of contacts) {
      const label = contact.name.length > 0 ? `${contact.name} (${contact.number})` : contact.number;
      const reason = validatePhoneNumber(contact.number);
      if (reason) {
        invalid.push(`• ${label} → ${reason}`);
        continue;
      }
      const before = audience.recipients.length;
      audience.addRecipient(contact.number);
      if (audience.recipients.length > before) {
        added.push(`• ${label}`);
      } else {
        duplicated.push(`• ${label}`);
      }
    }

    if (added.length > 0) {
      this.user.persistAudience(audience);
    }

    const lines: string[] = [];
    if (added.length > 0) {
      lines.push(
        `✅ Agregué ${added.length} destinatario(s). Total: ${audience.recipients.length}.\n${added.join('\n')}`,
      );
    }
    if (duplicated.length > 0) {
      lines.push(`ℹ️ Ya estaban en el grupo:\n${duplicated.join('\n')}`);
    }
    if (invalid.length > 0) {
      lines.push(`⚠️ No agregué estos contactos porque tienen errores:\n${invalid.join('\n')}`);
    }
    lines.push('Compartí más contactos, mandá otro(s) ID(s), *borrar*, *grupos* o *listo*.');

    return this.reply(chatId, lines.join('\n\n'));
  }

  private async handleAudienceRemoveRecipients(
    chatId: string,
    body: string,
    audienceId: string,
    mode: 'create' | 'edit',
  ): Promise<void> {
    const audience = this.user.getAudience(audienceId);
    if (!audience) {
      this.states.set(chatId, { step: 'audiences' });
      return this.reply(chatId, `Grupo de remitentes no encontrado.\n\n${this.audiencesMenu()}`);
    }

    const command = body.toLowerCase();
    if (command === 'listo' || command === '0') {
      this.states.set(chatId, { step: 'audienceRecipients', audienceId, mode });
      return this.reply(
        chatId,
        `Destinatarios: ${audience.recipients.length}. Mandá IDs para agregar, *borrar* para quitar más, o *listo* para terminar.`,
      );
    }

    const removed = this.removeRecipientsByNumbers(audience, body);
    if (removed.length === 0) {
      return this.reply(
        chatId,
        `No reconocí números válidos.\n${this.numberedRecipients(audience)}\n\nMandá algo como 1,3 o *listo*.`,
      );
    }
    this.user.persistAudience(audience);
    if (audience.recipients.length === 0) {
      this.states.set(chatId, { step: 'audienceRecipients', audienceId, mode });
      return this.reply(
        chatId,
        `Quité ${removed.length} destinatario(s). El grupo quedó vacío.\nMandá IDs para agregar o *listo* para terminar.`,
      );
    }
    return this.reply(
      chatId,
      `Quité ${removed.length} destinatario(s).\n\nDestinatarios actuales:\n${this.numberedRecipients(audience)}\n\nMandá más números a borrar o *listo* para volver a agregar.`,
    );
  }

  private removeRecipientsByNumbers(audience: Audience, body: string): string[] {
    const indexes = body
      .split(',')
      .map((entry) => Number(entry.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= audience.recipients.length);
    const targets = [...new Set(indexes)].map((n) => audience.recipients[n - 1]);
    for (const target of targets) {
      audience.removeRecipient(target);
    }
    return targets;
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
      `Publicación *${body}* creada.\n\nMandame el contenido: texto y/o imágenes.\n` +
        'Podés mandar varias imágenes (cada mensaje agrega una) y texto. El último texto queda como descripción.\n' +
        'Escribí *listo* para terminar.',
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

    const body = message.body.trim();
    if (body.toLowerCase() === 'listo') {
      this.states.set(chatId, { step: 'publications' });
      const imageInfo =
        publication.images.length > 0
          ? `${publication.images.length} imagen(es)`
          : 'sin imágenes';
      const textInfo = publication.text ? 'con texto' : 'sin texto';
      return this.reply(
        chatId,
        `Publicación *${publication.name}* guardada (${imageInfo}, ${textInfo}).\n\n${this.publicationsMenu()}`,
      );
    }

    if (message.hasMedia) {
      const media = await message.downloadMedia();
      if (!media) {
        return this.reply(chatId, 'No pude descargar la imagen. Probá de nuevo o escribí *listo*.');
      }
      const caption = message.body.trim();
      publication.addImage({
        mimetype: media.mimetype,
        data: media.data,
        filename: media.filename ?? undefined,
        caption: caption || undefined,
      });
      this.user.persistPublication(publication);
      return this.reply(
        chatId,
        `Imagen agregada (${publication.images.length} en total). Mandá otra, texto, o *listo* para terminar.`,
      );
    }

    publication.text = message.body;
    this.user.persistPublication(publication);
    return this.reply(
      chatId,
      `Texto guardado. Mandá imágenes, más texto, o *listo* para terminar.`,
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

  private broadcast(
    audience: Audience,
    publication: Publication,
  ): Promise<{ ok: number; fail: number }> {
    return this.whatsapp.sendPublicationToRecipients(audience.recipients, publication);
  }

  private async handleScheduled(chatId: string, body: string): Promise<void> {
    switch (body) {
      case '1':
        return this.startSchedule(chatId);
      case '2':
        return this.reply(chatId, `${this.listScheduled()}\n\n${this.scheduledMenu()}`);
      case '3':
        return this.startScheduleRemove(chatId);
      case '0':
        this.states.set(chatId, { step: 'main' });
        return this.reply(chatId, this.mainMenu());
      default:
        return this.reply(chatId, `Opción inválida.\n\n${this.scheduledMenu()}`);
    }
  }

  private async startSchedule(chatId: string): Promise<void> {
    if (this.user.listAudiences().length === 0) {
      this.states.set(chatId, { step: 'scheduled' });
      return this.reply(
        chatId,
        `No hay grupos de remitentes. Creá uno primero.\n\n${this.scheduledMenu()}`,
      );
    }
    this.states.set(chatId, { step: 'scheduleAudience' });
    return this.reply(chatId, `Elegí el grupo de remitentes:\n${this.numberedAudiences()}`);
  }

  private async handleScheduleAudience(chatId: string, body: string): Promise<void> {
    const audience = this.user.listAudiences()[Number(body) - 1];
    if (!audience) {
      return this.reply(chatId, `Opción inválida.\n${this.numberedAudiences()}`);
    }
    if (this.user.listPublications().length === 0) {
      this.states.set(chatId, { step: 'scheduled' });
      return this.reply(chatId, `No hay publicaciones. Creá una primero.\n\n${this.scheduledMenu()}`);
    }
    this.states.set(chatId, { step: 'schedulePublication', audienceId: audience.id });
    return this.reply(chatId, `Elegí la publicación:\n${this.numberedPublications()}`);
  }

  private async handleSchedulePublication(
    chatId: string,
    body: string,
    audienceId: string,
  ): Promise<void> {
    const publication = this.user.listPublications()[Number(body) - 1];
    if (!publication) {
      return this.reply(chatId, `Opción inválida.\n${this.numberedPublications()}`);
    }
    const draft: ScheduleDraft = { audienceId, publicationId: publication.id };
    this.states.set(chatId, { step: 'scheduleWhen', draft });
    return this.reply(
      chatId,
      '¿Cuándo querés enviarlo?\n1. Hoy\n2. Elegir fecha y hora\n0. Cancelar',
    );
  }

  private async handleScheduleWhen(
    chatId: string,
    body: string,
    draft: ScheduleDraft,
  ): Promise<void> {
    switch (body) {
      case '1':
        this.states.set(chatId, {
          step: 'scheduleTime',
          draft,
          dateInput: { source: 'today' },
        });
        return this.reply(chatId, 'Ingresá la hora de hoy (HH:MM), por ejemplo 18:30:');
      case '2':
        this.states.set(chatId, { step: 'scheduleDate', draft });
        return this.reply(
          chatId,
          'Ingresá la fecha (DD/MM o DD/MM/AAAA), por ejemplo 25/12 o 25/12/2026:',
        );
      case '0':
        return this.cancelSchedule(chatId);
      default:
        return this.reply(chatId, 'Opción inválida. 1=Hoy, 2=Elegir fecha y hora, 0=Cancelar.');
    }
  }

  private async handleScheduleDate(
    chatId: string,
    body: string,
    draft: ScheduleDraft,
  ): Promise<void> {
    if (body.trim() === '0') {
      return this.cancelSchedule(chatId);
    }
    const parsed = this.parseDate(body);
    if (!parsed) {
      return this.reply(
        chatId,
        'Fecha inválida. Usá el formato DD/MM o DD/MM/AAAA (por ejemplo 25/12 o 25/12/2026).',
      );
    }
    if (parsed.year !== null && parsed.year < new Date().getFullYear()) {
      return this.reply(
        chatId,
        'Ese año ya pasó. Ingresá una fecha futura con el formato DD/MM o DD/MM/AAAA.',
      );
    }
    this.states.set(chatId, {
      step: 'scheduleTime',
      draft,
      dateInput: { source: 'explicit', day: parsed.day, month: parsed.month, year: parsed.year },
    });
    return this.reply(chatId, 'Ingresá la hora (HH:MM), por ejemplo 09:00:');
  }

  private async handleScheduleTime(
    chatId: string,
    body: string,
    draft: ScheduleDraft,
    dateInput: ScheduleDateInput,
  ): Promise<void> {
    const time = this.parseTime(body);
    if (!time) {
      return this.reply(chatId, 'Hora inválida. Usá el formato HH:MM (00:00 a 23:59).');
    }

    let date: Date;
    if (dateInput.source === 'today') {
      date = new Date();
      date.setHours(time.hours, time.minutes, 0, 0);
    } else {
      const now = new Date();
      const year = dateInput.year ?? now.getFullYear();
      date = new Date(year, dateInput.month - 1, dateInput.day, time.hours, time.minutes, 0, 0);
      if (dateInput.year === null && date.getTime() <= now.getTime()) {
        date = new Date(year + 1, dateInput.month - 1, dateInput.day, time.hours, time.minutes, 0, 0);
      }
    }

    this.states.set(chatId, { step: 'scheduleRepeat', draft, date, dateInput });
    return this.reply(
      chatId,
      '¿Repetir el envío?\n1. Una sola vez\n2. Cada semana (este día)\n0. Cancelar',
    );
  }

  private async handleScheduleRepeat(
    chatId: string,
    body: string,
    draft: ScheduleDraft,
    date: Date,
    dateInput: ScheduleDateInput,
  ): Promise<void> {
    let schedule: Schedule;
    switch (body) {
      case '1': {
        if (date.getTime() <= Date.now()) {
          this.states.set(chatId, { step: 'scheduleTime', draft, dateInput });
          return this.reply(
            chatId,
            'Esa fecha y hora ya pasaron. Ingresá una hora posterior (HH:MM).',
          );
        }
        schedule = { kind: 'once', date };
        break;
      }
      case '2': {
        const time = this.formatTime({ hours: date.getHours(), minutes: date.getMinutes() });
        schedule = { kind: 'weekly', weekdays: [date.getDay()], time };
        break;
      }
      case '0':
        return this.cancelSchedule(chatId);
      default:
        return this.reply(chatId, 'Opción inválida. 1=Una sola vez, 2=Cada semana, 0=Cancelar.');
    }

    const nextDraft: ScheduleDraft = { ...draft, schedule };
    this.states.set(chatId, { step: 'scheduleConfirm', draft: nextDraft });
    await this.sendPreview(chatId, nextDraft);
    return this.reply(
      chatId,
      'Escribí *confirmar* para guardar, o *modificar* / *cancelar* para descartar.',
    );
  }

  private async handleScheduleConfirm(
    chatId: string,
    body: string,
    draft: ScheduleDraft,
  ): Promise<void> {
    const command = body.toLowerCase();
    if (command === 'confirmar') {
      if (!draft.schedule) return this.cancelSchedule(chatId);
      const scheduled = new ScheduledMessage(
        randomUUID(),
        draft.audienceId,
        draft.publicationId,
        draft.schedule,
      );
      this.user.addScheduledMessage(scheduled);
      this.states.set(chatId, { step: 'scheduled' });
      return this.reply(
        chatId,
        `Mensaje programado guardado (${this.describeSchedule(draft.schedule)}).\n\n${this.scheduledMenu()}`,
      );
    }
    if (command === 'modificar' || command === 'cancelar') {
      return this.cancelSchedule(chatId);
    }
    return this.reply(chatId, 'Escribí *confirmar*, *modificar* o *cancelar*.');
  }

  private async cancelSchedule(chatId: string): Promise<void> {
    this.states.set(chatId, { step: 'scheduled' });
    return this.reply(chatId, `Programación cancelada.\n\n${this.scheduledMenu()}`);
  }

  private async startScheduleRemove(chatId: string): Promise<void> {
    if (this.user.listScheduledMessages().length === 0) {
      this.states.set(chatId, { step: 'scheduled' });
      return this.reply(chatId, `No hay mensajes programados.\n\n${this.scheduledMenu()}`);
    }
    this.states.set(chatId, { step: 'scheduleRemove' });
    return this.reply(
      chatId,
      `Elegí el mensaje programado a cancelar:\n${this.numberedScheduled()}\n0. Volver`,
    );
  }

  private async handleScheduleRemove(chatId: string, body: string): Promise<void> {
    if (body === '0') {
      this.states.set(chatId, { step: 'scheduled' });
      return this.reply(chatId, this.scheduledMenu());
    }
    const scheduled = this.user.listScheduledMessages()[Number(body) - 1];
    if (!scheduled) {
      return this.reply(chatId, `Opción inválida.\n${this.numberedScheduled()}\n0. Volver`);
    }
    this.user.removeScheduledMessage(scheduled.id);
    this.states.set(chatId, { step: 'scheduled' });
    return this.reply(chatId, `Mensaje programado cancelado.\n\n${this.scheduledMenu()}`);
  }

  private async sendPreview(chatId: string, draft: ScheduleDraft): Promise<void> {
    const audience = this.user.getAudience(draft.audienceId);
    const publication = this.user.getPublication(draft.publicationId);
    if (!audience || !publication || !draft.schedule) return;
    const summary =
      `📋 Mensaje de ejemplo\n` +
      `Grupo: ${audience.name} (${audience.recipients.length} destinatario/s)\n` +
      `Programación: ${this.describeSchedule(draft.schedule)}`;
    await this.reply(chatId, summary);
    await this.whatsapp.sendPublicationToChat(chatId, publication);
  }

  private parseDate(body: string): { day: number; month: number; year: number | null } | null {
    const match = body.trim().match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?$/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3] !== undefined ? Number(match[3]) : null;
    if (month < 1 || month > 12) return null;
    const resolvedYear = year ?? new Date().getFullYear();
    const daysInMonth = new Date(resolvedYear, month, 0).getDate();
    if (day < 1 || day > daysInMonth) return null;
    return { day, month, year };
  }

  private parseTime(body: string): { hours: number; minutes: number } | null {
    const match = body.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return { hours, minutes };
  }

  private formatTime(time: { hours: number; minutes: number }): string {
    const hh = String(time.hours).padStart(2, '0');
    const mm = String(time.minutes).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private describeSchedule(schedule: Schedule): string {
    if (schedule.kind === 'once') {
      const hh = String(schedule.date.getHours()).padStart(2, '0');
      const mm = String(schedule.date.getMinutes()).padStart(2, '0');
      const now = new Date();
      const sameDay =
        schedule.date.getFullYear() === now.getFullYear() &&
        schedule.date.getMonth() === now.getMonth() &&
        schedule.date.getDate() === now.getDate();
      if (sameDay) {
        return `hoy a las ${hh}:${mm}`;
      }
      const dd = String(schedule.date.getDate()).padStart(2, '0');
      const mo = String(schedule.date.getMonth() + 1).padStart(2, '0');
      const yyyy = schedule.date.getFullYear();
      return `el ${dd}/${mo}/${yyyy} a las ${hh}:${mm}`;
    }
    const days = schedule.weekdays.map((d) => WEEKDAY_NAMES[d]).join(', ');
    return `${days} a las ${schedule.time}`;
  }

  private reply(chatId: string, text: string): Promise<void> {
    return this.whatsapp.sendToChat(chatId, text);
  }

  private mainMenu(): string {
    return '*📋 Menú Wabot*\n1. Grupos de remitentes\n2. Publicaciones\n3. Enviar\n4. Programar\n0. Salir';
  }

  private scheduledMenu(): string {
    return '*⏰ Mensajes programados*\n1. Programar\n2. Listar\n3. Cancelar\n0. Volver';
  }

  private audiencesMenu(): string {
    return '*👥 Grupos de remitentes*\n1. Crear\n2. Listar\n3. Editar/Eliminar\n0. Volver';
  }

  private audienceEditMenu(audience: Audience): string {
    return (
      `Editando *${audience.name}* (${audience.recipients.length} destinatario/s).\n` +
      '1. Agregar/quitar destinatarios\n2. Renombrar\n3. Eliminar grupo\n0. Volver'
    );
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

  private numberedRecipients(audience: Audience): string {
    return audience.recipients.map((r, i) => `${i + 1}. ${r}`).join('\n');
  }

  private numberedPublications(): string {
    return this.user
      .listPublications()
      .map((p, i) => `${i + 1}. ${p.name}`)
      .join('\n');
  }

  private describeScheduledMessage(scheduled: ScheduledMessage): string {
    const audience = this.user.getAudience(scheduled.audienceId);
    const publication = this.user.getPublication(scheduled.publicationId);
    const audienceName = audience?.name ?? '(grupo eliminado)';
    const publicationName = publication?.name ?? '(publicación eliminada)';
    const statusInfo =
      scheduled.schedule.kind === 'once' && scheduled.status === 'sent' ? ' [enviado]' : '';
    return `${publicationName} → ${audienceName} (${this.describeSchedule(scheduled.schedule)})${statusInfo}`;
  }

  private listScheduled(): string {
    const scheduled = this.user.listScheduledMessages();
    if (scheduled.length === 0) return 'No hay mensajes programados.';
    return scheduled.map((s) => `• ${this.describeScheduledMessage(s)}`).join('\n');
  }

  private numberedScheduled(): string {
    return this.user
      .listScheduledMessages()
      .map((s, i) => `${i + 1}. ${this.describeScheduledMessage(s)}`)
      .join('\n');
  }
}
