import type { Controller } from '../../core/http/controller';
import { requireControllerUser } from '../../core/http/controller';
import { httpResult } from '../../core/http/httpResult';

/**
 * Compatibility response for the removed user-owned roadmap surface.
 *
 * Authentication is still enforced by the route wrapper. This controller deliberately does not
 * inspect path parameters or request bodies and cannot call a legacy mutation service.
 */
export const retiredOnboardingRoute: Controller = (context) => {
  requireControllerUser(context);
  return httpResult.json(
    {
      error:
        'This session-scoped roadmap endpoint is gone. Roadmaps now update from the knowledge base.',
    },
    410,
    { 'cache-control': 'no-store' },
  );
};
