import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler(
  'admin',
  (controllers) => controllers.adminAiFees.listAdjustments,
);
export const POST = createRouteHandler(
  'admin',
  (controllers) => controllers.adminAiFees.createAdjustment,
);
