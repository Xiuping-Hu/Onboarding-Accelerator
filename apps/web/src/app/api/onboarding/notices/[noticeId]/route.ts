import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const PATCH = createRouteHandler(
  'authenticated',
  (controllers) => controllers.staticRoadmap.acknowledgeNotice,
);
