import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler('admin', (controllers) => controllers.adminAiFees.listRates);
export const POST = createRouteHandler(
  'admin',
  (controllers) => controllers.adminAiFees.createRate,
);
