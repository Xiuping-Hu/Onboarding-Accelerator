import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler(
  'authenticated',
  (controllers) => controllers.ragWorkflows.get,
);
