import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

export interface PrismaConnectionOptions {
  connectionString: string;
  max?: number;
  ssl?: boolean;
}

type GlobalPrisma = typeof globalThis & {
  __onboardingPrisma?: PrismaClient;
  __onboardingPrismaUrl?: string;
};

export function createPrismaClient(options: PrismaConnectionOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
  });
  return new PrismaClient({ adapter });
}

export function getPrismaClient(options: PrismaConnectionOptions): PrismaClient {
  const globalPrisma = globalThis as GlobalPrisma;
  if (
    !globalPrisma.__onboardingPrisma ||
    globalPrisma.__onboardingPrismaUrl !== options.connectionString
  ) {
    globalPrisma.__onboardingPrisma = createPrismaClient(options);
    globalPrisma.__onboardingPrismaUrl = options.connectionString;
  }
  return globalPrisma.__onboardingPrisma;
}

export async function resetPrismaClientForTests(): Promise<void> {
  const globalPrisma = globalThis as GlobalPrisma;
  await globalPrisma.__onboardingPrisma?.$disconnect();
  delete globalPrisma.__onboardingPrisma;
  delete globalPrisma.__onboardingPrismaUrl;
}
