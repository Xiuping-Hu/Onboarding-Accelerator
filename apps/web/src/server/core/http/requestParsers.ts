import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { AppError } from '../errors/appError';

export async function parseJsonBody<T extends z.ZodType>(
  request: NextRequest,
  schema: T,
): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw AppError.validation('Invalid request');
  }
  return schema.parse(body);
}

export function parseParams<T extends z.ZodType>(
  params: Record<string, string>,
  schema: T,
): z.output<T> {
  return schema.parse(params);
}

export function parseQuery<T extends z.ZodType>(request: NextRequest, schema: T): z.output<T> {
  return schema.parse(Object.fromEntries(request.nextUrl.searchParams.entries()));
}
