import type { PrismaClient } from '@/generated/prisma/client';
import type { ReadinessProbe } from '../../modules/system/system.service';

export class PrismaReadinessProbe implements ReadinessProbe {
  constructor(
    private readonly prisma: PrismaClient,
    readonly isRequired: boolean,
  ) {}

  async check(): Promise<void> {
    await this.prisma.$queryRaw`select 1`;
  }
}
