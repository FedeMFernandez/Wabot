import type { Config } from 'drizzle-kit';

export default {
  dialect: 'sqlite',
  schema: './src/infrastructure/database/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? './data/wabot.db',
  },
} satisfies Config;
