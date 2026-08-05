import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler('authenticated', (controllers) => controllers.onboarding.get);
export const POST = createRouteHandler(
  'authenticated',
  (controllers) => controllers.onboarding.activate,
);
