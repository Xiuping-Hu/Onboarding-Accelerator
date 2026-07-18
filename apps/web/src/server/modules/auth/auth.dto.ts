import type { CurrentUserResponse } from '@onboarding/shared';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../auth';

export const MicrosoftStartQuerySchema = z.object({
  returnTo: z.string().optional(),
});

export function toCurrentUserResponseDto(user: AuthenticatedUser): CurrentUserResponse {
  return { user };
}

export function toLogoutResponseDto(): { ok: true } {
  return { ok: true };
}
