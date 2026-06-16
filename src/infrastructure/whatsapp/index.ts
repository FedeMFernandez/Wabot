import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { logAlways, logDebug, logError, logWarn } from '../logging';

export type WhatsAppClient = Client;

export function createWhatsAppClient(): WhatsAppClient {
  const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
      type: 'remote',
      remotePath:
        'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1041431076-alpha.html',
    },
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  });

  client.on('qr', (qr: string) => {
    logAlways('Escaneá el código QR con WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    logDebug('Autenticado correctamente.');
  });

  client.on('auth_failure', (msg: string) => {
    logError('Fallo de autenticación:', msg);
  });

  client.on('disconnected', (reason) => {
    logWarn('Cliente desconectado:', reason);
  });

  client.on('change_state', (state) => {
    logDebug('Estado del cliente:', state);
  });

  return client;
}
