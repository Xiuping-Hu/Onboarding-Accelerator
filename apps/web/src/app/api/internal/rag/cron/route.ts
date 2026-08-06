import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const GET = createRouteHandler('public', (controllers) => controllers.ragIngestion.run, {
  rateLimit: false,
});
