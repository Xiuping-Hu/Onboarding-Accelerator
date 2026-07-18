import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler('authenticated', (controllers) => controllers.sessions.list);
export const POST = createRouteHandler(
  'authenticated',
  (controllers) => controllers.sessions.create,
);
