import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler('optional', (controllers) => controllers.auth.logoutRedirect);
export const POST = createRouteHandler(
  'optional',
  (controllers) => controllers.auth.logoutRedirect,
);
