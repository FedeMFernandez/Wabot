import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

export type WhatsAppClient = Client;

export function createWhatsAppClient(): WhatsAppClient {
  const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
      type: 'remote',
      remotePath:
        'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1038602566-alpha.html',
    },
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr: string) => {
    console.log('Escaneá el código QR con WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    console.log('Autenticado correctamente.');
  });

  client.on('auth_failure', (msg: string) => {
    console.error('Fallo de autenticación:', msg);
  });

  client.on('disconnected', (reason) => {
    console.warn('Cliente desconectado:', reason);
  });

  return client;
}
