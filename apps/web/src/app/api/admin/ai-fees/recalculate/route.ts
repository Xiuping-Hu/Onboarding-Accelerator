import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const POST = createRouteHandler(
  'admin',
  (controllers) => controllers.adminAiFees.recalculate,
);
