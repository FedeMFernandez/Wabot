import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { MenuService, SchedulerService, WhatsAppService } from '../../application/services';
import { User } from '../../domain';
import { db, type DrizzleDB } from '../database';
import {
  createWhatsAppClient,
  type WhatsAppClient,
} from '../whatsapp';

export interface AppContext {
  readonly whatsappClient: WhatsAppClient;
  readonly whatsappService: WhatsAppService;
  readonly user: User;
  readonly menuService: MenuService;
  readonly schedulerService: SchedulerService;
  readonly db: DrizzleDB;
}

let context: AppContext | null = null;

function runMigrations(): void {
  const migrationsFolder = join(__dirname, '../../../migrations');
  migrate(db, { migrationsFolder });
}

export function Context(): AppContext {
  if (context) return context;

  runMigrations();

  const whatsappClient = createWhatsAppClient();
  const whatsappService = new WhatsAppService(whatsappClient);
  const user = new User(randomUUID());
  const menuService = new MenuService(whatsappService, user);
  const schedulerService = new SchedulerService(whatsappService, user);

  context = Object.freeze({
    whatsappClient,
    whatsappService,
    user,
    menuService,
    schedulerService,
    db,
  });

  return context;
}
