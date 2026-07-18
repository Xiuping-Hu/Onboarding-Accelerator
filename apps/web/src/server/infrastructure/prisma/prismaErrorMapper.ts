import { Prisma } from '@/generated/prisma/client';
import { AppError } from '../../core/errors/appError';

export function mapPrismaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002')
      throw AppError.conflict('A record with these values already exists');
    if (error.code === 'P2025') throw AppError.notFound('Record not found');
  }
  throw error;
}
