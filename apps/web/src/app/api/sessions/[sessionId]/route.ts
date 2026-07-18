import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler('authenticated', (controllers) => controllers.sessions.get);
export const PATCH = createRouteHandler(
  'authenticated',
  (controllers) => controllers.sessions.update,
);
export const DELETE = createRouteHandler(
  'authenticated',
  (controllers) => controllers.sessions.remove,
);
