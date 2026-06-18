import { randomUUID } from 'node:crypto';
import type { Message } from 'whatsapp-web.js';
import {
  Audience,
  Publication,
  Schedule,
  ScheduledMessage,
  User,
  validateRecipients,
} from '../../domain';
import type { WhatsAppService } from './WhatsAppService';

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

type MenuState =
  | { step: 'main' }
  | { step: 'audiences' }
  | { step: 'audienceName' }
  | { step: 'audienceRecipients'; audienceId: string }
  | { step: 'publications' }
  | { step: 'publicationName' }
  | { step: 'publicationContent'; publicationId: string }
  | { step: 'sendAudience' }
  | { step: 'sendPublication'; audienceId: string }
  | { step: 'scheduled' }
  | { step: 'scheduleAudience' }
  | { step: 'schedulePublication'; audienceId: string }
  | { step: 'scheduleKind'; draft: ScheduleDraft }
  | { step: 'scheduleWeekdays'; draft: ScheduleDraft; weekdays: number[] }
  | { step: 'scheduleTime'; draft: ScheduleDraft; mode: 'once' | 'weekly'; weekdays: number[] }
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
      case 'scheduled':
        return this.handleScheduled(chatId, body);
      case 'scheduleAudience':
        return this.handleScheduleAudience(chatId, body);
      case 'schedulePublication':
        return this.handleSchedulePublication(chatId, body, state.audienceId);
      case 'scheduleKind':
        return this.handleScheduleKind(chatId, body, state.draft);
      case 'scheduleWeekdays':
        return this.handleScheduleWeekdays(chatId, body, state.draft, state.weekdays);
      case 'scheduleTime':
        return this.handleScheduleTime(chatId, body, state.draft, state.mode, state.weekdays);
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
      `Grupo de remitentes *${body}* creado.\n\nMandame los IDs de destinatarios (podés mandar varios separados por coma).\n` +
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
    lines.push('Otro(s) ID(s), *grupos* o *listo*.');

    return this.reply(chatId, lines.join('\n\n'));
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
    this.states.set(chatId, { step: 'scheduleKind', draft });
    return this.reply(
      chatId,
      '¿Cuándo querés enviarlo?\n1. Hoy (una vez)\n2. Días de la semana (cada semana)\n0. Cancelar',
    );
  }

  private async handleScheduleKind(
    chatId: string,
    body: string,
    draft: ScheduleDraft,
  ): Promise<void> {
    switch (body) {
      case '1':
        this.states.set(chatId, {
          step: 'scheduleTime',
          draft,
          mode: 'once',
          weekdays: [],
        });
        return this.reply(chatId, 'Ingresá la hora de hoy (HH:MM), por ejemplo 18:30:');
      case '2':
        this.states.set(chatId, { step: 'scheduleWeekdays', draft, weekdays: [] });
        return this.reply(
          chatId,
          'Mandame los días separados por coma (número 0-6 o nombre).\n' +
            '0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado.\n' +
            'Escribí *listo* para terminar.',
        );
      case '0':
        return this.cancelSchedule(chatId);
      default:
        return this.reply(chatId, 'Opción inválida. 1=Hoy, 2=Días de la semana, 0=Cancelar.');
    }
  }

  private async handleScheduleWeekdays(
    chatId: string,
    body: string,
    draft: ScheduleDraft,
    weekdays: number[],
  ): Promise<void> {
    const command = body.toLowerCase();
    if (command === 'listo') {
      if (weekdays.length === 0) {
        return this.reply(chatId, 'No elegiste ningún día. Mandá al menos uno o *0* para cancelar.');
      }
      this.states.set(chatId, {
        step: 'scheduleTime',
        draft,
        mode: 'weekly',
        weekdays,
      });
      return this.reply(chatId, 'Ingresá la hora (HH:MM), por ejemplo 09:00:');
    }
    if (command === '0') {
      return this.cancelSchedule(chatId);
    }

    const parsed = this.parseWeekdays(body);
    if (parsed.invalid.length > 0 && parsed.valid.length === 0) {
      return this.reply(chatId, `No reconocí: ${parsed.invalid.join(', ')}. Probá de nuevo.`);
    }
    const merged = [...new Set([...weekdays, ...parsed.valid])].sort((a, b) => a - b);
    this.states.set(chatId, { step: 'scheduleWeekdays', draft, weekdays: merged });
    const selected = merged.map((d) => WEEKDAY_NAMES[d]).join(', ');
    const warn =
      parsed.invalid.length > 0 ? `\nNo reconocí: ${parsed.invalid.join(', ')}.` : '';
    return this.reply(
      chatId,
      `Días: ${selected}.${warn}\nMandá más días o *listo* para continuar.`,
    );
  }

  private async handleScheduleTime(
    chatId: string,
    body: string,
    draft: ScheduleDraft,
    mode: 'once' | 'weekly',
    weekdays: number[],
  ): Promise<void> {
    const time = this.parseTime(body);
    if (!time) {
      return this.reply(chatId, 'Hora inválida. Usá el formato HH:MM (00:00 a 23:59).');
    }

    let schedule: Schedule;
    if (mode === 'once') {
      const now = new Date();
      const date = new Date(now);
      date.setHours(time.hours, time.minutes, 0, 0);
      if (date.getTime() <= now.getTime()) {
        return this.reply(
          chatId,
          'Esa hora ya pasó hoy. Ingresá una hora posterior a la actual (HH:MM).',
        );
      }
      schedule = { kind: 'once', date };
    } else {
      schedule = { kind: 'weekly', weekdays, time: this.formatTime(time) };
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

  private parseWeekdays(body: string): { valid: number[]; invalid: string[] } {
    const valid: number[] = [];
    const invalid: string[] = [];
    const entries = body
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
    for (const entry of entries) {
      const asNumber = Number(entry);
      if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= 6) {
        valid.push(asNumber);
        continue;
      }
      const index = WEEKDAY_NAMES.indexOf(entry);
      if (index !== -1) {
        valid.push(index);
        continue;
      }
      invalid.push(entry);
    }
    return { valid, invalid };
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
      return `hoy a las ${hh}:${mm}`;
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
