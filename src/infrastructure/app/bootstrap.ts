import { randomUUID } from 'node:crypto';
import { MenuService, WhatsAppService } from '../../application/services';
import { User } from '../../domain';
import {
  createWhatsAppClient,
  type WhatsAppClient,
} from '../whatsapp';

export interface AppContext {
  readonly whatsappClient: WhatsAppClient;
  readonly whatsappService: WhatsAppService;
  readonly user: User;
  readonly menuService: MenuService;
}

let context: AppContext | null = null;

export function Context(): AppContext {
  if (context) return context;

  const whatsappClient = createWhatsAppClient();
  const whatsappService = new WhatsAppService(whatsappClient);
  const user = new User(randomUUID());
  const menuService = new MenuService(whatsappService, user);

  context = Object.freeze({
    whatsappClient,
    whatsappService,
    user,
    menuService,
  });

  return context;
}
