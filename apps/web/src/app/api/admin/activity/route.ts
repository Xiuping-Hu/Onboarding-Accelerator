import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler('admin', (controllers) => controllers.adminActivity.query);
export const DELETE = createRouteHandler(
  'admin',
  (controllers) => controllers.adminActivity.remove,
);
