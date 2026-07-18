import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler('authenticated', (controllers) => controllers.auth.me);
