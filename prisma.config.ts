import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const generationUrl = 'postgresql://prisma:prisma@localhost:5432/prisma_generate';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL || generationUrl,
  },
});
