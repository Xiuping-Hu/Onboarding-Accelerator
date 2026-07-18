import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler(
  'public',
  (controllers) => controllers.auth.microsoftCallback,
);
