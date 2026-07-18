import { createRouteHandler } from '@/server/core/http/createRouteHandler';

export const GET = createRouteHandler('admin', (controllers) => controllers.adminAudit.list);
