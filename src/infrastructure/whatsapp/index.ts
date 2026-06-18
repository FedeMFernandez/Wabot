import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { logAlways, logDebug, logFatal } from '../logging';
import { setCurrentQr } from './qrStore';

export * from './qrStore';

export type WhatsAppClient = Client;

const WHATSAPP_AUTH_PATH = process.env.WHATSAPP_AUTH_PATH ?? './.wwebjs_auth';

const SESSION_CLEANUP_DELAY_MS = 2000;
const SESSION_CLEANUP_RETRIES = 5;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupSessionDir(): Promise<void> {
  const sessionDir = path.join(WHATSAPP_AUTH_PATH, 'session');
  await delay(SESSION_CLEANUP_DELAY_MS);
  for (let attempt = 1; attempt <= SESSION_CLEANUP_RETRIES; attempt++) {
    try {
      await rm(sessionDir, { recursive: true, force: true });
      logDebug('Directorio de sesión limpiado correctamente.');
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === SESSION_CLEANUP_RETRIES) {
        logAlways('No se pudo limpiar el directorio de sesión tras varios intentos:', message);
        return;
      }
      logDebug(`Reintentando limpieza de sesión (intento ${attempt}):`, message);
      await delay(SESSION_CLEANUP_DELAY_MS);
    }
  }
}

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
    setCurrentQr(qr);
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    logAlways('Escaneá el código QR con WhatsApp.');
    logAlways('Abrí este enlace y escaneá la imagen:');
    logAlways(qrImageUrl);
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    setCurrentQr(null);
    logAlways('Autenticado correctamente.');
  });

  client.on('ready', () => {
    setCurrentQr(null);
  });

  client.on('auth_failure', (msg: string) => {
    logFatal('Fallo de autenticación:', msg);
  });

  client.on('loading_screen', (percent, message) => {
    logAlways('Cargando WhatsApp:', percent, message);
  });

  client.on('disconnected', (reason) => {
    logAlways('Cliente desconectado:', reason);
    void cleanupSessionDir();
  });

  client.on('change_state', (state) => {
    logAlways('Estado del cliente:', state);
  });

  return client;
}
