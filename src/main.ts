import { Context } from './infrastructure';

async function main(): Promise<void> {
  const { whatsappService, menuService } = Context();

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
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
