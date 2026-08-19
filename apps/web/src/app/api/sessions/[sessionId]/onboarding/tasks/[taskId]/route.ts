import { createRouteHandler } from '@/server/core/http/createRouteHandler';
import { retiredOnboardingRoute } from '@/server/modules/onboarding/retiredOnboarding.controller';

export const PATCH = createRouteHandler('authenticated', () => retiredOnboardingRoute);
