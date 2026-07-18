import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const PATCH = createRouteHandler(
  'admin',
  (controllers) => controllers.adminAiFees.updateRate,
);
