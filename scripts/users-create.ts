import 'dotenv/config';
import { getPrismaClient } from '../apps/web/src/server/infrastructure/prisma/prismaClient';
import { PrismaUserRepository } from '../apps/web/src/server/userRepository';

const options = parseArgs(process.argv.slice(2));
if (!options.email) throw new Error('--email is required');
if (!options.name) throw new Error('--name is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const prisma = getPrismaClient({
  connectionString: process.env.DATABASE_URL,
  max: Number.parseInt(process.env.POSTGRES_POOL_MAX ?? '10', 10),
  ssl: process.env.POSTGRES_SSL === 'true',
});

try {
  const user = await new PrismaUserRepository(prisma).create({
    email: options.email,
    displayName: options.name,
    role: options.role || 'user',
    isActive: true,
  });
  console.info('\nMicrosoft user created successfully:');
  console.info(`ID: ${user.id}`);
  console.info(`Email: ${user.email}`);
  console.info(`Name: ${user.displayName}`);
  console.info(`Role: ${user.role}`);
  console.info('The Microsoft tenant/object identity will bind on first sign-in.');
} finally {
  await prisma.$disconnect();
}

function parseArgs(values: string[]): { email?: string; name?: string; role?: string } {
  const parsed: { email?: string; name?: string; role?: string } = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const nextValue = values[index + 1];
    if (value === '--email' && nextValue) {
      parsed.email = nextValue;
      index += 1;
    } else if (value === '--name' && nextValue) {
      parsed.name = nextValue;
      index += 1;
    } else if (value === '--role' && nextValue) {
      parsed.role = nextValue;
      index += 1;
    }
  }
  return parsed;
}
