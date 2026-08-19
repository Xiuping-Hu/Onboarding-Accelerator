import { createRouteHandler } from '@/server/core/http/createRouteHandler';
import { retiredOnboardingRoute } from '@/server/modules/onboarding/retiredOnboarding.controller';

export const GET = createRouteHandler('authenticated', (controllers) => controllers.onboarding.get);
export const POST = createRouteHandler('authenticated', () => retiredOnboardingRoute);
