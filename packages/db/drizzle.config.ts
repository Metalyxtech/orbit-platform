import { defineConfig } from 'drizzle-kit';

// Migrations run as the Neon "owner" role (DATABASE_OWNER_URL), never as app_user.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_OWNER_URL ?? '' },
});
