import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const POST = createRouteHandler(
  'authenticated',
  (controllers) => controllers.ragWorkflows.start,
);
