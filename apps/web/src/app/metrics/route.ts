import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler('public', (controllers) => controllers.system.metrics, {
  logRequest: false,
});
