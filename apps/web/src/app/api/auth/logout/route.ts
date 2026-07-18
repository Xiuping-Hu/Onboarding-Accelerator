import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const POST = createRouteHandler('optional', (controllers) => controllers.auth.logout);
