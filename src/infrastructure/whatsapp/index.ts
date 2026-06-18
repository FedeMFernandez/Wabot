import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { logAlways, logDebug, logError, logWarn } from '../logging';

export type WhatsAppClient = Client;

const WHATSAPP_AUTH_PATH = process.env.WHATSAPP_AUTH_PATH ?? './.wwebjs_auth';

export function createWhatsAppClient(): WhatsAppClient {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: WHATSAPP_AUTH_PATH }),
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
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    logAlways('Escaneá el código QR con WhatsApp.');
    logAlways('Abrí este enlace y escaneá la imagen:');
    logAlways(qrImageUrl);
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
