import { Context, logDebug, logError, logFatal } from './infrastructure';

const NAVIGATION_ERROR = 'Execution context was destroyed';

function isRecoverableNavigationError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.includes(NAVIGATION_ERROR);
}

process.on('unhandledRejection', (reason) => {
  if (isRecoverableNavigationError(reason)) {
    logDebug('Error de navegación recuperable, ignorado:', reason);
    return;
  }
  logError('Rechazo no manejado:', reason);
});

process.on('uncaughtException', (err) => {
  if (isRecoverableNavigationError(err)) {
    logDebug('Excepción de navegación recuperable, ignorada:', err.message);
    return;
  }
  logFatal('Excepción no capturada:', err);
  process.exit(1);
});

async function main(): Promise<void> {
  const { whatsappService, menuService, schedulerService } = Context();

  whatsappService.onMessage(async (message) => {
    if (message.body === '!ping') {
      await message.reply('pong');
    }
  });

  whatsappService.onMessageFromMe(async (message) => {
    if (await whatsappService.isSelfChat(message)) {
      await menuService.handle(message);
    }
  });

  await whatsappService.start();
  schedulerService.start();
}

main().catch((err) => {
  logFatal('Error fatal:', err);
  process.exit(1);
});
