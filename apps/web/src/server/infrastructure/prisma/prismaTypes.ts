import type { Prisma, PrismaClient } from '@/generated/prisma/client';

export type PrismaTransaction = Prisma.TransactionClient;
export type PrismaDatabase = PrismaClient | PrismaTransaction;

export interface PrismaUnitOfWork {
  transaction<T>(callback: (transaction: PrismaTransaction) => Promise<T>): Promise<T>;
}

export class DefaultPrismaUnitOfWork implements PrismaUnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  transaction<T>(callback: (transaction: PrismaTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback);
  }
}
