import { createServer } from 'node:http';
import { Context, getCurrentQr, logAlways, logDebug, logError, logFatal } from './src/infrastructure';

const NAVIGATION_ERROR = 'Execution context was destroyed';

function renderQrPage(qr: string | null): string {
  if (!qr) {
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="10" />
<title>Wabot QR</title>
</head>
<body style="font-family: sans-serif; text-align: center; padding: 2rem;">
<h1>Wabot</h1>
<p>Ya autenticado o esperando QR...</p>
</body>
</html>`;
  }
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qr)}`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="10" />
<title>Wabot QR</title>
</head>
<body style="font-family: sans-serif; text-align: center; padding: 2rem;">
<h1>Escaneá el código QR con WhatsApp</h1>
<p>Abrí WhatsApp en tu teléfono y escaneá esta imagen.</p>
<img src="${qrImageUrl}" alt="WhatsApp QR" width="350" height="350" />
</body>
</html>`;
}

function startHealthServer(): void {
  const port = Number(process.env.PORT) || 3000;
  createServer((req, res) => {
    if (req.url === '/qr') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderQrPage(getCurrentQr()));
      return;
    }
    if (req.url === '/qr.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(getCurrentQr() ?? '');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Wabot is running');
  }).listen(port, () => {
    logAlways(`Servidor HTTP escuchando en el puerto ${port}.`);
  });
}

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
  startHealthServer();

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
